import { db } from '../db/duranti-db'
import {
  buildMediaPath,
  deleteMediaFile,
  listMediaDirectoryIds,
  mediaFileExists,
  readMediaFile,
} from '../opfs/opfs-store'
import { mediaFileRepository, type PurgeMediaResult } from '../repositories/media-repository'

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
  if (error instanceof DOMException) {
    return { errorName: error.name, message: error.message }
  }
  if (error instanceof Error) {
    return { errorName: error.name, message: error.message }
  }
  return { errorName: 'UnknownError', message: String(error) }
}

export async function scanMediaIntegrity(): Promise<MediaIntegrityReport> {
  // Keep IndexedDB work and OPFS work in separate async phases. OPFS calls must not
  // be awaited inside a Dexie transaction because IndexedDB transactions may auto-commit.
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
      pathMismatches.push({
        id: item.id,
        storedPath: item.opfsPath,
        expectedPath,
      })
    }

    if (item.deletedAt) {
      try {
        if (await mediaFileExists(item.id)) tombstonesWithFileIds.push(item.id)
        else tombstonesWithoutFileIds.push(item.id)
      } catch (error) {
        const details = errorDetails(error)
        unreadableEntries.push({ id: item.id, ...details })
      }
      continue
    }

    let healthy = item.opfsPath === expectedPath
    try {
      const file = await readMediaFile(item.id)
      if (file.size !== item.sizeBytes) {
        sizeMismatches.push({
          id: item.id,
          metadataBytes: item.sizeBytes,
          actualBytes: file.size,
        })
        healthy = false
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        missingFileIds.push(item.id)
      } else {
        const details = errorDetails(error)
        unreadableEntries.push({ id: item.id, ...details })
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

export async function purgeTombstonedMedia(id: string): Promise<PurgeMediaResult> {
  return mediaFileRepository.purge(id)
}

export async function removeOrphanMediaDirectory(id: string): Promise<void> {
  const metadata = await db.media.get(id)
  if (metadata) {
    throw new Error(`Media directory ${id} is not orphaned because metadata still exists.`)
  }

  try {
    await deleteMediaFile(id)
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
  }
}
