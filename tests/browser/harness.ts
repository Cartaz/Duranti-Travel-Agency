import Dexie from 'dexie'
import { DB_NAME, DB_VERSION, db } from '../../src/data/db/dtagency-db'
import { readMediaFile, writeMediaFile } from '../../src/data/opfs/opfs-store'
import { dayRepository } from '../../src/data/repositories/day-repository'
import { plannerBlockRepository } from '../../src/data/repositories/block-repository'
import { itineraryRepository } from '../../src/data/repositories/itinerary-repository'
import { mediaFileRepository } from '../../src/data/repositories/media-repository'
import { dayApplication } from '../../src/composition/days'
import { travelerApplication } from '../../src/composition/travelers'
import { tripApplication } from '../../src/composition/trips'
import { reservationBlockRepository } from '../../src/data/repositories/reservation-block-repository'
import {
  ORPHAN_GRACE_MS,
  reclaimMediaStorage,
  scanReclaimableMediaStorage,
} from '../../src/data/storage/media-integrity'
import { prepareVaultExport, loadPreparedVaultFile } from '../../src/vault/export'
import { stageVaultImport } from '../../src/vault/validated-import'
import {
  abandonInterruptedVaultRestore,
  commitStagedVaultImport,
  fingerprintLiveDatabase,
  hasInterruptedVaultRestore,
  recoverInterruptedVaultRestore,
  STALE_VAULT_STAGING_MS,
  sweepStaleVaultStaging,
} from '../../src/vault/restore'

interface BrowserTestResult {
  name: string
  ok: boolean
  error?: string
}

declare global {
  interface Window {
    __DTAGENCY_BROWSER_RESULTS__?: BrowserTestResult[]
    __DTAGENCY_BROWSER_DONE__?: boolean
  }
}

const results: BrowserTestResult[] = []
const resultElement = document.querySelector<HTMLPreElement>('#result')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function run(name: string, test: () => Promise<void>): Promise<void> {
  try {
    await test()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({
      name,
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    })
  }
}

async function ensureInstallationRow(): Promise<void> {
  await db.appMeta.put({ key: 'installationId', value: 'browser-harness' })
}

async function removeOpfsRoot(): Promise<void> {
  const root = await navigator.storage.getDirectory()
  try {
    await root.removeEntry('dtagency', { recursive: true })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
  }
}

async function resetEnvironment(): Promise<void> {
  db.close()
  await db.delete()
  await db.open()
  await removeOpfsRoot()
}

function utf8(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value)
}

async function readText(file: File): Promise<string> {
  return new TextDecoder().decode(await file.arrayBuffer())
}

async function copyFileToMemory(file: File): Promise<File> {
  const bytes = await file.arrayBuffer()
  return new File([bytes], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  })
}

async function writeOpfsFile(directory: FileSystemDirectoryHandle, name: string, body: BlobPart): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(body)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      /* preserve original error */
    }
    throw error
  }
}

async function seedRoundTripState(): Promise<{ tripId: string; mediaId: string; mediaText: string }> {
  const now = new Date().toISOString()
  const tripId = 'browser-trip-1'
  const mediaId = 'browser-media-1'
  const mediaText = 'DTAgency browser Vault payload'
  const opfsPath = await writeMediaFile(mediaId, new Blob([mediaText], { type: 'text/plain' }))

  await db.trips.add({
    id: tripId,
    title: 'Browser integration trip',
    status: 'planned',
    createdAt: now,
    updatedAt: now,
  })
  await db.media.add({
    id: mediaId,
    tripId,
    kind: 'document',
    mimeType: 'text/plain',
    originalName: 'payload.txt',
    sizeBytes: utf8(mediaText).byteLength,
    opfsPath,
    createdAt: now,
    updatedAt: now,
  })

  return { tripId, mediaId, mediaText }
}

async function tamperManifestCiphertext(file: File): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magicBytes = 8
  const headerLength = view.getUint32(magicBytes, false)
  const manifestFrameOffset = magicBytes + 4 + headerLength
  const ciphertextOffset = manifestFrameOffset + 1 + 12 + 4
  assert(ciphertextOffset < bytes.length, 'Vault fixture is too short to contain manifest ciphertext.')
  bytes[ciphertextOffset] ^= 0x01
  return new File([bytes], 'tampered.dtagency', { type: file.type })
}

interface InterruptedRestoreFixtureOptions {
  phase?: 'files-mutating' | 'files-promoted'
  targetDatabaseSha256?: string
  liveText?: string
}

async function createInterruptedRestoreFixture(options: InterruptedRestoreFixtureOptions = {}): Promise<string> {
  const restoreId = 'browser-restore-1'
  const stageId = 'browser-stage-1'
  const archiveId = 'browser-archive-1'
  const mediaId = 'browser-recovery-media'
  const originalText = 'original-before-interrupted-restore'

  await writeMediaFile(mediaId, new Blob([options.liveText ?? 'mutated-during-restore'], { type: 'text/plain' }))

  const root = await navigator.storage.getDirectory()
  const dtagency = await root.getDirectoryHandle('dtagency', { create: true })
  const backupRoot = await dtagency.getDirectoryHandle('vault-restore-backup', { create: true })
  const backup = await backupRoot.getDirectoryHandle(restoreId, { create: true })
  const files = await backup.getDirectoryHandle('files', { create: true })
  await writeOpfsFile(files, '00000000.bin', new Blob([originalText], { type: 'text/plain' }))

  await writeOpfsFile(
    backup,
    'manifest.json',
    JSON.stringify({
      version: 1,
      restoreId,
      createdAt: new Date().toISOString(),
      files: [
        {
          index: 0,
          namespace: 'media',
          path: `dtagency/media/${mediaId}/original`,
          sizeBytes: utf8(originalText).byteLength,
        },
      ],
    }),
  )

  const state = await dtagency.getDirectoryHandle('vault-restore-state', { create: true })
  const timestamp = new Date().toISOString()
  await writeOpfsFile(
    state,
    'current.json',
    JSON.stringify({
      version: 1,
      restoreId,
      stageId,
      archiveId,
      targetDatabaseSha256: options.targetDatabaseSha256 ?? '0'.repeat(64),
      phase: options.phase ?? 'files-mutating',
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  )

  return mediaId
}

await run('IndexedDB upgrades the v1 baseline to v2 without rewriting user rows', async () => {
  db.close()
  await db.delete()
  const legacy = new Dexie(DB_NAME)
  legacy.version(1).stores({
    blocks: 'id, tripId, dayId, parentBlockId, [dayId+position], updatedAt',
    media: 'id, tripId, dayId, blockId, kind, sha256, updatedAt',
  })
  await legacy.open()
  const now = new Date().toISOString()
  const placeId = 'legacy-place'
  await legacy.table('blocks').add({
    id: 'legacy-block',
    tripId: 'legacy-trip',
    dayId: 'legacy-day',
    type: 'place',
    position: 1,
    content: { placeId },
    createdAt: now,
    updatedAt: now,
  })
  await legacy.table('media').add({
    id: 'legacy-media',
    tripId: 'legacy-trip',
    dayId: 'legacy-day',
    kind: 'image',
    placeId,
    mimeType: 'image/jpeg',
    originalName: 'legacy.jpg',
    sizeBytes: 1,
    opfsPath: 'dtagency/media/legacy-media/original',
    createdAt: now,
    updatedAt: now,
  })
  legacy.close()

  await db.open()
  assert(DB_NAME === 'dtagency', `Unexpected DB_NAME ${DB_NAME}.`)
  assert(DB_VERSION === 2, `Unexpected DB_VERSION ${DB_VERSION}.`)
  assert(db.verno === 2, `Unexpected Dexie version ${db.verno}.`)
  const tableNames = db.tables.map((table) => table.name).sort()
  assert(tableNames.length === 15, `Expected 15 tables after migration, got ${tableNames.length}.`)
  assert(
    tableNames.includes('appMeta') && tableNames.includes('travelerDocuments'),
    'Required tables are missing after migration.',
  )
  const blocks = await db.blocks.where('content.placeId').equals(placeId).toArray()
  const media = await db.media.where('placeId').equals(placeId).toArray()
  assert(
    blocks.length === 1 && blocks[0]?.id === 'legacy-block',
    'v1 block row or its new nested index was lost during migration.',
  )
  assert(
    media.length === 1 && media[0]?.id === 'legacy-media',
    'v1 media row or its new place index was lost during migration.',
  )
})

await run('OPFS media CRUD uses the DTAgency namespace', async () => {
  await resetEnvironment()
  const mediaId = 'browser-opfs-1'
  const expected = 'browser-opfs-payload'
  const path = await writeMediaFile(mediaId, new Blob([expected], { type: 'text/plain' }))
  assert(path === `dtagency/media/${mediaId}/original`, `Unexpected media path ${path}.`)
  const stored = await readMediaFile(mediaId)
  assert((await readText(stored)) === expected, 'OPFS round-trip changed media bytes.')
})

await run('Concurrent ordered writes stay unique and repair legacy duplicate order values', async () => {
  await resetEnvironment()
  const now = new Date().toISOString()
  const tripId = 'browser-concurrent-trip'
  await db.trips.add({
    id: tripId,
    title: 'Concurrent allocation trip',
    status: 'planned',
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    createdAt: now,
    updatedAt: now,
  })

  const [firstDay, secondDay] = await Promise.all([
    dayRepository.createForTrip({ id: 'concurrent-day-a', tripId, date: '2026-09-01', createdAt: now, updatedAt: now }),
    dayRepository.createForTrip({ id: 'concurrent-day-b', tripId, date: '2026-09-02', createdAt: now, updatedAt: now }),
  ])
  const concurrentSequences = [firstDay.sequence, secondDay.sequence].sort((a, b) => a - b)
  assert(
    concurrentSequences.join(',') === '1,2',
    `Concurrent days received invalid sequences ${concurrentSequences.join(',')}.`,
  )

  await db.days.bulkPut([
    { ...firstDay, sequence: 9 },
    { ...secondDay, sequence: 9 },
  ])
  const thirdDay = await dayRepository.createForTrip({
    id: 'concurrent-day-c',
    tripId,
    date: '2026-09-03',
    createdAt: now,
    updatedAt: now,
  })
  const repairedSequences = (await dayRepository.listByTrip(tripId)).map((day) => day.sequence).sort((a, b) => a - b)
  assert(
    thirdDay.sequence === 3 && repairedSequences.join(',') === '1,2,3',
    `Day sequence repair failed: ${repairedSequences.join(',')}.`,
  )

  const dayId = firstDay.id
  const [firstBlock, secondBlock] = await Promise.all([
    plannerBlockRepository.createAtEnd({
      id: 'concurrent-block-a',
      tripId,
      dayId,
      type: 'text',
      content: {},
      createdAt: now,
      updatedAt: now,
    }),
    plannerBlockRepository.createAtEnd({
      id: 'concurrent-block-b',
      tripId,
      dayId,
      type: 'text',
      content: {},
      createdAt: now,
      updatedAt: now,
    }),
  ])
  const concurrentPositions = [firstBlock.position, secondBlock.position].sort((a, b) => a - b)
  assert(
    concurrentPositions.join(',') === '1,2',
    `Concurrent blocks received invalid positions ${concurrentPositions.join(',')}.`,
  )

  await db.blocks.bulkPut([
    { ...firstBlock, position: 8 },
    { ...secondBlock, position: 8 },
  ])
  const thirdBlock = await plannerBlockRepository.createAtEnd({
    id: 'concurrent-block-c',
    tripId,
    dayId,
    type: 'text',
    content: {},
    createdAt: now,
    updatedAt: now,
  })
  const repairedBlockPositions = (await plannerBlockRepository.listByDay(dayId))
    .map((block) => block.position)
    .sort((a, b) => a - b)
  assert(
    thirdBlock.position === 3 && repairedBlockPositions.join(',') === '1,2,3',
    `Block position repair failed: ${repairedBlockPositions.join(',')}.`,
  )

  const [firstItinerary, secondItinerary] = await Promise.all([
    itineraryRepository.saveManual({
      id: 'concurrent-itinerary-a',
      tripId,
      dayId,
      title: 'Prima tappa',
      type: 'custom',
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    }),
    itineraryRepository.saveManual({
      id: 'concurrent-itinerary-b',
      tripId,
      dayId,
      title: 'Seconda tappa',
      type: 'custom',
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    }),
  ])
  const concurrentItineraryPositions = [firstItinerary.position, secondItinerary.position].sort(
    (a, b) => (a ?? 0) - (b ?? 0),
  )
  assert(
    concurrentItineraryPositions.join(',') === '1,2',
    `Concurrent itinerary items received invalid positions ${concurrentItineraryPositions.join(',')}.`,
  )

  await db.itineraries.bulkPut([
    { ...firstItinerary, position: 7 },
    { ...secondItinerary, position: 7 },
  ])
  const thirdItinerary = await itineraryRepository.saveManual({
    id: 'concurrent-itinerary-c',
    tripId,
    dayId,
    title: 'Terza tappa',
    type: 'custom',
    status: 'planned',
    createdAt: now,
    updatedAt: now,
  })
  const repairedItineraryPositions = (await itineraryRepository.listByDay(dayId))
    .filter((item) => !item.startsAt && !item.reservationId && !item.blockId)
    .map((item) => item.position)
    .sort((a, b) => (a ?? 0) - (b ?? 0))
  assert(
    thirdItinerary.position === 3 && repairedItineraryPositions.join(',') === '1,2,3',
    `Itinerary position repair failed: ${repairedItineraryPositions.join(',')}.`,
  )

  const timedItinerary = await itineraryRepository.saveManual({
    id: 'timed-itinerary',
    tripId,
    dayId,
    title: 'Tappa con orario',
    type: 'custom',
    status: 'planned',
    startsAt: '2026-09-01T10:00',
    createdAt: now,
    updatedAt: now,
  })
  assert(timedItinerary.position === undefined, 'Timed manual itinerary retained an unnecessary manual-order position.')
})

await run('Vault export wipe import restore round-trips IndexedDB and OPFS', async () => {
  await resetEnvironment()
  const seeded = await seedRoundTripState()
  const passphrase = 'browser-integration-passphrase-2026'
  const prepared = await prepareVaultExport(passphrase)
  const opfsVaultFile = await loadPreparedVaultFile(prepared)
  const vaultFile = await copyFileToMemory(opfsVaultFile)
  assert(prepared.sourceFileCount === 1, `Expected one managed file, got ${prepared.sourceFileCount}.`)

  await resetEnvironment()
  assert((await db.trips.count()) === 0, 'Database wipe did not clear trips.')

  const staged = await stageVaultImport(vaultFile, passphrase)
  const restored = await commitStagedVaultImport(staged, { mode: 'replace' })
  assert(restored.databaseVerified, 'Vault restore database verification failed.')
  assert(restored.filesVerified, 'Vault restore OPFS verification failed.')

  const trip = await db.trips.get(seeded.tripId)
  assert(trip?.title === 'Browser integration trip', 'Trip did not survive Vault round-trip.')
  assert(
    (await readText(await readMediaFile(seeded.mediaId))) === seeded.mediaText,
    'Media bytes did not survive Vault round-trip.',
  )
})

await run('Tampered Vault manifest fails before mutating live state', async () => {
  await resetEnvironment()
  const seeded = await seedRoundTripState()
  const passphrase = 'browser-integration-passphrase-2026'
  const prepared = await prepareVaultExport(passphrase)
  const vaultFile = await loadPreparedVaultFile(prepared)
  const tampered = await tamperManifestCiphertext(vaultFile)

  let rejected = false
  try {
    await stageVaultImport(tampered, passphrase)
  } catch {
    rejected = true
  }
  assert(rejected, 'Tampered Vault was unexpectedly accepted.')
  assert(Boolean(await db.trips.get(seeded.tripId)), 'Tampered import mutated live IndexedDB.')
  assert(
    (await readText(await readMediaFile(seeded.mediaId))) === seeded.mediaText,
    'Tampered import mutated live OPFS.',
  )
})

await run('Interrupted files-mutating restore rolls OPFS back from journal backup', async () => {
  await resetEnvironment()
  const mediaId = await createInterruptedRestoreFixture()
  const result = await recoverInterruptedVaultRestore()
  assert(result === 'rolled-back', `Expected rolled-back recovery, got ${result}.`)
  assert(
    (await readText(await readMediaFile(mediaId))) === 'original-before-interrupted-restore',
    'Recovery did not restore original OPFS bytes.',
  )
})

async function seedReservationWithAttachment(): Promise<{ blockId: string; reservationId: string; mediaId: string }> {
  const now = new Date().toISOString()
  const tripId = 'purge-trip'
  const dayId = 'purge-day'
  const blockId = 'purge-block'
  const reservationId = 'purge-reservation'
  const mediaId = 'purge-attachment'
  const opfsPath = await writeMediaFile(mediaId, new Blob(['ticket-bytes'], { type: 'application/pdf' }))
  await db.trips.add({
    id: tripId,
    title: 'Purge trip',
    status: 'planned',
    startDate: '2026-12-01',
    endDate: '2026-12-02',
    createdAt: now,
    updatedAt: now,
  })
  await db.days.add({ id: dayId, tripId, date: '2026-12-01', sequence: 1, createdAt: now, updatedAt: now })
  await db.blocks.add({
    id: blockId,
    tripId,
    dayId,
    type: 'activity',
    position: 1,
    content: { reservationId },
    createdAt: now,
    updatedAt: now,
  })
  await db.reservations.add({
    id: reservationId,
    tripId,
    dayId,
    type: 'activity',
    title: 'Museo',
    attachmentMediaId: mediaId,
    createdAt: now,
    updatedAt: now,
  })
  await db.media.add({
    id: mediaId,
    tripId,
    dayId,
    blockId,
    kind: 'document',
    mimeType: 'application/pdf',
    originalName: 'ticket.pdf',
    sizeBytes: utf8('ticket-bytes').byteLength,
    opfsPath,
    createdAt: now,
    updatedAt: now,
  })
  return { blockId, reservationId, mediaId }
}

async function assertVaultStillValidates(): Promise<void> {
  const passphrase = 'browser-integration-passphrase-2026'
  const prepared = await prepareVaultExport(passphrase)
  const staged = await stageVaultImport(await loadPreparedVaultFile(prepared), passphrase)
  assert(staged.manifest.database.tables.length > 0, 'Vault staging returned no tables.')
}

async function opfsEntryExists(segments: string[]): Promise<boolean> {
  let current = await navigator.storage.getDirectory()
  for (const [index, segment] of segments.entries()) {
    try {
      if (index === segments.length - 1) {
        try {
          await current.getFileHandle(segment)
        } catch {
          await current.getDirectoryHandle(segment)
        }
        return true
      }
      current = await current.getDirectoryHandle(segment)
    } catch {
      return false
    }
  }
  return true
}

await run('files-promoted restore whose database commit won is finalized, not rolled back', async () => {
  await resetEnvironment()
  await ensureInstallationRow()
  const mediaId = await createInterruptedRestoreFixture({
    phase: 'files-promoted',
    targetDatabaseSha256: await fingerprintLiveDatabase(),
    liveText: 'restored-bytes-from-vault',
  })
  const result = await recoverInterruptedVaultRestore()
  assert(result === 'finalized-committed', `Expected finalized-committed recovery, got ${result}.`)
  assert(
    (await readText(await readMediaFile(mediaId))) === 'restored-bytes-from-vault',
    'Finalization replaced restored OPFS bytes with the rollback copy.',
  )
  assert(!(await hasInterruptedVaultRestore()), 'Finalized restore left its journal behind.')
  assert(
    !(await opfsEntryExists(['dtagency', 'vault-restore-backup', 'browser-restore-1'])),
    'Rollback copy was not cleaned up.',
  )
})

await run('files-promoted restore whose database commit lost rolls files back', async () => {
  await resetEnvironment()
  const mediaId = await createInterruptedRestoreFixture({
    phase: 'files-promoted',
    liveText: 'restored-bytes-from-vault',
  })
  const result = await recoverInterruptedVaultRestore()
  assert(result === 'rolled-back', `Expected rolled-back recovery, got ${result}.`)
  assert(
    (await readText(await readMediaFile(mediaId))) === 'original-before-interrupted-restore',
    'Rollback did not restore the original OPFS bytes.',
  )
})

await run('Unrecoverable restore journal can be abandoned without deleting the rollback copy', async () => {
  await resetEnvironment()
  await createInterruptedRestoreFixture()
  const root = await navigator.storage.getDirectory()
  const backup = await (
    await (await root.getDirectoryHandle('dtagency')).getDirectoryHandle('vault-restore-backup')
  ).getDirectoryHandle('browser-restore-1')
  await backup.removeEntry('manifest.json')

  let failed = false
  try {
    await recoverInterruptedVaultRestore()
  } catch {
    failed = true
  }
  assert(failed, 'Recovery with a corrupt rollback copy unexpectedly succeeded.')
  assert(await hasInterruptedVaultRestore(), 'Interrupted restore was not detected.')

  await abandonInterruptedVaultRestore()
  assert(!(await hasInterruptedVaultRestore()), 'Abandon left the journal in place.')
  assert(
    await opfsEntryExists(['dtagency', 'vault-restore-backup', 'browser-restore-1', 'files', '00000000.bin']),
    'Abandon deleted the rollback copy.',
  )
  assert((await recoverInterruptedVaultRestore()) === 'none', 'Recovery still found a journal after abandon.')
})

await run('Stale Vault staging is swept while fresh and journaled stages survive', async () => {
  await resetEnvironment()
  const root = await navigator.storage.getDirectory()
  const dtagency = await root.getDirectoryHandle('dtagency', { create: true })
  const exports = await dtagency.getDirectoryHandle('vault-staging', { create: true })
  await writeOpfsFile(exports, 'DTAgency-abandoned.dtagency', new Blob(['encrypted-export']))
  const imports = await dtagency.getDirectoryHandle('vault-import-staging', { create: true })
  for (const stageId of ['abandoned-stage', 'journaled-stage']) {
    const stage = await imports.getDirectoryHandle(stageId, { create: true })
    await writeOpfsFile(stage, 'created', new Blob([]))
  }
  const state = await dtagency.getDirectoryHandle('vault-restore-state', { create: true })
  const timestamp = new Date().toISOString()
  await writeOpfsFile(
    state,
    'current.json',
    JSON.stringify({
      version: 1,
      restoreId: 'sweep-restore',
      stageId: 'journaled-stage',
      archiveId: 'sweep-archive',
      targetDatabaseSha256: '0'.repeat(64),
      phase: 'committed',
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  )

  const fresh = await sweepStaleVaultStaging(Date.now())
  assert(fresh.removedExports === 0 && fresh.removedImportStages === 0, 'Fresh staging was swept.')

  const stale = await sweepStaleVaultStaging(Date.now() + STALE_VAULT_STAGING_MS + 60_000)
  assert(stale.removedExports === 1, `Expected one stale export removed, got ${stale.removedExports}.`)
  assert(stale.removedImportStages === 1, `Expected one stale import stage removed, got ${stale.removedImportStages}.`)
  assert(!(await opfsEntryExists(['dtagency', 'vault-import-staging', 'abandoned-stage'])), 'Abandoned stage survived.')
  assert(await opfsEntryExists(['dtagency', 'vault-import-staging', 'journaled-stage']), 'Journaled stage was swept.')
})

await run('Purge keeps tombstoned media that a record still references', async () => {
  await resetEnvironment()
  const { mediaId, reservationId } = await seedReservationWithAttachment()
  const now = new Date().toISOString()
  const media = await db.media.get(mediaId)
  await db.media.put({ ...media!, deletedAt: now, updatedAt: now })
  const reservation = await db.reservations.get(reservationId)
  await db.reservations.put({ ...reservation!, deletedAt: now, updatedAt: now })

  assert((await mediaFileRepository.purge(mediaId)) === 'referenced', 'Referenced media was purged.')
  assert(Boolean(await db.media.get(mediaId)), 'Referenced media row disappeared.')
  assert((await readText(await readMediaFile(mediaId))) === 'ticket-bytes', 'Referenced media bytes disappeared.')
  await assertVaultStillValidates()
})

await run('Deleting a reservation block detaches its attachment so it can be purged safely', async () => {
  await resetEnvironment()
  const { blockId, reservationId, mediaId } = await seedReservationWithAttachment()
  const detached = await reservationBlockRepository.softDeleteReservationBlock(blockId, 'purge-trip', 'purge-day')
  assert(detached === mediaId, `Expected detached attachment ${mediaId}, got ${detached}.`)
  const reservation = await db.reservations.get(reservationId)
  assert(
    Boolean(reservation?.deletedAt) && reservation?.attachmentMediaId === undefined,
    'Tombstoned reservation still links the attachment.',
  )

  assert((await mediaFileRepository.purge(mediaId)) === 'purged', 'Detached attachment was not purged.')
  assert(!(await db.media.get(mediaId)), 'Purged media row survived.')
  let fileGone = false
  try {
    await readMediaFile(mediaId)
  } catch {
    fileGone = true
  }
  assert(fileGone, 'Purged media bytes survived.')
  await assertVaultStillValidates()
})

await run('Storage reclamation frees deleted and orphan media but keeps active bytes', async () => {
  await resetEnvironment()
  const seeded = await seedRoundTripState()
  const now = new Date().toISOString()
  const deletedPath = await writeMediaFile('deleted-media', new Blob(['deleted-bytes']))
  await db.media.add({
    id: 'deleted-media',
    tripId: seeded.tripId,
    kind: 'document',
    mimeType: 'text/plain',
    sizeBytes: 13,
    opfsPath: deletedPath,
    createdAt: now,
    updatedAt: now,
    deletedAt: now,
  })
  await writeMediaFile('orphan-media', new Blob(['orphan']))
  const root = await navigator.storage.getDirectory()
  const privateDocuments = await (
    await (await root.getDirectoryHandle('dtagency', { create: true })).getDirectoryHandle('private', { create: true })
  ).getDirectoryHandle('traveler-documents', { create: true })
  const orphanDocument = await privateDocuments.getDirectoryHandle('orphan-document', { create: true })
  await writeOpfsFile(orphanDocument, 'attachment.bin', new Blob(['secret']))

  // Fresh directories may belong to an upload still in progress: not reclaimable yet.
  const fresh = await scanReclaimableMediaStorage()
  assert(fresh.orphanDirectoryIds.length === 0, 'A freshly written media directory was treated as an orphan.')
  assert(fresh.orphanPrivateDocumentIds.length === 0, 'A freshly written document directory was treated as an orphan.')

  const later = Date.now() + ORPHAN_GRACE_MS + 60_000
  const scan = await scanReclaimableMediaStorage(later)
  assert(
    scan.reclaimableMediaIds.join() === 'deleted-media',
    `Unexpected reclaimable ids ${scan.reclaimableMediaIds.join()}.`,
  )
  assert(scan.orphanDirectoryIds.join() === 'orphan-media', `Unexpected orphan ids ${scan.orphanDirectoryIds.join()}.`)
  assert(scan.orphanPrivateDocumentIds.join() === 'orphan-document', 'Orphan document directory was not found.')
  assert(scan.reclaimableBytes === 13 + 6 + 6, `Unexpected reclaimable bytes ${scan.reclaimableBytes}.`)

  const result = await reclaimMediaStorage(scan, later)
  assert(result.purgedMediaCount === 1 && result.removedOrphanCount === 2, 'Reclamation did not remove every item.')
  assert(result.freedBytes === 25, `Unexpected freed bytes ${result.freedBytes}.`)
  assert((await readText(await readMediaFile(seeded.mediaId))) === seeded.mediaText, 'Active media bytes were removed.')
  const after = await scanReclaimableMediaStorage(later)
  assert(
    after.reclaimableMediaIds.length === 0 && after.orphanDirectoryIds.length === 0,
    'Reclamation left items behind.',
  )
  await assertVaultStillValidates()
})

async function seedDayContent(): Promise<{ mediaIds: string[] }> {
  const { mediaId: attachmentId } = await seedReservationWithAttachment()
  const now = new Date().toISOString()
  const photoPath = await writeMediaFile('purge-day-photo', new Blob(['photo-bytes'], { type: 'image/jpeg' }))
  await db.media.add({
    id: 'purge-day-photo',
    tripId: 'purge-trip',
    dayId: 'purge-day',
    kind: 'image',
    mimeType: 'image/jpeg',
    sizeBytes: 11,
    opfsPath: photoPath,
    createdAt: now,
    updatedAt: now,
  })
  await db.itineraries.add({
    id: 'purge-itinerary',
    tripId: 'purge-trip',
    dayId: 'purge-day',
    blockId: 'purge-block',
    reservationId: 'purge-reservation',
    title: 'Museo',
    createdAt: now,
    updatedAt: now,
  })
  await db.expenses.add({
    id: 'purge-expense',
    tripId: 'purge-trip',
    dayId: 'purge-day',
    amountMinor: 1200,
    currency: 'EUR',
    paidByTravelerId: 'purge-traveler',
    createdAt: now,
    updatedAt: now,
  })
  await db.travelers.add({
    id: 'purge-traveler',
    firstName: 'Anna',
    lastName: 'Rossi',
    displayName: 'Anna Rossi',
    createdAt: now,
    updatedAt: now,
  })
  await db.tripTravelers.add({
    id: 'purge-membership',
    tripId: 'purge-trip',
    travelerId: 'purge-traveler',
    role: 'owner',
    createdAt: now,
    updatedAt: now,
  })
  return { mediaIds: [attachmentId, 'purge-day-photo'] }
}

async function assertAllTombstoned(
  table: { get(id: string): Promise<{ deletedAt?: string } | undefined> },
  ids: string[],
  label: string,
): Promise<void> {
  for (const id of ids) assert(Boolean((await table.get(id))?.deletedAt), `${label} ${id} was not tombstoned.`)
}

await run('Deleting a day tombstones its content, purges its files and keeps the Vault valid', async () => {
  await resetEnvironment()
  const { mediaIds } = await seedDayContent()
  const outcome = await dayApplication.deleteTripDay('purge-trip', 'purge-day')
  assert(outcome.pendingFileCleanup === 0, `Unexpected pending cleanup ${outcome.pendingFileCleanup}.`)
  await assertAllTombstoned(db.days, ['purge-day'], 'Day')
  await assertAllTombstoned(db.blocks, ['purge-block'], 'Block')
  await assertAllTombstoned(db.reservations, ['purge-reservation'], 'Reservation')
  await assertAllTombstoned(db.itineraries, ['purge-itinerary'], 'Itinerary')
  await assertAllTombstoned(db.expenses, ['purge-expense'], 'Expense')
  assert(
    (await db.reservations.get('purge-reservation'))?.attachmentMediaId === undefined,
    'Deleted reservation kept its attachment link.',
  )
  for (const id of mediaIds) assert(!(await db.media.get(id)), `Media ${id} was not purged.`)
  assert(!(await db.trips.get('purge-trip'))?.deletedAt, 'Deleting a day deleted its trip.')
  assert((await dayApplication.listTripDays('purge-trip')).length === 0, 'Deleted day is still listed.')
  await assertVaultStillValidates()
})

await run('Deleting an archived trip cascades to every row and keeps the Vault valid', async () => {
  await resetEnvironment()
  await seedDayContent()
  let rejected = false
  try {
    await tripApplication.deleteArchivedTrip('purge-trip')
  } catch {
    rejected = true
  }
  assert(rejected, 'A non-archived trip was deleted.')
  await tripApplication.archiveTrip('purge-trip')
  await tripApplication.deleteArchivedTrip('purge-trip')
  await assertAllTombstoned(db.trips, ['purge-trip'], 'Trip')
  await assertAllTombstoned(db.days, ['purge-day'], 'Day')
  await assertAllTombstoned(db.tripTravelers, ['purge-membership'], 'Membership')
  await assertAllTombstoned(db.expenses, ['purge-expense'], 'Expense')
  assert(!(await db.travelers.get('purge-traveler'))?.deletedAt, 'Deleting a trip deleted a traveler profile.')
  assert((await tripApplication.listArchivedTrips()).length === 0, 'Deleted trip is still archived.')
  await assertVaultStillValidates()
})

await run('Deleting a traveler removes memberships and documents but keeps expense history valid', async () => {
  await resetEnvironment()
  await seedDayContent()
  const now = new Date().toISOString()
  await db.travelerDocuments.add({
    id: 'purge-document',
    travelerId: 'purge-traveler',
    type: 'passport',
    encryptedPayload: {
      version: 1,
      algorithm: 'AES-GCM',
      tagLength: 128,
      ivB64: 'AAAAAAAAAAAAAAAA',
      ciphertextB64: 'AAAA',
    },
    createdAt: now,
    updatedAt: now,
  })
  const outcome = await travelerApplication.deleteTraveler('purge-traveler')
  assert(outcome.pendingFileCleanup === 0, `Unexpected pending cleanup ${outcome.pendingFileCleanup}.`)
  await assertAllTombstoned(db.travelers, ['purge-traveler'], 'Traveler')
  await assertAllTombstoned(db.tripTravelers, ['purge-membership'], 'Membership')
  assert(!(await db.travelerDocuments.get('purge-document')), 'Traveler document was not purged.')
  const expense = await db.expenses.get('purge-expense')
  assert(expense?.paidByTravelerId === 'purge-traveler' && !expense.deletedAt, 'Expense history was altered.')
  assert((await travelerApplication.listTravelers()).length === 0, 'Deleted traveler is still listed.')
  assert(
    (await travelerApplication.listTripParticipants('purge-trip')).length === 0,
    'Deleted traveler is still a participant.',
  )
  await assertVaultStillValidates()
})

async function holdVaultLock(): Promise<() => void> {
  let release!: () => void
  let acquired!: () => void
  const ready = new Promise<void>((resolve) => {
    acquired = resolve
  })
  void navigator.locks.request('dtagency:vault', () => {
    acquired()
    return new Promise<void>((resolve) => {
      release = resolve
    })
  })
  await ready
  return release
}

await run('Media purge waits for the cross-tab Vault lock', async () => {
  await resetEnvironment()
  const seeded = await seedRoundTripState()
  const media = await db.media.get(seeded.mediaId)
  const now = new Date().toISOString()
  await db.media.put({ ...media!, deletedAt: now, updatedAt: now })

  const release = await holdVaultLock()
  let finished = false
  const purge = mediaFileRepository.purge(seeded.mediaId).then((result) => {
    finished = true
    return result
  })
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert(!finished, 'Purge ran while another context held the Vault lock.')
  assert(Boolean(await db.media.get(seeded.mediaId)), 'Purge removed the row while the lock was held.')
  release()
  assert((await purge) === 'purged', 'Purge did not complete after the lock was released.')
})

await run('Staging sweep skips instead of waiting when the Vault lock is busy', async () => {
  await resetEnvironment()
  const release = await holdVaultLock()
  try {
    const result = await Promise.race([
      sweepStaleVaultStaging(Date.now() + STALE_VAULT_STAGING_MS * 2),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 1_000)),
    ])
    assert(result !== 'blocked', 'Sweep waited for the busy Vault lock.')
  } finally {
    release()
  }
})

try {
  await resetEnvironment()
} catch {
  // Test result reporting must survive cleanup failures.
}

window.__DTAGENCY_BROWSER_RESULTS__ = results
window.__DTAGENCY_BROWSER_DONE__ = true
if (resultElement) resultElement.textContent = JSON.stringify(results, null, 2)
