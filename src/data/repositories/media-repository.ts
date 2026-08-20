import type { Media } from '../../domain/entities'
import { db } from '../db/duranti-db'
import { assertEntityBase } from '../db/validate'
import { deleteMediaFile, readMediaFile, writeMediaFile } from '../opfs/opfs-store'

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

  async get(id: string): Promise<Media | undefined> {
    return db.media.get(id)
  }

  async getFile(id: string): Promise<File> {
    const media = await this.get(id)
    if (!media) throw new Error(`Media ${id} was not found.`)
    return readMediaFile(id)
  }

  async delete(id: string): Promise<void> {
    await db.transaction('rw', db.media, async () => {
      await db.media.delete(id)
    })

    try {
      await deleteMediaFile(id)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
    }
  }
}

export const mediaFileRepository = new MediaRepository()
