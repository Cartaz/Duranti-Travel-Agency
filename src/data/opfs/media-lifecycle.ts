import {
  buildMediaPath,
  deleteMediaFile,
  mediaFileExists,
  readMediaFile,
  writeMediaFile,
} from './opfs-store'

export interface MediaFileInfo {
  id: string
  path: string
  sizeBytes: number
  mimeType: string
}

export class MediaLifecycle {
  async writeOriginal(id: string, source: Blob): Promise<MediaFileInfo> {
    const path = await writeMediaFile(id, source)
    return {
      id,
      path,
      sizeBytes: source.size,
      mimeType: source.type || 'application/octet-stream',
    }
  }

  async readOriginal(id: string): Promise<File> {
    return readMediaFile(id)
  }

  async deleteMedia(id: string): Promise<void> {
    await deleteMediaFile(id)
  }

  async exists(id: string): Promise<boolean> {
    return mediaFileExists(id)
  }

  pathForOriginal(id: string): string {
    return buildMediaPath(id)
  }
}

export const mediaLifecycle = new MediaLifecycle()
