import type { Media } from '../../domain/entities'
import { db } from '../db/dtagency-db'
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

async function requireEditableMediaContext(media: Pick<Media, 'tripId' | 'dayId' | 'blockId'>): Promise<void> {
  if (!media.tripId && !media.dayId && !media.blockId) return
  if (!media.tripId) throw new Error('Il media contestuale deve appartenere a un viaggio.')

  const trip = await db.trips.get(media.tripId)
  if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare i media.')

  if (media.dayId) {
    const day = await db.days.get(media.dayId)
    if (!day || day.deletedAt || day.tripId !== media.tripId) {
      throw new Error('La giornata del media non appartiene a questo viaggio.')
    }
  }

  if (media.blockId) {
    const block = await db.blocks.get(media.blockId)
    if (
      !block || block.deletedAt ||
      block.tripId !== media.tripId ||
      (media.dayId !== undefined && block.dayId !== media.dayId)
    ) {
      throw new Error('Il blocco del media non appartiene al suo contesto.')
    }
  }
}

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
      await db.transaction('rw', db.trips, db.days, db.blocks, db.media, async () => {
        await requireEditableMediaContext(entity)
        await db.media.add(entity)
      })
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
    return db.transaction('rw', db.trips, db.days, db.blocks, db.media, async () => {
      const media = await db.media.get(id)
      if (!media || media.deletedAt) throw new Error(`Active media ${id} was not found.`)
      await requireEditableMediaContext(media)
      const updatedAt = new Date().toISOString()
      const changes: DayMediaMetadataUpdate & { updatedAt: string } = {
        caption: input.caption?.trim() || undefined,
        placeId: input.placeId || undefined,
        itineraryId: input.itineraryId || undefined,
        reservationId: input.reservationId || undefined,
        updatedAt,
      }
      await db.media.put({ ...media, ...changes })
      return { ...media, ...changes }
    })
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
    await db.transaction('rw', db.trips, db.days, db.media, async () => {
      await requireEditableMediaContext({ tripId, dayId })
      const current = (await db.media.where('dayId').equals(dayId).toArray())
        .filter((item) => (
          !item.deletedAt && item.tripId === tripId && !item.blockId && (item.kind === 'image' || item.kind === 'video')
        ))
      if (current.length !== orderedIds.length) throw new Error('The day media order is incomplete.')

      const currentIds = new Set(current.map((item) => item.id))
      if (orderedIds.some((id) => !currentIds.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
        throw new Error('The day media order contains invalid entries.')
      }

      const updatedAt = new Date().toISOString()
      const updates = orderedIds.map((id, index) => ({
        ...current.find((item) => item.id === id)!,
        position: index + 1,
        updatedAt,
      }))
      await db.media.bulkPut(updates)
    })
  }

  async softDeleteForDay(id: string, tripId: string, dayId: string): Promise<SoftDeleteMediaResult> {
    return db.transaction('rw', db.trips, db.days, db.media, async () => {
      await requireEditableMediaContext({ tripId, dayId })
      const media = await db.media.get(id)
      if (!media) return 'not-found'
      if (media.deletedAt) return 'already-deleted'
      if (media.tripId !== tripId || media.dayId !== dayId || media.blockId) {
        throw new Error('La foto o il video non appartiene a questa giornata.')
      }
      const now = new Date().toISOString()
      await db.media.put({ ...media, deletedAt: now, updatedAt: now })
      return 'tombstoned'
    })
  }

  async softDelete(id: string): Promise<SoftDeleteMediaResult> {
    return db.transaction('rw', db.media, async () => {
      const media = await db.media.get(id)
      if (!media) return 'not-found'
      if (media.deletedAt) return 'already-deleted'
      const now = new Date().toISOString()
      await db.media.put({ ...media, deletedAt: now, updatedAt: now })
      return 'tombstoned'
    })
  }

  async restore(id: string): Promise<RestoreMediaResult> {
    const media = await db.media.get(id)
    if (!media) return 'not-found'
    if (!media.deletedAt) return 'already-active'

    if (!(await mediaFileExists(id))) {
      throw new Error(`Media ${id} cannot be restored because its OPFS file is missing.`)
    }

    return db.transaction('rw', db.media, async () => {
      const current = await db.media.get(id)
      if (!current) return 'not-found'
      if (!current.deletedAt) return 'already-active'
      await db.media.put({ ...current, deletedAt: undefined, updatedAt: new Date().toISOString() })
      return 'restored'
    })
  }

  async purge(id: string): Promise<PurgeMediaResult> {
    const media = await db.media.get(id)
    if (!media) return 'not-found'
    if (!media.deletedAt) {
      throw new Error(`Media ${id} must be tombstoned before it can be purged.`)
    }

    try {
      await deleteMediaFile(id)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
    }

    return db.transaction('rw', db.media, async () => {
      const current = await db.media.get(id)
      if (!current) return 'not-found'
      if (!current.deletedAt) throw new Error(`Media ${id} must be tombstoned before it can be purged.`)
      await db.media.delete(id)
      return 'purged'
    })
  }
}

export const mediaFileRepository = new MediaRepository()
