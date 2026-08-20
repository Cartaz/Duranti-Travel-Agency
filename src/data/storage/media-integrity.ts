import { db } from '../db/duranti-db'
import {
  buildMediaPath,
  listMediaDirectoryIds,
  readMediaFile,
} from '../opfs/opfs-store'

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
  opfsDirectoryCount: number
  healthyCount: number
  missingFileIds: string[]
  orphanDirectoryIds: string[]
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

  const missingFileIds: string[] = []
  const sizeMismatches: MediaSizeMismatch[] = []
  const pathMismatches: MediaPathMismatch[] = []
  const unreadableEntries: MediaUnreadableEntry[] = []
  let healthyCount = 0

  for (const item of metadata) {
    let healthy = true
    const expectedPath = buildMediaPath(item.id)

    if (item.opfsPath !== expectedPath) {
      pathMismatches.push({
        id: item.id,
        storedPath: item.opfsPath,
        expectedPath,
      })
      healthy = false
    }

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
    sizeMismatches.length === 0 &&
    pathMismatches.length === 0 &&
    unreadableEntries.length === 0

  return {
    scannedAt: new Date().toISOString(),
    metadataCount: metadata.length,
    opfsDirectoryCount: opfsDirectoryIds.length,
    healthyCount,
    missingFileIds,
    orphanDirectoryIds,
    sizeMismatches,
    pathMismatches,
    unreadableEntries,
    isClean,
  }
}
