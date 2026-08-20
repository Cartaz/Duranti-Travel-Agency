import type { Media } from '../../domain/entities'
import { db } from '../db/duranti-db'
import { assertEntityBase } from '../db/validate'
import {
  deleteMediaFile,
  mediaFileExists,
  readMediaFile,
  writeMediaFile,
} from '../opfs/opfs-store'

export interface CreateMediaInput {
  tripId?: string
  dayId?: string
  blockId?: string
  kind: Media['kind']
  mimeType?: string
  originalName?: string
  width?: number
  height?: number
  durationMs?: number
  sha256?: string
}

export type SoftDeleteMediaResult = 'not-found' | 'already-deleted' | 'tombstoned'
export type RestoreMediaResult = 'not-found' | 'already-active' | 'restored'
export type PurgeMediaResult = 'not-found' | 'purged'

export class MediaRepository {
  async create(input: CreateMediaInput, source: Blob): Promise<Media> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const mimeType = source.type || input.mimeType || 'application/octet-stream'
    const opfsPath = await writeMediaFile(id, source)
    const entity: Media = {
      ...input,
      id,
      mimeType,
      sizeBytes: source.size,
      opfsPath,
      createdAt: now,
      updatedAt: now,
    }

    try {
      assertEntityBase(entity, 'Media')
      await db.media.add(entity)
      return entity
    } catch (error) {
      try {
        await deleteMediaFile(id)
      } catch {
        // Best-effort rollback of the newly-created file if metadata persistence fails.
      }
      throw error
    }
  }

  async get(
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<Media | undefined> {
    const media = await db.media.get(id)
    if (!media || (!options.includeDeleted && media.deletedAt)) return undefined
    return media
  }

  async getFile(id: string): Promise<File> {
    const media = await this.get(id)
    if (!media) throw new Error(`Active media ${id} was not found.`)
    return readMediaFile(id)
  }

  async softDelete(id: string): Promise<SoftDeleteMediaResult> {
    const media = await db.media.get(id)
    if (!media) return 'not-found'
    if (media.deletedAt) return 'already-deleted'

    const now = new Date().toISOString()
    const updated = await db.media.update(id, {
      deletedAt: now,
      updatedAt: now,
    })

    if (updated !== 1) throw new Error(`Media ${id} could not be tombstoned.`)
    return 'tombstoned'
  }

  async restore(id: string): Promise<RestoreMediaResult> {
    const media = await db.media.get(id)
    if (!media) return 'not-found'
    if (!media.deletedAt) return 'already-active'

    if (!(await mediaFileExists(id))) {
      throw new Error(`Media ${id} cannot be restored because its OPFS file is missing.`)
    }

    const updated = await db.media.update(id, {
      deletedAt: undefined,
      updatedAt: new Date().toISOString(),
    })

    if (updated !== 1) throw new Error(`Media ${id} could not be restored.`)
    return 'restored'
  }

  async purge(id: string): Promise<PurgeMediaResult> {
    const media = await db.media.get(id)
    if (!media) return 'not-found'
    if (!media.deletedAt) {
      throw new Error(`Media ${id} must be tombstoned before it can be purged.`)
    }

    // Delete the binary first. If the app stops before metadata deletion, the tombstone
    // remains and the integrity scanner can safely finish the purge later.
    try {
      await deleteMediaFile(id)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
    }

    await db.media.delete(id)
    return 'purged'
  }
}

export const mediaFileRepository = new MediaRepository()
