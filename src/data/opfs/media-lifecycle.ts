import { opfsStore } from './opfs-store'

export interface MediaFileInfo {
  id: string
  path: string
  sizeBytes: number
  mimeType: string
}

export class MediaLifecycle {
  async writeOriginal(id: string, source: Blob): Promise<MediaFileInfo> {
    const path = `media/${id}/original`
    await opfsStore.write(path, source)
    return { id, path, sizeBytes: source.size, mimeType: source.type || 'application/octet-stream' }
  }

  async readOriginal(id: string): Promise<File | null> {
    return opfsStore.readFile(`media/${id}/original`)
  }

  async deleteMedia(id: string): Promise<void> {
    await opfsStore.remove(`media/${id}`)
  }

  async exists(id: string): Promise<boolean> {
    return opfsStore.exists(`media/${id}/original`)
  }
}

export const mediaLifecycle = new MediaLifecycle()
