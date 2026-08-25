import { DB_NAME, DB_VERSION, db } from '../data/db/duranti-db'
import {
  MAX_VAULT_MANIFEST_BYTES,
  VAULT_CHUNK_BYTES,
  VAULT_FILE_EXTENSION,
  VAULT_FORMAT_VERSION,
  VAULT_FRAME_END,
  VAULT_FRAME_FILE_CHUNK,
  VAULT_FRAME_MANIFEST,
  VAULT_MIME_TYPE,
  VAULT_PBKDF2_ITERATIONS,
  bytesToBase64,
  deriveVaultKey,
  encodeUint32,
  encryptVaultPayload,
  fileChunkAdditionalData,
  manifestAdditionalData,
  stableJsonStringify,
  vaultMagicBytes,
  type VaultFileManifestEntry,
  type VaultHeaderV1,
  type VaultManagedNamespace,
  type VaultManifestV1,
  type VaultTableSnapshot,
} from './format'

const ROOT_DIRECTORY = 'duranti'
const MEDIA_DIRECTORY = 'media'
const PRIVATE_DIRECTORY = 'private'
const PRIVATE_DOCUMENT_DIRECTORY = 'traveler-documents'
const VAULT_STAGING_DIRECTORY = 'vault-staging'
const KDF_SALT_BYTES = 16

interface VaultSourceFile {
  namespace: VaultManagedNamespace
  path: string
  file: File
}

export type VaultExportPhase = 'snapshot' | 'inventory' | 'encrypting' | 'complete'

export interface VaultExportProgress {
  phase: VaultExportPhase
  filesCompleted: number
  filesTotal: number
  bytesCompleted: number
  bytesTotal: number
}

export interface PrepareVaultExportOptions {
  onProgress?: (progress: VaultExportProgress) => void
}

export interface PreparedVaultExport {
  archiveId: string
  createdAt: string
  fileName: string
  mimeType: typeof VAULT_MIME_TYPE
  sizeBytes: number
  sourceFileCount: number
  sourceBytes: number
}

function assertOpfsSupport(): void {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    throw new Error('Origin Private File System (OPFS) is not available in this browser.')
  }
}

async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
  assertOpfsSupport()
  return navigator.storage.getDirectory()
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

async function getExistingNestedDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle | null> {
  let current = root

  try {
    for (const segment of segments) current = await current.getDirectoryHandle(segment)
    return current
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

async function collectFilesRecursively(
  directory: FileSystemDirectoryHandle,
  pathPrefix: string,
  namespace: VaultManagedNamespace,
  output: VaultSourceFile[],
): Promise<void> {
  for (const [name, handle] of await getDirectoryEntries(directory)) {
    const path = `${pathPrefix}/${name}`
    if (handle.kind === 'file') {
      output.push({
        namespace,
        path,
        file: await (handle as FileSystemFileHandle).getFile(),
      })
      continue
    }

    await collectFilesRecursively(
      handle as FileSystemDirectoryHandle,
      path,
      namespace,
      output,
    )
  }
}

async function collectManagedOpfsFiles(): Promise<VaultSourceFile[]> {
  const root = await getRootDirectory()
  const output: VaultSourceFile[] = []

  const mediaDirectory = await getExistingNestedDirectory(root, [ROOT_DIRECTORY, MEDIA_DIRECTORY])
  if (mediaDirectory) {
    await collectFilesRecursively(
      mediaDirectory,
      `${ROOT_DIRECTORY}/${MEDIA_DIRECTORY}`,
      'media',
      output,
    )
  }

  const privateDocumentsDirectory = await getExistingNestedDirectory(root, [
    ROOT_DIRECTORY,
    PRIVATE_DIRECTORY,
    PRIVATE_DOCUMENT_DIRECTORY,
  ])
  if (privateDocumentsDirectory) {
    await collectFilesRecursively(
      privateDocumentsDirectory,
      `${ROOT_DIRECTORY}/${PRIVATE_DIRECTORY}/${PRIVATE_DOCUMENT_DIRECTORY}`,
      'private-document',
      output,
    )
  }

  return output.sort((a, b) => a.path.localeCompare(b.path))
}

async function snapshotDatabase(): Promise<VaultTableSnapshot[]> {
  const tables = [...db.tables].sort((a, b) => a.name.localeCompare(b.name))

  return db.transaction('r', tables, async () => {
    const snapshots: VaultTableSnapshot[] = []
    for (const table of tables) {
      snapshots.push({
        name: table.name,
        rows: await table.toArray(),
      })
    }
    return snapshots
  })
}

async function captureStableSnapshot(): Promise<{
  tables: VaultTableSnapshot[]
  files: VaultSourceFile[]
}> {
  const firstTables = await snapshotDatabase()
  const firstCanonical = stableJsonStringify(firstTables)
  const files = await collectManagedOpfsFiles()
  const secondTables = await snapshotDatabase()
  const secondCanonical = stableJsonStringify(secondTables)

  if (firstCanonical !== secondCanonical) {
    throw new Error('DTAgency data changed while the Vault snapshot was being prepared. Retry the export.')
  }

  return { tables: firstTables, files }
}

function buildFileManifest(files: VaultSourceFile[]): VaultFileManifestEntry[] {
  return files.map((source, index) => ({
    index,
    namespace: source.namespace,
    path: source.path,
    sizeBytes: source.file.size,
    chunkCount: source.file.size === 0 ? 0 : Math.ceil(source.file.size / VAULT_CHUNK_BYTES),
  }))
}

function buildVaultFileName(createdAt: string): string {
  const timestamp = createdAt.replace(/[:.]/g, '-').replace('Z', '')
  return `DTAgency-${timestamp}${VAULT_FILE_EXTENSION}`
}

async function getVaultStagingDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDirectory()
  const duranti = await root.getDirectoryHandle(ROOT_DIRECTORY, { create: true })
  return duranti.getDirectoryHandle(VAULT_STAGING_DIRECTORY, { create: true })
}

async function writeBytes(
  writable: FileSystemWritableFileStream,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  await writable.write(bytes)
}

function emitProgress(
  callback: PrepareVaultExportOptions['onProgress'],
  progress: VaultExportProgress,
): void {
  callback?.(progress)
}

export async function prepareVaultExport(
  passphrase: string,
  options: PrepareVaultExportOptions = {},
): Promise<PreparedVaultExport> {
  const archiveId = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  emitProgress(options.onProgress, {
    phase: 'snapshot',
    filesCompleted: 0,
    filesTotal: 0,
    bytesCompleted: 0,
    bytesTotal: 0,
  })

  const snapshot = await captureStableSnapshot()
  const fileManifest = buildFileManifest(snapshot.files)
  const sourceBytes = snapshot.files.reduce((total, item) => total + item.file.size, 0)

  emitProgress(options.onProgress, {
    phase: 'inventory',
    filesCompleted: 0,
    filesTotal: snapshot.files.length,
    bytesCompleted: 0,
    bytesTotal: sourceBytes,
  })

  const salt = crypto.getRandomValues(new Uint8Array(KDF_SALT_BYTES))
  const header: VaultHeaderV1 = {
    magic: 'DURVLT01',
    version: VAULT_FORMAT_VERSION,
    archiveId,
    createdAt,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: VAULT_PBKDF2_ITERATIONS,
      saltB64: bytesToBase64(salt),
    },
    encryption: {
      name: 'AES-GCM',
      keyBits: 256,
      ivBytes: 12,
      tagBits: 128,
    },
    chunkBytes: VAULT_CHUNK_BYTES,
  }

  const manifest: VaultManifestV1 = {
    format: 'duranti-vault',
    version: VAULT_FORMAT_VERSION,
    archiveId,
    createdAt,
    database: {
      name: DB_NAME,
      schemaVersion: DB_VERSION,
      tables: snapshot.tables,
    },
    files: fileManifest,
  }

  const headerBytes = new TextEncoder().encode(stableJsonStringify(header))
  const manifestBytes = new TextEncoder().encode(stableJsonStringify(manifest))
  if (manifestBytes.byteLength > MAX_VAULT_MANIFEST_BYTES) {
    manifestBytes.fill(0)
    throw new Error(`Vault structured manifest exceeds the ${MAX_VAULT_MANIFEST_BYTES} byte v1 limit.`)
  }

  const key = await deriveVaultKey(passphrase, salt, header.kdf.iterations)
  const fileName = buildVaultFileName(createdAt)
  const stagingDirectory = await getVaultStagingDirectory()
  const fileHandle = await stagingDirectory.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()

  let bytesCompleted = 0
  let filesCompleted = 0

  try {
    await writeBytes(writable, vaultMagicBytes())
    await writeBytes(writable, encodeUint32(headerBytes.byteLength))
    await writeBytes(writable, headerBytes)

    const encryptedManifest = await encryptVaultPayload(
      key,
      manifestAdditionalData(archiveId),
      manifestBytes,
    )
    try {
      await writeBytes(writable, new Uint8Array([VAULT_FRAME_MANIFEST]))
      await writeBytes(writable, encryptedManifest.iv)
      await writeBytes(writable, encodeUint32(encryptedManifest.ciphertext.byteLength))
      await writeBytes(writable, encryptedManifest.ciphertext)
    } finally {
      encryptedManifest.ciphertext.fill(0)
    }

    emitProgress(options.onProgress, {
      phase: 'encrypting',
      filesCompleted,
      filesTotal: snapshot.files.length,
      bytesCompleted,
      bytesTotal: sourceBytes,
    })

    for (const entry of fileManifest) {
      const source = snapshot.files[entry.index]
      if (!source || source.path !== entry.path) {
        throw new Error(`Vault source inventory is inconsistent at file index ${entry.index}.`)
      }

      for (let chunkIndex = 0; chunkIndex < entry.chunkCount; chunkIndex += 1) {
        const start = chunkIndex * VAULT_CHUNK_BYTES
        const end = Math.min(start + VAULT_CHUNK_BYTES, source.file.size)
        const plaintext = new Uint8Array(await source.file.slice(start, end).arrayBuffer())

        try {
          const encrypted = await encryptVaultPayload(
            key,
            fileChunkAdditionalData(
              archiveId,
              entry,
              chunkIndex,
              plaintext.byteLength,
            ),
            plaintext,
          )

          try {
            await writeBytes(writable, new Uint8Array([VAULT_FRAME_FILE_CHUNK]))
            await writeBytes(writable, encodeUint32(entry.index))
            await writeBytes(writable, encodeUint32(chunkIndex))
            await writeBytes(writable, encodeUint32(plaintext.byteLength))
            await writeBytes(writable, encrypted.iv)
            await writeBytes(writable, encodeUint32(encrypted.ciphertext.byteLength))
            await writeBytes(writable, encrypted.ciphertext)
          } finally {
            encrypted.ciphertext.fill(0)
          }
        } finally {
          plaintext.fill(0)
        }

        bytesCompleted += end - start
        emitProgress(options.onProgress, {
          phase: 'encrypting',
          filesCompleted,
          filesTotal: snapshot.files.length,
          bytesCompleted,
          bytesTotal: sourceBytes,
        })
      }

      filesCompleted += 1
      emitProgress(options.onProgress, {
        phase: 'encrypting',
        filesCompleted,
        filesTotal: snapshot.files.length,
        bytesCompleted,
        bytesTotal: sourceBytes,
      })
    }

    await writeBytes(writable, new Uint8Array([VAULT_FRAME_END]))
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      // Preserve the original export failure.
    }
    try {
      await stagingDirectory.removeEntry(fileName)
    } catch {
      // Best-effort cleanup of an incomplete encrypted Vault.
    }
    throw error
  } finally {
    manifestBytes.fill(0)
  }

  const exportedFile = await fileHandle.getFile()
  emitProgress(options.onProgress, {
    phase: 'complete',
    filesCompleted: snapshot.files.length,
    filesTotal: snapshot.files.length,
    bytesCompleted: sourceBytes,
    bytesTotal: sourceBytes,
  })

  return {
    archiveId,
    createdAt,
    fileName,
    mimeType: VAULT_MIME_TYPE,
    sizeBytes: exportedFile.size,
    sourceFileCount: snapshot.files.length,
    sourceBytes,
  }
}

export async function loadPreparedVaultFile(prepared: PreparedVaultExport): Promise<File> {
  const stagingDirectory = await getVaultStagingDirectory()
  const fileHandle = await stagingDirectory.getFileHandle(prepared.fileName)
  const file = await fileHandle.getFile()

  return new File([file], prepared.fileName, {
    type: VAULT_MIME_TYPE,
    lastModified: file.lastModified,
  })
}

export async function discardPreparedVault(prepared: PreparedVaultExport): Promise<void> {
  const stagingDirectory = await getVaultStagingDirectory()
  try {
    await stagingDirectory.removeEntry(prepared.fileName)
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
  }
}
