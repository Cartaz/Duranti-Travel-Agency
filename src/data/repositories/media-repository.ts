import type { Media } from '../../domain/entities'
import { db } from '../db/duranti-db'
import { assertEntityBase } from '../db/validate'
import { deleteMediaFile, readMediaFile, writeMediaFile } from '../opfs/opfs-store'

export interface CreateMediaInput {
  id: string
  tripId?: string
  dayId?: string
  blockId?: string
  kind: Media['kind']
  mimeType: string
  originalName?: string
  sizeBytes: number
  width?: number
  height?: number
  durationMs?: number
  sha256?: string
}

export class MediaRepository {
  async create(input: CreateMediaInput, source: Blob): Promise<Media> {
    if (source.size !== input.sizeBytes) {
      throw new Error(`Media size mismatch: metadata=${input.sizeBytes}, source=${source.size}.`)
    }

    const opfsPath = await writeMediaFile(input.id, source)
    const entity: Media = {
      ...input,
      opfsPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    try {
      assertEntityBase(entity, 'Media')
      await db.media.put(entity)
      return entity
    } catch (error) {
      try {
        await deleteMediaFile(input.id)
      } catch {
        // Best-effort rollback of the file if the metadata write fails.
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
