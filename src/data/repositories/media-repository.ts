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
  placeId?: string
  itineraryId?: string
  reservationId?: string
  position?: number
  kind: Media['kind']
  mimeType?: string
  originalName?: string
  caption?: string
  width?: number
  height?: number
  durationMs?: number
  sha256?: string
}

export interface DayMediaMetadataUpdate {
  caption?: string
  placeId?: string
  itineraryId?: string
  reservationId?: string
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

  async listForDay(tripId: string, dayId: string): Promise<Media[]> {
    const media = await db.media.where('dayId').equals(dayId).toArray()
    return media
      .filter((item) => (
        !item.deletedAt
        && item.tripId === tripId
        && !item.blockId
        && (item.kind === 'image' || item.kind === 'video')
      ))
      .sort((left, right) => {
        if (left.position !== undefined || right.position !== undefined) {
          if (left.position === undefined) return 1
          if (right.position === undefined) return -1
          if (left.position !== right.position) return left.position - right.position
        }
        return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
      })
  }

  async getFile(id: string): Promise<File> {
    const media = await this.get(id)
    if (!media) throw new Error(`Active media ${id} was not found.`)
    const stored = await readMediaFile(id)
    return new File(
      [stored],
      media.originalName || stored.name,
      { type: media.mimeType, lastModified: stored.lastModified },
    )
  }

  async updateDayMetadata(id: string, input: DayMediaMetadataUpdate): Promise<Media> {
    const media = await this.get(id)
    if (!media) throw new Error(`Active media ${id} was not found.`)
    const updatedAt = new Date().toISOString()
    const changes: DayMediaMetadataUpdate & { updatedAt: string } = {
      caption: input.caption?.trim() || undefined,
      placeId: input.placeId || undefined,
      itineraryId: input.itineraryId || undefined,
      reservationId: input.reservationId || undefined,
      updatedAt,
    }
    const updated = await db.media.update(id, changes)
    if (updated !== 1) throw new Error(`Media ${id} metadata could not be updated.`)
    return { ...media, ...changes }
  }

  async updateCaption(id: string, caption: string | undefined): Promise<Media> {
    const media = await this.get(id)
    if (!media) throw new Error(`Active media ${id} was not found.`)
    return this.updateDayMetadata(id, {
      caption,
      placeId: media.placeId,
      itineraryId: media.itineraryId,
      reservationId: media.reservationId,
    })
  }

  async setDayOrder(tripId: string, dayId: string, orderedIds: string[]): Promise<void> {
    const current = await this.listForDay(tripId, dayId)
    if (current.length !== orderedIds.length) throw new Error('The day media order is incomplete.')

    const currentIds = new Set(current.map((item) => item.id))
    if (orderedIds.some((id) => !currentIds.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
      throw new Error('The day media order contains invalid entries.')
    }

    const updatedAt = new Date().toISOString()
    await db.transaction('rw', db.media, async () => {
      for (const [index, id] of orderedIds.entries()) {
        const updated = await db.media.update(id, { position: index + 1, updatedAt })
        if (updated !== 1) throw new Error(`Media ${id} order could not be updated.`)
      }
    })
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
