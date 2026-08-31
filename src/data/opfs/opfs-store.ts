const ROOT_DIRECTORY = 'dtagency'
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
  const dtagency = await root.getDirectoryHandle(ROOT_DIRECTORY, { create: true })
  return dtagency.getDirectoryHandle(MEDIA_DIRECTORY, { create: true })
}

async function getExistingMediaDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const root = await getRootDirectory()

  try {
    const dtagency = await root.getDirectoryHandle(ROOT_DIRECTORY)
    return await dtagency.getDirectoryHandle(MEDIA_DIRECTORY)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

async function requireExistingMediaDirectory(): Promise<FileSystemDirectoryHandle> {
  const directory = await getExistingMediaDirectory()
  if (directory) return directory
  throw new DOMException('DTAgency media directory was not found.', 'NotFoundError')
}

async function getDirectoryEntries(
  directory: FileSystemDirectoryHandle,
): Promise<Array<[string, FileSystemHandle]>> {
  const iterableDirectory = directory as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }

  if (typeof iterableDirectory.entries !== 'function') {
    throw new Error('OPFS directory iteration is not available in this browser build.')
  }

  const entries: Array<[string, FileSystemHandle]> = []
  for await (const entry of iterableDirectory.entries()) entries.push(entry)
  return entries
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
    const stored = await fileHandle.getFile()
    if (stored.size !== source.size) {
      throw new Error(`Media ${mediaId} OPFS write is incomplete: expected ${source.size} bytes, found ${stored.size}.`)
    }
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      // Preserve the original write/verification failure.
    }
    try {
      await mediaDirectory.removeEntry(mediaId, { recursive: true })
    } catch {
      // Best-effort cleanup only.
    }
    throw error
  }

  return buildMediaPath(mediaId)
}

export async function readMediaFile(mediaId: string): Promise<File> {
  const mediaDirectory = await requireExistingMediaDirectory()
  const itemDirectory = await mediaDirectory.getDirectoryHandle(mediaId)
  const fileHandle = await itemDirectory.getFileHandle('original')
  return fileHandle.getFile()
}

export async function deleteMediaFile(mediaId: string): Promise<void> {
  const mediaDirectory = await requireExistingMediaDirectory()
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

export async function listMediaDirectoryIds(): Promise<string[]> {
  const mediaDirectory = await getExistingMediaDirectory()
  if (!mediaDirectory) return []

  const ids: string[] = []
  for (const [name, handle] of await getDirectoryEntries(mediaDirectory)) {
    if (handle.kind === 'directory') ids.push(name)
  }

  return ids.sort((a, b) => a.localeCompare(b))
}
