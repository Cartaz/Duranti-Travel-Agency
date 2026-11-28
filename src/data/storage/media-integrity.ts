import { withVaultLock } from '../../lib/vault-lock'
import { db } from '../db/dtagency-db'
import {
  deleteEncryptedDocumentDirectory,
  describePrivateDocumentDirectory,
  listPrivateDocumentRootEntries,
} from '../opfs/private-document-store'
import {
  buildMediaPath,
  deleteMediaFile,
  listMediaDirectoryIds,
  mediaFileExists,
  readMediaFile,
} from '../opfs/opfs-store'
import { listReferencedMediaIds, mediaFileRepository } from '../repositories/media-repository'
import { secureTravelerDocumentRepository } from '../repositories/traveler-document-repository'

export interface MediaSizeMismatch {
  id: string
  metadataBytes: number
  actualBytes: number
}

export interface MediaPathMismatch {
  id: string
  storedPath: string
  expectedPath: string
}

export interface MediaUnreadableEntry {
  id: string
  errorName: string
  message: string
}

export interface MediaIntegrityReport {
  scannedAt: string
  metadataCount: number
  activeMetadataCount: number
  tombstonedMetadataCount: number
  opfsDirectoryCount: number
  healthyCount: number
  missingFileIds: string[]
  orphanDirectoryIds: string[]
  tombstonesWithFileIds: string[]
  tombstonesWithoutFileIds: string[]
  sizeMismatches: MediaSizeMismatch[]
  pathMismatches: MediaPathMismatch[]
  unreadableEntries: MediaUnreadableEntry[]
  isClean: boolean
}

function errorDetails(error: unknown): { errorName: string; message: string } {
  if (error instanceof DOMException) return { errorName: error.name, message: error.message }
  if (error instanceof Error) return { errorName: error.name, message: error.message }
  return { errorName: 'UnknownError', message: String(error) }
}

export async function scanMediaIntegrity(): Promise<MediaIntegrityReport> {
  const metadata = await db.media.toArray()
  const opfsDirectoryIds = await listMediaDirectoryIds()
  const metadataIds = new Set(metadata.map((item) => item.id))

  const activeMetadata = metadata.filter((item) => !item.deletedAt)
  const tombstonedMetadata = metadata.filter((item) => Boolean(item.deletedAt))
  const missingFileIds: string[] = []
  const tombstonesWithFileIds: string[] = []
  const tombstonesWithoutFileIds: string[] = []
  const sizeMismatches: MediaSizeMismatch[] = []
  const pathMismatches: MediaPathMismatch[] = []
  const unreadableEntries: MediaUnreadableEntry[] = []
  let healthyCount = 0

  for (const item of metadata) {
    const expectedPath = buildMediaPath(item.id)
    if (item.opfsPath !== expectedPath) {
      pathMismatches.push({ id: item.id, storedPath: item.opfsPath, expectedPath })
    }

    if (item.deletedAt) {
      try {
        if (await mediaFileExists(item.id)) tombstonesWithFileIds.push(item.id)
        else tombstonesWithoutFileIds.push(item.id)
      } catch (error) {
        unreadableEntries.push({ id: item.id, ...errorDetails(error) })
      }
      continue
    }

    let healthy = item.opfsPath === expectedPath
    try {
      const file = await readMediaFile(item.id)
      if (file.size !== item.sizeBytes) {
        sizeMismatches.push({ id: item.id, metadataBytes: item.sizeBytes, actualBytes: file.size })
        healthy = false
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        missingFileIds.push(item.id)
      } else {
        unreadableEntries.push({ id: item.id, ...errorDetails(error) })
      }
      healthy = false
    }

    if (healthy) healthyCount += 1
  }

  const orphanDirectoryIds = opfsDirectoryIds.filter((id) => !metadataIds.has(id))
  const isClean =
    missingFileIds.length === 0 &&
    orphanDirectoryIds.length === 0 &&
    tombstonesWithFileIds.length === 0 &&
    tombstonesWithoutFileIds.length === 0 &&
    sizeMismatches.length === 0 &&
    pathMismatches.length === 0 &&
    unreadableEntries.length === 0

  return {
    scannedAt: new Date().toISOString(),
    metadataCount: metadata.length,
    activeMetadataCount: activeMetadata.length,
    tombstonedMetadataCount: tombstonedMetadata.length,
    opfsDirectoryCount: opfsDirectoryIds.length,
    healthyCount,
    missingFileIds,
    orphanDirectoryIds,
    tombstonesWithFileIds,
    tombstonesWithoutFileIds,
    sizeMismatches,
    pathMismatches,
    unreadableEntries,
    isClean,
  }
}

export interface MediaStorageScan {
  reclaimableMediaIds: string[]
  orphanDirectoryIds: string[]
  orphanPrivateDocumentIds: string[]
  reclaimableDocumentIds: string[]
  reclaimableBytes: number
  unhealthyActiveCount: number
}

export interface MediaStorageReclaimResult {
  purgedMediaCount: number
  removedOrphanCount: number
  keptReferencedCount: number
  freedBytes: number
}

/**
 * A directory without metadata may belong to an upload still being written
 * (bytes are written before the row is added), so only directories untouched
 * for this long are treated as orphans.
 */
export const ORPHAN_GRACE_MS = 10 * 60 * 1000

/** `modified` is undefined when the bytes cannot be read (e.g. mid-write). */
async function mediaFootprint(id: string): Promise<{ bytes: number; modified?: number }> {
  try {
    const file = await readMediaFile(id)
    return { bytes: file.size, modified: file.lastModified }
  } catch {
    return { bytes: 0 }
  }
}

async function privateFootprint(id: string): Promise<{ bytes: number; modified?: number }> {
  try {
    const { bytes, newestModified } = await describePrivateDocumentDirectory(id)
    return { bytes, modified: newestModified > 0 ? newestModified : undefined }
  } catch {
    return { bytes: 0 }
  }
}

// Only provably old directories count: an unreadable or empty directory may
// be an upload whose bytes are being written right now.
function provablyStale(modified: number | undefined, now: number): boolean {
  return modified !== undefined && now - modified >= ORPHAN_GRACE_MS
}

async function isStaleMediaOrphan(id: string, now: number): Promise<boolean> {
  if (await db.media.get(id)) return false
  return provablyStale((await mediaFootprint(id)).modified, now)
}

async function isStalePrivateOrphan(id: string, now: number): Promise<boolean> {
  if (await db.travelerDocuments.get(id)) return false
  return provablyStale((await privateFootprint(id)).modified, now)
}

/** Read-only summary of space held by deleted media and stale orphan directories. */
export async function scanReclaimableMediaStorage(now = Date.now()): Promise<MediaStorageScan> {
  const report = await scanMediaIntegrity()
  const orphanDirectoryIds: string[] = []
  for (const id of report.orphanDirectoryIds) if (await isStaleMediaOrphan(id, now)) orphanDirectoryIds.push(id)

  const orphanPrivateDocumentIds: string[] = []
  for (const entry of await listPrivateDocumentRootEntries()) {
    if (entry.kind === 'directory' && (await isStalePrivateOrphan(entry.name, now)))
      orphanPrivateDocumentIds.push(entry.name)
  }

  // Tombstoned media still referenced by a row would be refused by purge: do not advertise it.
  const referenced = await listReferencedMediaIds()
  const reclaimableMediaIds = report.tombstonesWithFileIds.filter((id) => !referenced.has(id))

  // Tombstoned traveler documents whose purge did not complete still hold encrypted bytes.
  const reclaimableDocumentIds = (await db.travelerDocuments.toArray())
    .filter((document) => Boolean(document.deletedAt))
    .map((document) => document.id)

  let reclaimableBytes = 0
  for (const id of [...reclaimableMediaIds, ...orphanDirectoryIds]) reclaimableBytes += (await mediaFootprint(id)).bytes
  for (const id of [...orphanPrivateDocumentIds, ...reclaimableDocumentIds])
    reclaimableBytes += (await privateFootprint(id)).bytes

  return {
    reclaimableMediaIds,
    orphanDirectoryIds,
    orphanPrivateDocumentIds,
    reclaimableDocumentIds,
    reclaimableBytes,
    unhealthyActiveCount:
      report.missingFileIds.length +
      report.sizeMismatches.length +
      report.pathMismatches.length +
      report.unreadableEntries.length,
  }
}

/**
 * Explicit, user-confirmed reclamation. Every deletion re-checks the current
 * state under the Vault lock: purge refuses active or referenced rows, and an
 * orphan directory is kept if metadata reappeared or it was written recently.
 */
export async function reclaimMediaStorage(
  scan: MediaStorageScan,
  now = Date.now(),
): Promise<MediaStorageReclaimResult> {
  const result: MediaStorageReclaimResult = {
    purgedMediaCount: 0,
    removedOrphanCount: 0,
    keptReferencedCount: 0,
    freedBytes: 0,
  }
  const mediaFootprints = new Map<string, number>()
  for (const id of scan.reclaimableMediaIds) mediaFootprints.set(id, (await mediaFootprint(id)).bytes)
  const mediaOutcomes = await mediaFileRepository.purgeMany(scan.reclaimableMediaIds)
  for (const id of scan.reclaimableMediaIds) {
    const outcome = mediaOutcomes.get(id)
    if (outcome === 'purged') {
      result.purgedMediaCount += 1
      result.freedBytes += mediaFootprints.get(id) ?? 0
    } else if (outcome === 'referenced') {
      result.keptReferencedCount += 1
    }
  }
  for (const id of scan.reclaimableDocumentIds) {
    const { bytes } = await privateFootprint(id)
    if ((await secureTravelerDocumentRepository.purge(id)) === 'purged') {
      result.purgedMediaCount += 1
      result.freedBytes += bytes
    }
  }
  for (const id of scan.orphanDirectoryIds) {
    const removed = await withVaultLock(async () => {
      if (!(await isStaleMediaOrphan(id, now))) return undefined
      const { bytes } = await mediaFootprint(id)
      try {
        await deleteMediaFile(id)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
      }
      return bytes
    })
    if (removed !== undefined) {
      result.removedOrphanCount += 1
      result.freedBytes += removed
    }
  }
  for (const id of scan.orphanPrivateDocumentIds) {
    const removed = await withVaultLock(async () => {
      if (!(await isStalePrivateOrphan(id, now))) return undefined
      const { bytes } = await privateFootprint(id)
      await deleteEncryptedDocumentDirectory(id)
      return bytes
    })
    if (removed !== undefined) {
      result.removedOrphanCount += 1
      result.freedBytes += removed
    }
  }
  return result
}
