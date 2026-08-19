const ROOT_DIRECTORY = 'duranti'
const MEDIA_DIRECTORY = 'media'

function assertOpfsSupport(): void {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    throw new Error('Origin Private File System (OPFS) is not available in this browser.')
  }
}

async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
  assertOpfsSupport()
  return navigator.storage.getDirectory()
}

async function getMediaDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDirectory()
  const duranti = await root.getDirectoryHandle(ROOT_DIRECTORY, { create: true })
  return duranti.getDirectoryHandle(MEDIA_DIRECTORY, { create: true })
}

export function buildMediaPath(mediaId: string): string {
  return `${ROOT_DIRECTORY}/${MEDIA_DIRECTORY}/${mediaId}/original`
}

export async function writeMediaFile(mediaId: string, source: Blob): Promise<string> {
  const mediaDirectory = await getMediaDirectory()
  const itemDirectory = await mediaDirectory.getDirectoryHandle(mediaId, { create: true })
  const fileHandle = await itemDirectory.getFileHandle('original', { create: true })
  const writable = await fileHandle.createWritable()

  try {
    await writable.write(source)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      // Preserve the original write failure.
    }
    try {
      await itemDirectory.remove({ recursive: true })
    } catch {
      // Best-effort cleanup only.
    }
    throw error
  }

  return buildMediaPath(mediaId)
}

export async function readMediaFile(mediaId: string): Promise<File> {
  const mediaDirectory = await getMediaDirectory()
  const itemDirectory = await mediaDirectory.getDirectoryHandle(mediaId)
  const fileHandle = await itemDirectory.getFileHandle('original')
  return fileHandle.getFile()
}

export async function deleteMediaFile(mediaId: string): Promise<void> {
  const mediaDirectory = await getMediaDirectory()
  await mediaDirectory.removeEntry(mediaId, { recursive: true })
}

export async function mediaFileExists(mediaId: string): Promise<boolean> {
  try {
    await readMediaFile(mediaId)
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false
    throw error
  }
}
