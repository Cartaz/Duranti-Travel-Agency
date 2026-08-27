import { DB_NAME, DB_VERSION, db } from '../data/db/dtagency-db'
import { assertBlock, assertEntityBase, isRecord } from '../data/db/validate'
import {
  MAX_VAULT_MANIFEST_BYTES,
  VAULT_CHUNK_BYTES,
  VAULT_FORMAT_VERSION,
  VAULT_FRAME_END,
  VAULT_FRAME_FILE_CHUNK,
  VAULT_FRAME_MANIFEST,
  base64ToBytes,
  decodeUint32,
  decryptVaultPayload,
  deriveVaultKey,
  fileChunkAdditionalData,
  manifestAdditionalData,
  vaultMagicBytes,
  type VaultFileManifestEntry,
  type VaultHeaderV1,
  type VaultManagedNamespace,
  type VaultManifestV1,
  type VaultTableSnapshot,
} from './format'
import { validateVaultDatabaseSnapshotV1 } from './validate-snapshot-v1'

const ROOT_DIRECTORY = 'dtagency'
const IMPORT_STAGING_DIRECTORY = 'vault-import-staging'
const STAGED_FILES_DIRECTORY = 'files'
const HEADER_LIMIT_BYTES = 64 * 1024
const AES_GCM_TAG_BYTES = 16
const PBKDF2_SALT_BYTES = 16
const MAX_PBKDF2_ITERATIONS = 5_000_000
const MAX_VAULT_FILES = 100_000
const MAX_MANAGED_PATH_BYTES = 2048
const SAFE_STAGE_ID = /^[A-Za-z0-9_-]+$/

export type VaultImportPhase = 'header' | 'manifest' | 'staging' | 'complete'

export interface VaultImportProgress {
  phase: VaultImportPhase
  filesCompleted: number
  filesTotal: number
  bytesCompleted: number
  bytesTotal: number
}

export interface StageVaultImportOptions {
  onProgress?: (progress: VaultImportProgress) => void
}

export interface StagedVaultImport {
  stageId: string
  archiveId: string
  archiveCreatedAt: string
  stagedAt: string
  sourceFileCount: number
  sourceBytes: number
  manifest: VaultManifestV1
}

class VaultFileReader {
  private offset = 0

  constructor(private readonly file: File) {}

  get position(): number {
    return this.offset
  }

  get remaining(): number {
    return this.file.size - this.offset
  }

  async readBytes(length: number, label: string): Promise<Uint8Array<ArrayBuffer>> {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new Error(`Vault ${label} length is invalid.`)
    }
    if (length > this.remaining) {
      throw new Error(`Vault ended unexpectedly while reading ${label}.`)
    }

    const buffer = await this.file.slice(this.offset, this.offset + length).arrayBuffer()
    if (buffer.byteLength !== length) {
      throw new Error(`Vault ${label} could not be read completely.`)
    }

    this.offset += length
    return new Uint8Array(buffer)
  }

  async readByte(label: string): Promise<number> {
    const bytes = await this.readBytes(1, label)
    return bytes[0]
  }

  async readUint32(label: string): Promise<number> {
    return decodeUint32(await this.readBytes(4, label))
  }
}

function emitProgress(
  callback: StageVaultImportOptions['onProgress'],
  progress: VaultImportProgress,
): void {
  try {
    callback?.(progress)
  } catch {
    // Progress rendering must not make a cryptographic import fail.
  }
}

function assertString(
  value: unknown,
  label: string,
  maximumLength = 512,
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new Error(`${label} is invalid.`)
  }
}

function assertSafeIdentifier(value: unknown, label: string): asserts value is string {
  assertString(value, label, 128)
  if (!SAFE_STAGE_ID.test(value)) throw new Error(`${label} contains unsupported characters.`)
}

function assertIsoTimestamp(value: unknown, label: string): asserts value is string {
  assertString(value, label, 64)
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} is not a valid timestamp.`)
}

function parseJsonBytes(bytes: Uint8Array<ArrayBuffer>, label: string): unknown {
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${label} is not valid UTF-8.`)
  }

  try {
    return JSON.parse(decoded) as unknown
  } catch {
    throw new Error(`${label} is not valid JSON.`)
  }
}

function assertHeader(value: unknown): asserts value is VaultHeaderV1 {
  if (!isRecord(value)) throw new Error('Vault header is not an object.')

  assertSafeIdentifier(value.archiveId, 'Vault archive ID')
  assertIsoTimestamp(value.createdAt, 'Vault creation time')

  if (value.magic !== 'DTAVLT01' || value.version !== VAULT_FORMAT_VERSION) {
    throw new Error('Unsupported DTAgency Vault header version.')
  }

  if (!isRecord(value.kdf)) throw new Error('Vault KDF metadata is missing.')
  if (
    value.kdf.name !== 'PBKDF2' ||
    value.kdf.hash !== 'SHA-256' ||
    typeof value.kdf.iterations !== 'number' ||
    !Number.isSafeInteger(value.kdf.iterations) ||
    value.kdf.iterations < 100_000 ||
    value.kdf.iterations > MAX_PBKDF2_ITERATIONS ||
    typeof value.kdf.saltB64 !== 'string'
  ) {
    throw new Error('Vault KDF metadata is unsupported or invalid.')
  }

  if (!isRecord(value.encryption)) throw new Error('Vault encryption metadata is missing.')
  if (
    value.encryption.name !== 'AES-GCM' ||
    value.encryption.keyBits !== 256 ||
    value.encryption.ivBytes !== 12 ||
    value.encryption.tagBits !== 128
  ) {
    throw new Error('Vault encryption parameters are unsupported.')
  }

  if (value.chunkBytes !== VAULT_CHUNK_BYTES) {
    throw new Error('Vault chunk size is incompatible with this app version.')
  }

  let salt: Uint8Array<ArrayBuffer>
  try {
    salt = base64ToBytes(value.kdf.saltB64)
  } catch {
    throw new Error('Vault PBKDF2 salt is not valid base64.')
  }
  try {
    if (salt.byteLength !== PBKDF2_SALT_BYTES) {
      throw new Error('Vault PBKDF2 salt has an unsupported length.')
    }
  } finally {
    salt.fill(0)
  }
}

function validateManagedPath(namespace: VaultManagedNamespace, path: unknown): asserts path is string {
  assertString(path, 'Vault managed path', MAX_MANAGED_PATH_BYTES)
  if (path.includes('\\') || path.includes('\0')) {
    throw new Error(`Vault path ${path} contains unsupported characters.`)
  }

  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Vault path ${path} contains unsafe path segments.`)
  }

  const prefix = namespace === 'media'
    ? ['dtagency', 'media']
    : ['dtagency', 'private', 'traveler-documents']

  if (
    segments.length <= prefix.length ||
    prefix.some((segment, index) => segments[index] !== segment)
  ) {
    throw new Error(`Vault path ${path} does not belong to its managed namespace.`)
  }
}

function validateTableRows(snapshot: VaultTableSnapshot): void {
  const table = db.tables.find((candidate) => candidate.name === snapshot.name)
  if (!table) throw new Error(`Vault references unknown table ${snapshot.name}.`)

  const keyPath = table.schema.primKey.keyPath
  if (typeof keyPath !== 'string' || keyPath.length === 0) {
    throw new Error(`Vault import does not support table ${snapshot.name} primary key shape.`)
  }

  const seenKeys = new Set<string>()
  for (const row of snapshot.rows) {
    if (!isRecord(row)) throw new Error(`Vault table ${snapshot.name} contains a non-object row.`)

    const primaryKey = row[keyPath]
    if (typeof primaryKey !== 'string' || primaryKey.length === 0) {
      throw new Error(`Vault table ${snapshot.name} contains an invalid primary key.`)
    }
    if (seenKeys.has(primaryKey)) {
      throw new Error(`Vault table ${snapshot.name} contains duplicate primary key ${primaryKey}.`)
    }
    seenKeys.add(primaryKey)

    if (snapshot.name === 'appMeta') continue

    assertEntityBase(row, `Vault ${snapshot.name} row`)
    if (snapshot.name === 'blocks') assertBlock(row)
  }
}

function validateTables(value: unknown): VaultTableSnapshot[] {
  if (!Array.isArray(value)) throw new Error('Vault database tables are missing.')

  const expectedNames = db.tables.map((table) => table.name).sort((a, b) => a.localeCompare(b))
  if (value.length !== expectedNames.length) {
    throw new Error('Vault database table set is incompatible with this app version.')
  }

  const snapshots: VaultTableSnapshot[] = []
  const seenNames = new Set<string>()

  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.name !== 'string' || !Array.isArray(raw.rows)) {
      throw new Error('Vault contains an invalid database table snapshot.')
    }
    if (seenNames.has(raw.name)) throw new Error(`Vault contains duplicate table ${raw.name}.`)
    seenNames.add(raw.name)

    const snapshot: VaultTableSnapshot = {
      name: raw.name,
      rows: raw.rows,
    }
    validateTableRows(snapshot)
    snapshots.push(snapshot)
  }

  const actualNames = [...seenNames].sort((a, b) => a.localeCompare(b))
  if (actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new Error('Vault database table names are incompatible with this app version.')
  }

  return snapshots.sort((a, b) => a.name.localeCompare(b.name))
}

function validateFiles(value: unknown): {
  files: VaultFileManifestEntry[]
  sourceBytes: number
} {
  if (!Array.isArray(value)) throw new Error('Vault file manifest is missing.')
  if (value.length > MAX_VAULT_FILES) throw new Error('Vault contains too many managed files.')

  const files: VaultFileManifestEntry[] = []
  const seenPaths = new Set<string>()
  let sourceBytes = 0

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index]
    if (!isRecord(raw)) throw new Error(`Vault file entry ${index} is invalid.`)

    if (
      raw.index !== index ||
      (raw.namespace !== 'media' && raw.namespace !== 'private-document') ||
      typeof raw.sizeBytes !== 'number' ||
      !Number.isSafeInteger(raw.sizeBytes) ||
      raw.sizeBytes < 0 ||
      typeof raw.chunkCount !== 'number' ||
      !Number.isSafeInteger(raw.chunkCount) ||
      raw.chunkCount < 0
    ) {
      throw new Error(`Vault file entry ${index} has invalid metadata.`)
    }

    validateManagedPath(raw.namespace, raw.path)

    const expectedChunkCount = raw.sizeBytes === 0
      ? 0
      : Math.ceil(raw.sizeBytes / VAULT_CHUNK_BYTES)
    if (raw.chunkCount !== expectedChunkCount) {
      throw new Error(`Vault file entry ${index} has an inconsistent chunk count.`)
    }
    if (seenPaths.has(raw.path)) {
      throw new Error(`Vault contains duplicate managed path ${raw.path}.`)
    }
    seenPaths.add(raw.path)

    if (sourceBytes > Number.MAX_SAFE_INTEGER - raw.sizeBytes) {
      throw new Error('Vault source byte count exceeds the supported integer range.')
    }
    sourceBytes += raw.sizeBytes

    files.push({
      index,
      namespace: raw.namespace,
      path: raw.path,
      sizeBytes: raw.sizeBytes,
      chunkCount: raw.chunkCount,
    })
  }

  return { files, sourceBytes }
}

function validateManifest(value: unknown, header: VaultHeaderV1): {
  manifest: VaultManifestV1
  sourceBytes: number
} {
  if (!isRecord(value)) throw new Error('Vault manifest is not an object.')
  if (
    value.format !== 'dtagency-vault' ||
    value.version !== VAULT_FORMAT_VERSION ||
    value.archiveId !== header.archiveId ||
    value.createdAt !== header.createdAt
  ) {
    throw new Error('Vault manifest identity does not match its authenticated header.')
  }

  if (!isRecord(value.database)) throw new Error('Vault database manifest is missing.')
  if (value.database.name !== DB_NAME || value.database.schemaVersion !== DB_VERSION) {
    throw new Error('Vault database schema is incompatible with this app version.')
  }

  const tables = validateTables(value.database.tables)
  validateVaultDatabaseSnapshotV1(tables)
  const { files, sourceBytes } = validateFiles(value.files)

  return {
    manifest: {
      format: 'dtagency-vault',
      version: VAULT_FORMAT_VERSION,
      archiveId: header.archiveId,
      createdAt: header.createdAt,
      database: {
        name: DB_NAME,
        schemaVersion: DB_VERSION,
        tables,
      },
      files,
    },
    sourceBytes,
  }
}

async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    throw new Error('Origin Private File System (OPFS) is not available in this browser.')
  }
  return navigator.storage.getDirectory()
}

async function getImportStagingRoot(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const root = await getRootDirectory()
  try {
    const dtagency = await root.getDirectoryHandle(ROOT_DIRECTORY, { create })
    return await dtagency.getDirectoryHandle(IMPORT_STAGING_DIRECTORY, { create })
  } catch (error) {
    if (!create && error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

function assertStageId(stageId: string): void {
  if (!SAFE_STAGE_ID.test(stageId)) throw new Error('Vault staging ID is invalid.')
}

function stagedFileName(index: number): string {
  return `${String(index).padStart(8, '0')}.bin`
}

async function createStageDirectory(stageId: string): Promise<{
  root: FileSystemDirectoryHandle
  stage: FileSystemDirectoryHandle
  files: FileSystemDirectoryHandle
}> {
  assertStageId(stageId)
  const root = await getImportStagingRoot(true)
  if (!root) throw new Error('Vault import staging root could not be created.')

  const stage = await root.getDirectoryHandle(stageId, { create: true })
  const files = await stage.getDirectoryHandle(STAGED_FILES_DIRECTORY, { create: true })
  return { root, stage, files }
}

async function deleteStageDirectory(stageId: string): Promise<void> {
  assertStageId(stageId)
  const root = await getImportStagingRoot(false)
  if (!root) return

  try {
    await root.removeEntry(stageId, { recursive: true })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
  }
}

function assertMagic(actual: Uint8Array<ArrayBuffer>): void {
  const expected = vaultMagicBytes()
  if (
    actual.byteLength !== expected.byteLength ||
    actual.some((byte, index) => byte !== expected[index])
  ) {
    throw new Error('File is not a DTAgency Vault v1 archive.')
  }
}

async function readAndValidateHeader(reader: VaultFileReader): Promise<VaultHeaderV1> {
  assertMagic(await reader.readBytes(vaultMagicBytes().byteLength, 'file magic'))

  const headerLength = await reader.readUint32('header length')
  if (headerLength <= 0 || headerLength > HEADER_LIMIT_BYTES) {
    throw new Error('Vault header length is invalid.')
  }

  const value = parseJsonBytes(await reader.readBytes(headerLength, 'header'), 'Vault header')
  assertHeader(value)
  return value
}

async function readAndDecryptManifest(
  reader: VaultFileReader,
  header: VaultHeaderV1,
  key: CryptoKey,
): Promise<{ manifest: VaultManifestV1; sourceBytes: number }> {
  const frameType = await reader.readByte('manifest frame type')
  if (frameType !== VAULT_FRAME_MANIFEST) {
    throw new Error('Vault manifest frame is missing or out of order.')
  }

  const iv = await reader.readBytes(header.encryption.ivBytes, 'manifest IV')
  const ciphertextLength = await reader.readUint32('manifest ciphertext length')
  if (
    ciphertextLength < AES_GCM_TAG_BYTES ||
    ciphertextLength > MAX_VAULT_MANIFEST_BYTES + AES_GCM_TAG_BYTES
  ) {
    throw new Error('Vault manifest ciphertext length is invalid.')
  }

  const ciphertext = await reader.readBytes(ciphertextLength, 'manifest ciphertext')
  let plaintext: Uint8Array<ArrayBuffer>

  try {
    plaintext = await decryptVaultPayload(
      key,
      manifestAdditionalData(header.archiveId),
      iv,
      ciphertext,
    )
  } catch {
    throw new Error('Vault password is incorrect or the archive manifest is corrupted.')
  } finally {
    ciphertext.fill(0)
  }

  try {
    if (plaintext.byteLength > MAX_VAULT_MANIFEST_BYTES) {
      throw new Error('Vault manifest exceeds the supported size limit.')
    }
    return validateManifest(parseJsonBytes(plaintext, 'Vault manifest'), header)
  } finally {
    plaintext.fill(0)
  }
}

async function stageOneFile(
  reader: VaultFileReader,
  key: CryptoKey,
  archiveId: string,
  entry: VaultFileManifestEntry,
  filesDirectory: FileSystemDirectoryHandle,
  onChunk: (bytes: number) => void,
): Promise<void> {
  const fileHandle = await filesDirectory.getFileHandle(stagedFileName(entry.index), { create: true })
  const writable = await fileHandle.createWritable()

  try {
    for (let chunkIndex = 0; chunkIndex < entry.chunkCount; chunkIndex += 1) {
      const frameType = await reader.readByte(`file ${entry.index} chunk ${chunkIndex} frame type`)
      if (frameType !== VAULT_FRAME_FILE_CHUNK) {
        throw new Error(`Vault file ${entry.index} chunk ${chunkIndex} frame is missing or out of order.`)
      }

      const fileIndex = await reader.readUint32('file index')
      const actualChunkIndex = await reader.readUint32('chunk index')
      const plaintextLength = await reader.readUint32('chunk plaintext length')

      const remainingBytes = entry.sizeBytes - chunkIndex * VAULT_CHUNK_BYTES
      const expectedPlaintextLength = Math.min(VAULT_CHUNK_BYTES, remainingBytes)
      if (
        fileIndex !== entry.index ||
        actualChunkIndex !== chunkIndex ||
        plaintextLength !== expectedPlaintextLength
      ) {
        throw new Error(`Vault file ${entry.index} chunk ${chunkIndex} metadata is inconsistent.`)
      }

      const iv = await reader.readBytes(12, 'chunk IV')
      const ciphertextLength = await reader.readUint32('chunk ciphertext length')
      if (ciphertextLength !== plaintextLength + AES_GCM_TAG_BYTES) {
        throw new Error(`Vault file ${entry.index} chunk ${chunkIndex} ciphertext length is invalid.`)
      }

      const ciphertext = await reader.readBytes(ciphertextLength, 'chunk ciphertext')
      let plaintext: Uint8Array<ArrayBuffer>

      try {
        plaintext = await decryptVaultPayload(
          key,
          fileChunkAdditionalData(archiveId, entry, chunkIndex, plaintextLength),
          iv,
          ciphertext,
        )
      } catch {
        throw new Error(`Vault file ${entry.index} chunk ${chunkIndex} failed authentication.`)
      } finally {
        ciphertext.fill(0)
      }

      try {
        if (plaintext.byteLength !== plaintextLength) {
          throw new Error(`Vault file ${entry.index} chunk ${chunkIndex} decrypted length is invalid.`)
        }
        await writable.write(plaintext)
      } finally {
        plaintext.fill(0)
      }

      onChunk(plaintextLength)
    }

    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      // Preserve the original staging error.
    }
    throw error
  }

  const stagedFile = await fileHandle.getFile()
  if (stagedFile.size !== entry.sizeBytes) {
    throw new Error(`Vault staged file ${entry.index} failed its final size check.`)
  }
}

export async function stageVaultImport(
  file: File,
  passphrase: string,
  options: StageVaultImportOptions = {},
): Promise<StagedVaultImport> {
  const reader = new VaultFileReader(file)

  emitProgress(options.onProgress, {
    phase: 'header',
    filesCompleted: 0,
    filesTotal: 0,
    bytesCompleted: 0,
    bytesTotal: 0,
  })

  const header = await readAndValidateHeader(reader)
  let salt: Uint8Array<ArrayBuffer>
  try {
    salt = base64ToBytes(header.kdf.saltB64)
  } catch {
    throw new Error('Vault PBKDF2 salt is not valid base64.')
  }

  let key: CryptoKey
  try {
    key = await deriveVaultKey(passphrase, salt, header.kdf.iterations)
  } finally {
    salt.fill(0)
  }

  emitProgress(options.onProgress, {
    phase: 'manifest',
    filesCompleted: 0,
    filesTotal: 0,
    bytesCompleted: 0,
    bytesTotal: 0,
  })

  const { manifest, sourceBytes } = await readAndDecryptManifest(reader, header, key)
  const stageId = crypto.randomUUID()
  const stagedAt = new Date().toISOString()

  let filesCompleted = 0
  let bytesCompleted = 0

  try {
    const { files: filesDirectory } = await createStageDirectory(stageId)
    emitProgress(options.onProgress, {
      phase: 'staging',
      filesCompleted,
      filesTotal: manifest.files.length,
      bytesCompleted,
      bytesTotal: sourceBytes,
    })

    for (const entry of manifest.files) {
      await stageOneFile(
        reader,
        key,
        manifest.archiveId,
        entry,
        filesDirectory,
        (bytes) => {
          bytesCompleted += bytes
          emitProgress(options.onProgress, {
            phase: 'staging',
            filesCompleted,
            filesTotal: manifest.files.length,
            bytesCompleted,
            bytesTotal: sourceBytes,
          })
        },
      )

      filesCompleted += 1
      emitProgress(options.onProgress, {
        phase: 'staging',
        filesCompleted,
        filesTotal: manifest.files.length,
        bytesCompleted,
        bytesTotal: sourceBytes,
      })
    }

    const endFrame = await reader.readByte('end frame')
    if (endFrame !== VAULT_FRAME_END) throw new Error('Vault end frame is missing.')
    if (reader.remaining !== 0) throw new Error('Vault contains unexpected trailing bytes.')
    if (bytesCompleted !== sourceBytes) throw new Error('Vault staged byte count is inconsistent.')
  } catch (error) {
    try {
      await deleteStageDirectory(stageId)
    } catch {
      // Preserve the original import failure.
    }
    throw error
  }

  emitProgress(options.onProgress, {
    phase: 'complete',
    filesCompleted,
    filesTotal: manifest.files.length,
    bytesCompleted,
    bytesTotal: sourceBytes,
  })

  return {
    stageId,
    archiveId: manifest.archiveId,
    archiveCreatedAt: manifest.createdAt,
    stagedAt,
    sourceFileCount: manifest.files.length,
    sourceBytes,
    manifest,
  }
}

export async function discardStagedVaultImport(staged: StagedVaultImport): Promise<void> {
  await deleteStageDirectory(staged.stageId)
}