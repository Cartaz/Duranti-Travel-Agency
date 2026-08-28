import { DB_NAME, DB_VERSION, db } from '../../src/data/db/dtagency-db'
import { readMediaFile, writeMediaFile } from '../../src/data/opfs/opfs-store'
import { dayRepository } from '../../src/data/repositories/day-repository'
import { plannerBlockRepository } from '../../src/data/repositories/block-repository'
import { prepareVaultExport, loadPreparedVaultFile } from '../../src/vault/export'
import { stageVaultImport } from '../../src/vault/import'
import { commitStagedVaultImport, recoverInterruptedVaultRestore } from '../../src/vault/restore'

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

async function writeOpfsFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  body: BlobPart,
): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(body)
    await writable.close()
  } catch (error) {
    try { await writable.abort() } catch { /* preserve original error */ }
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

async function createInterruptedRestoreFixture(): Promise<string> {
  const restoreId = 'browser-restore-1'
  const stageId = 'browser-stage-1'
  const archiveId = 'browser-archive-1'
  const mediaId = 'browser-recovery-media'
  const originalText = 'original-before-interrupted-restore'

  await writeMediaFile(mediaId, new Blob(['mutated-during-restore'], { type: 'text/plain' }))

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
      files: [{
        index: 0,
        namespace: 'media',
        path: `dtagency/media/${mediaId}/original`,
        sizeBytes: utf8(originalText).byteLength,
      }],
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
      targetDatabaseSha256: '0'.repeat(64),
      phase: 'files-mutating',
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  )

  return mediaId
}

await run('IndexedDB exposes only the DTAgency v1 baseline', async () => {
  await resetEnvironment()
  assert(db.name === DB_NAME, `Expected database ${DB_NAME}, got ${db.name}.`)
  assert(DB_NAME === 'dtagency', `Unexpected DB_NAME ${DB_NAME}.`)
  assert(DB_VERSION === 1, `Unexpected DB_VERSION ${DB_VERSION}.`)
  assert(db.verno === 1, `Unexpected Dexie version ${db.verno}.`)
  const tableNames = db.tables.map((table) => table.name).sort()
  assert(tableNames.length === 15, `Expected 15 tables, got ${tableNames.length}.`)
  assert(tableNames.includes('appMeta') && tableNames.includes('travelerDocuments'), 'Required v1 tables are missing.')
})

await run('OPFS media CRUD uses the DTAgency namespace', async () => {
  await resetEnvironment()
  const mediaId = 'browser-opfs-1'
  const expected = 'browser-opfs-payload'
  const path = await writeMediaFile(mediaId, new Blob([expected], { type: 'text/plain' }))
  assert(path === `dtagency/media/${mediaId}/original`, `Unexpected media path ${path}.`)
  const stored = await readMediaFile(mediaId)
  assert(await readText(stored) === expected, 'OPFS round-trip changed media bytes.')
})

await run('Concurrent day and block creation allocate unique ordered positions', async () => {
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
  const sequences = [firstDay.sequence, secondDay.sequence].sort((a, b) => a - b)
  assert(sequences.join(',') === '1,2', `Concurrent days received invalid sequences ${sequences.join(',')}.`)

  const dayId = firstDay.id
  const [firstBlock, secondBlock] = await Promise.all([
    plannerBlockRepository.createAtEnd({ id: 'concurrent-block-a', tripId, dayId, type: 'text', content: {}, createdAt: now, updatedAt: now }),
    plannerBlockRepository.createAtEnd({ id: 'concurrent-block-b', tripId, dayId, type: 'text', content: {}, createdAt: now, updatedAt: now }),
  ])
  const positions = [firstBlock.position, secondBlock.position].sort((a, b) => a - b)
  assert(positions.join(',') === '1,2', `Concurrent blocks received invalid positions ${positions.join(',')}.`)
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
  assert(await readText(await readMediaFile(seeded.mediaId)) === seeded.mediaText, 'Media bytes did not survive Vault round-trip.')
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
  assert(await readText(await readMediaFile(seeded.mediaId)) === seeded.mediaText, 'Tampered import mutated live OPFS.')
})

await run('Interrupted files-mutating restore rolls OPFS back from journal backup', async () => {
  await resetEnvironment()
  const mediaId = await createInterruptedRestoreFixture()
  const result = await recoverInterruptedVaultRestore()
  assert(result === 'rolled-back', `Expected rolled-back recovery, got ${result}.`)
  assert(
    await readText(await readMediaFile(mediaId)) === 'original-before-interrupted-restore',
    'Recovery did not restore original OPFS bytes.',
  )
})

try {
  await resetEnvironment()
} catch {
  // Test result reporting must survive cleanup failures.
}

window.__DTAGENCY_BROWSER_RESULTS__ = results
window.__DTAGENCY_BROWSER_DONE__ = true
if (resultElement) resultElement.textContent = JSON.stringify(results, null, 2)
