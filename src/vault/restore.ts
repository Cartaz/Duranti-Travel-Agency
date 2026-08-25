import { DB_NAME, DB_VERSION, db } from '../data/db/dtagency-db'
import { scanMediaIntegrity, type MediaIntegrityReport } from '../data/storage/media-integrity'
import { lockLocalEncryption } from '../security/local-encryption'
import {
  VAULT_CHUNK_BYTES,
  stableJsonStringify,
  type VaultFileManifestEntry,
  type VaultManagedNamespace,
  type VaultTableSnapshot,
} from './format'
import type { StagedVaultImport } from './import'

const ROOT_DIRECTORY = 'dtagency'
const MEDIA_DIRECTORY = 'media'
const PRIVATE_DIRECTORY = 'private'
const PRIVATE_DOCUMENT_DIRECTORY = 'traveler-documents'
const IMPORT_STAGING_DIRECTORY = 'vault-import-staging'
const STAGED_FILES_DIRECTORY = 'files'
const RESTORE_STATE_DIRECTORY = 'vault-restore-state'
const RESTORE_BACKUP_DIRECTORY = 'vault-restore-backup'
const RESTORE_JOURNAL_FILE = 'current.json'
const BACKUP_MANIFEST_FILE = 'manifest.json'
const BACKUP_FILES_DIRECTORY = 'files'
const RESTORE_JOURNAL_VERSION = 1 as const
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]+$/

type RestorePhase = 'files-mutating' | 'files-promoted' | 'committed'

interface ManagedFileSnapshot {
  namespace: VaultManagedNamespace
  path: string
  sizeBytes: number
  file: File
}

interface RestoreBackupEntry {
  index: number
  namespace: VaultManagedNamespace
  path: string
  sizeBytes: number
}

interface RestoreBackupManifest {
  version: 1
  restoreId: string
  createdAt: string
  files: RestoreBackupEntry[]
}

interface RestoreJournal {
  version: 1
  restoreId: string
  stageId: string
  archiveId: string
  targetDatabaseSha256: string
  phase: RestorePhase
  createdAt: string
  updatedAt: string
}

export type VaultRestoreRecoveryResult = 'none' | 'rolled-back' | 'finalized-committed'

export type VaultRestorePhase =
  | 'recovering'
  | 'backup'
  | 'promoting-files'
  | 'committing-database'
  | 'verifying'
  | 'cleanup'
  | 'complete'

export interface VaultRestoreProgress {
  phase: VaultRestorePhase
  filesCompleted: number
  filesTotal: number
  bytesCompleted: number
  bytesTotal: number
}

export interface CommitStagedVaultImportOptions {
  mode: 'replace'
  onProgress?: (progress: VaultRestoreProgress) => void
}

export interface VaultRestoreResult {
  restoreId: string
  archiveId: string
  restoredFileCount: number
  restoredBytes: number
  databaseVerified: boolean
  filesVerified: boolean
  mediaIntegrity?: MediaIntegrityReport
  verificationErrors: string[]
  cleanupComplete: boolean
}

function assertOpfsSupport(): void {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    throw new Error('Origin Private File System (OPFS) is not available in this browser.')
  }
}

function hasOpfsSupport(): boolean {
  return 'storage' in navigator && typeof navigator.storage.getDirectory === 'function'
}

async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
  assertOpfsSupport()
  return navigator.storage.getDirectory()
}

async function getDirectoryEntries(
  directory: FileSystemDirectoryHandle,
): Promise<Array<[string, FileSystemHandle]>> {
  const iterable = directory as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }
  if (typeof iterable.entries !== 'function') {
    throw new Error('OPFS directory iteration is not available in this browser build.')
  }
  const entries: Array<[string, FileSystemHandle]> = []
  for await (const entry of iterable.entries()) entries.push(entry)
  return entries
}

async function getExistingDirectory(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

async function getExistingNestedDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle | null> {
  let current = root
  for (const segment of segments) {
    const next = await getExistingDirectory(current, segment)
    if (!next) return null
    current = next
  }
  return current
}

async function ensureNestedDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle> {
  let current = root
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true })
  }
  return current
}

async function removeEntryIfExists(
  directory: FileSystemDirectoryHandle,
  name: string,
  recursive = false,
): Promise<void> {
  try {
    await directory.removeEntry(name, { recursive })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
  }
}

function assertSafeIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`${label} is invalid.`)
}

function emitProgress(
  callback: CommitStagedVaultImportOptions['onProgress'],
  progress: VaultRestoreProgress,
): void {
  try {
    callback?.(progress)
  } catch {
    // Progress rendering must never affect restore semantics.
  }
}

function stagedFileName(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Vault staged file index is invalid.')
  return `${String(index).padStart(8, '0')}.bin`
}

function backupFileName(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Vault backup file index is invalid.')
  return `${String(index).padStart(8, '0')}.bin`
}

function managedPrefix(namespace: VaultManagedNamespace): string[] {
  return namespace === 'media'
    ? [ROOT_DIRECTORY, MEDIA_DIRECTORY]
    : [ROOT_DIRECTORY, PRIVATE_DIRECTORY, PRIVATE_DOCUMENT_DIRECTORY]
}

function validateManagedPath(namespace: VaultManagedNamespace, path: string): string[] {
  const segments = path.split('/')
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    path.includes('\\') ||
    path.includes('\0')
  ) {
    throw new Error(`Managed restore path ${path} is unsafe.`)
  }

  const prefix = managedPrefix(namespace)
  if (
    segments.length <= prefix.length ||
    prefix.some((segment, index) => segments[index] !== segment)
  ) {
    throw new Error(`Managed restore path ${path} does not match namespace ${namespace}.`)
  }
  return segments
}

async function writeFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  source: Blob,
): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(source)
    await writable.close()
  } catch (error) {
    try { await writable.abort() } catch { /* preserve original error */ }
    throw error
  }
  const written = await handle.getFile()
  if (written.size !== source.size) throw new Error(`OPFS write verification failed for ${name}.`)
}

async function writeManagedFile(
  root: FileSystemDirectoryHandle,
  namespace: VaultManagedNamespace,
  path: string,
  source: Blob,
): Promise<void> {
  const segments = validateManagedPath(namespace, path)
  const directory = await ensureNestedDirectory(root, segments.slice(0, -1))
  await writeFile(directory, segments[segments.length - 1], source)
}

async function collectFilesRecursively(
  directory: FileSystemDirectoryHandle,
  pathPrefix: string,
  namespace: VaultManagedNamespace,
  output: ManagedFileSnapshot[],
): Promise<void> {
  const entries = await getDirectoryEntries(directory)
  entries.sort(([left], [right]) => left.localeCompare(right))
  for (const [name, handle] of entries) {
    const path = `${pathPrefix}/${name}`
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile()
      output.push({ namespace, path, sizeBytes: file.size, file })
    } else {
      await collectFilesRecursively(handle as FileSystemDirectoryHandle, path, namespace, output)
    }
  }
}

async function collectManagedLiveFiles(): Promise<ManagedFileSnapshot[]> {
  const root = await getRootDirectory()
  const output: ManagedFileSnapshot[] = []

  const media = await getExistingNestedDirectory(root, [ROOT_DIRECTORY, MEDIA_DIRECTORY])
  if (media) {
    await collectFilesRecursively(media, `${ROOT_DIRECTORY}/${MEDIA_DIRECTORY}`, 'media', output)
  }

  const privateDocuments = await getExistingNestedDirectory(root, [
    ROOT_DIRECTORY,
    PRIVATE_DIRECTORY,
    PRIVATE_DOCUMENT_DIRECTORY,
  ])
  if (privateDocuments) {
    await collectFilesRecursively(
      privateDocuments,
      `${ROOT_DIRECTORY}/${PRIVATE_DIRECTORY}/${PRIVATE_DOCUMENT_DIRECTORY}`,
      'private-document',
      output,
    )
  }

  return output.sort((left, right) => left.path.localeCompare(right.path))
}

async function clearManagedLiveFiles(): Promise<void> {
  const root = await getRootDirectory()
  const appRoot = await getExistingDirectory(root, ROOT_DIRECTORY)
  if (!appRoot) return
  await removeEntryIfExists(appRoot, MEDIA_DIRECTORY, true)
  const privateDirectory = await getExistingDirectory(appRoot, PRIVATE_DIRECTORY)
  if (privateDirectory) await removeEntryIfExists(privateDirectory, PRIVATE_DOCUMENT_DIRECTORY, true)
}

async function getImportStageFilesDirectory(stageId: string): Promise<FileSystemDirectoryHandle> {
  assertSafeIdentifier(stageId, 'Vault staging ID')
  const root = await getRootDirectory()
  const directory = await getExistingNestedDirectory(root, [
    ROOT_DIRECTORY,
    IMPORT_STAGING_DIRECTORY,
    stageId,
    STAGED_FILES_DIRECTORY,
  ])
  if (!directory) throw new Error(`Vault import staging ${stageId} was not found.`)
  return directory
}

async function getStagedFile(
  filesDirectory: FileSystemDirectoryHandle,
  entry: VaultFileManifestEntry,
): Promise<File> {
  const handle = await filesDirectory.getFileHandle(stagedFileName(entry.index))
  const file = await handle.getFile()
  if (file.size !== entry.sizeBytes) {
    throw new Error(`Vault staged file ${entry.index} no longer matches its validated size.`)
  }
  return file
}

async function getRestoreStateDirectory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const root = await getRootDirectory()
  const appRoot = create
    ? await root.getDirectoryHandle(ROOT_DIRECTORY, { create: true })
    : await getExistingDirectory(root, ROOT_DIRECTORY)
  if (!appRoot) return null
  return create
    ? appRoot.getDirectoryHandle(RESTORE_STATE_DIRECTORY, { create: true })
    : getExistingDirectory(appRoot, RESTORE_STATE_DIRECTORY)
}

async function getRestoreBackupRoot(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const root = await getRootDirectory()
  const appRoot = create
    ? await root.getDirectoryHandle(ROOT_DIRECTORY, { create: true })
    : await getExistingDirectory(root, ROOT_DIRECTORY)
  if (!appRoot) return null
  return create
    ? appRoot.getDirectoryHandle(RESTORE_BACKUP_DIRECTORY, { create: true })
    : getExistingDirectory(appRoot, RESTORE_BACKUP_DIRECTORY)
}

async function writeJsonFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  value: unknown,
): Promise<void> {
  const bytes = new TextEncoder().encode(stableJsonStringify(value))
  try {
    await writeFile(directory, name, new Blob([bytes], { type: 'application/json' }))
  } finally {
    bytes.fill(0)
  }
}

async function readJsonFile(directory: FileSystemDirectoryHandle, name: string): Promise<unknown> {
  const handle = await directory.getFileHandle(name)
  const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer())
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw new Error(`Vault restore metadata file ${name} is invalid.`)
  } finally {
    bytes.fill(0)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertStagedVaultImportReady(staged: StagedVaultImport): void {
  assertSafeIdentifier(staged.stageId, 'Vault staging ID')
  assertSafeIdentifier(staged.archiveId, 'Vault archive ID')
  if (
    staged.manifest.format !== 'dtagency-vault' ||
    staged.manifest.version !== 1 ||
    staged.manifest.archiveId !== staged.archiveId ||
    staged.manifest.createdAt !== staged.archiveCreatedAt ||
    staged.manifest.database.name !== DB_NAME ||
    staged.manifest.database.schemaVersion !== DB_VERSION
  ) {
    throw new Error('Vault staged manifest identity is incompatible with this app version.')
  }

  const expectedTableNames = db.tables.map((table) => table.name).sort((a, b) => a.localeCompare(b))
  const actualTableNames = staged.manifest.database.tables.map((table) => table.name).sort((a, b) => a.localeCompare(b))
  if (
    actualTableNames.length !== expectedTableNames.length ||
    actualTableNames.some((name, index) => name !== expectedTableNames[index])
  ) {
    throw new Error('Vault staged database table set is incompatible with this app version.')
  }

  const seenPaths = new Set<string>()
  let sourceBytes = 0
  for (let index = 0; index < staged.manifest.files.length; index += 1) {
    const entry = staged.manifest.files[index]
    if (
      entry.index !== index ||
      (entry.namespace !== 'media' && entry.namespace !== 'private-document') ||
      !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0 ||
      !Number.isSafeInteger(entry.chunkCount) || entry.chunkCount < 0
    ) {
      throw new Error(`Vault staged file entry ${index} is invalid.`)
    }
    validateManagedPath(entry.namespace, entry.path)
    if (seenPaths.has(entry.path)) throw new Error(`Vault staged manifest contains duplicate path ${entry.path}.`)
    seenPaths.add(entry.path)
    const expectedChunks = entry.sizeBytes === 0 ? 0 : Math.ceil(entry.sizeBytes / VAULT_CHUNK_BYTES)
    if (entry.chunkCount !== expectedChunks) throw new Error(`Vault staged file entry ${index} has an inconsistent chunk count.`)
    sourceBytes += entry.sizeBytes
  }
  if (staged.sourceFileCount !== staged.manifest.files.length || staged.sourceBytes !== sourceBytes) {
    throw new Error('Vault staged summary no longer matches its authenticated manifest.')
  }
}

function assertRestoreJournal(value: unknown): asserts value is RestoreJournal {
  if (!isRecord(value)) throw new Error('Vault restore journal is invalid.')
  if (
    value.version !== RESTORE_JOURNAL_VERSION ||
    typeof value.restoreId !== 'string' ||
    typeof value.stageId !== 'string' ||
    typeof value.archiveId !== 'string' ||
    typeof value.targetDatabaseSha256 !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !['files-mutating', 'files-promoted', 'committed'].includes(String(value.phase))
  ) {
    throw new Error('Vault restore journal has an unsupported shape.')
  }
  assertSafeIdentifier(value.restoreId, 'Vault restore ID')
  assertSafeIdentifier(value.stageId, 'Vault staging ID')
  assertSafeIdentifier(value.archiveId, 'Vault archive ID')
  if (!/^[a-f0-9]{64}$/.test(value.targetDatabaseSha256)) {
    throw new Error('Vault restore target database fingerprint is invalid.')
  }
}

function assertBackupManifest(value: unknown, restoreId: string): RestoreBackupManifest {
  if (!isRecord(value) || value.version !== 1 || value.restoreId !== restoreId || !Array.isArray(value.files)) {
    throw new Error('Vault restore backup manifest is invalid.')
  }
  const files: RestoreBackupEntry[] = value.files.map((raw, index) => {
    if (
      !isRecord(raw) || raw.index !== index ||
      (raw.namespace !== 'media' && raw.namespace !== 'private-document') ||
      typeof raw.path !== 'string' || typeof raw.sizeBytes !== 'number' ||
      !Number.isSafeInteger(raw.sizeBytes) || raw.sizeBytes < 0
    ) {
      throw new Error(`Vault restore backup entry ${index} is invalid.`)
    }
    validateManagedPath(raw.namespace, raw.path)
    return { index, namespace: raw.namespace, path: raw.path, sizeBytes: raw.sizeBytes }
  })
  return {
    version: 1,
    restoreId,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    files,
  }
}

async function writeRestoreJournal(journal: RestoreJournal): Promise<void> {
  const directory = await getRestoreStateDirectory(true)
  if (!directory) throw new Error('Vault restore state directory could not be created.')
  await writeJsonFile(directory, RESTORE_JOURNAL_FILE, journal)
}

async function readRestoreJournal(): Promise<RestoreJournal | undefined> {
  if (!hasOpfsSupport()) return undefined
  const directory = await getRestoreStateDirectory(false)
  if (!directory) return undefined
  try {
    const value = await readJsonFile(directory, RESTORE_JOURNAL_FILE)
    assertRestoreJournal(value)
    return value
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return undefined
    throw error
  }
}

async function deleteRestoreJournal(): Promise<void> {
  const directory = await getRestoreStateDirectory(false)
  if (directory) await removeEntryIfExists(directory, RESTORE_JOURNAL_FILE)
}

async function createBackup(restoreId: string, files: ManagedFileSnapshot[]): Promise<void> {
  const root = await getRestoreBackupRoot(true)
  if (!root) throw new Error('Vault restore backup root could not be created.')
  await removeEntryIfExists(root, restoreId, true)
  const backup = await root.getDirectoryHandle(restoreId, { create: true })
  const backupFiles = await backup.getDirectoryHandle(BACKUP_FILES_DIRECTORY, { create: true })
  const entries: RestoreBackupEntry[] = []
  for (let index = 0; index < files.length; index += 1) {
    const source = files[index]
    await writeFile(backupFiles, backupFileName(index), source.file)
    entries.push({ index, namespace: source.namespace, path: source.path, sizeBytes: source.sizeBytes })
  }
  await writeJsonFile(backup, BACKUP_MANIFEST_FILE, {
    version: 1,
    restoreId,
    createdAt: new Date().toISOString(),
    files: entries,
  } satisfies RestoreBackupManifest)
}

async function deleteBackup(restoreId: string): Promise<void> {
  const root = await getRestoreBackupRoot(false)
  if (root) await removeEntryIfExists(root, restoreId, true)
}

async function restoreBackupFiles(restoreId: string): Promise<void> {
  const root = await getRestoreBackupRoot(false)
  if (!root) throw new Error(`Vault restore backup ${restoreId} is missing.`)
  const backup = await root.getDirectoryHandle(restoreId)
  const manifest = assertBackupManifest(await readJsonFile(backup, BACKUP_MANIFEST_FILE), restoreId)
  const backupFiles = await backup.getDirectoryHandle(BACKUP_FILES_DIRECTORY)
  const opfsRoot = await getRootDirectory()
  await clearManagedLiveFiles()
  for (const entry of manifest.files) {
    const file = await (await backupFiles.getFileHandle(backupFileName(entry.index))).getFile()
    if (file.size !== entry.sizeBytes) throw new Error(`Vault restore backup file ${entry.index} failed its size check.`)
    await writeManagedFile(opfsRoot, entry.namespace, entry.path, file)
  }
}

function normalizeManifestFiles(files: VaultFileManifestEntry[]): RestoreBackupEntry[] {
  return files.map((entry) => ({
    index: entry.index,
    namespace: entry.namespace,
    path: entry.path,
    sizeBytes: entry.sizeBytes,
  }))
}

function fileInventoriesMatch(
  expected: Array<Pick<RestoreBackupEntry, 'namespace' | 'path' | 'sizeBytes'>>,
  actual: ManagedFileSnapshot[],
): boolean {
  if (expected.length !== actual.length) return false
  const left = [...expected].sort((a, b) => a.path.localeCompare(b.path))
  const right = [...actual].sort((a, b) => a.path.localeCompare(b.path))
  return left.every((item, index) => {
    const candidate = right[index]
    return candidate?.namespace === item.namespace && candidate.path === item.path && candidate.sizeBytes === item.sizeBytes
  })
}

async function snapshotStagedFiles(staged: StagedVaultImport): Promise<Map<number, File>> {
  const directory = await getImportStageFilesDirectory(staged.stageId)
  const snapshots = new Map<number, File>()
  for (const entry of staged.manifest.files) snapshots.set(entry.index, await getStagedFile(directory, entry))
  return snapshots
}

async function promoteStagedFiles(staged: StagedVaultImport, snapshots: Map<number, File>): Promise<void> {
  const root = await getRootDirectory()
  await clearManagedLiveFiles()
  for (const entry of staged.manifest.files) {
    const file = snapshots.get(entry.index)
    if (!file) throw new Error(`Vault staged file ${entry.index} snapshot is missing.`)
    await writeManagedFile(root, entry.namespace, entry.path, file)
  }
  if (!fileInventoriesMatch(normalizeManifestFiles(staged.manifest.files), await collectManagedLiveFiles())) {
    throw new Error('Vault promoted OPFS files failed final inventory verification.')
  }
}

async function snapshotDatabase(): Promise<VaultTableSnapshot[]> {
  const tables = [...db.tables].sort((a, b) => a.name.localeCompare(b.name))
  return db.transaction('r', tables, async () => {
    const snapshots: VaultTableSnapshot[] = []
    for (const table of tables) snapshots.push({ name: table.name, rows: await table.toArray() })
    return snapshots
  })
}

function canonicalizeDatabaseTables(tables: VaultTableSnapshot[]): VaultTableSnapshot[] {
  return [...tables].sort((a, b) => a.name.localeCompare(b.name)).map((snapshot) => {
    const table = db.tables.find((candidate) => candidate.name === snapshot.name)
    const keyPath = table?.schema.primKey.keyPath
    if (typeof keyPath !== 'string' || !keyPath) {
      throw new Error(`Vault database fingerprint cannot resolve primary key for ${snapshot.name}.`)
    }
    const rows = [...snapshot.rows].sort((left, right) => {
      if (!isRecord(left) || !isRecord(right)) throw new Error(`Invalid row in ${snapshot.name}.`)
      const leftKey = left[keyPath]
      const rightKey = right[keyPath]
      if (typeof leftKey !== 'string' || typeof rightKey !== 'string') {
        throw new Error(`Invalid primary key in ${snapshot.name}.`)
      }
      return leftKey.localeCompare(rightKey)
    })
    return { name: snapshot.name, rows }
  })
}

async function databaseSha256(tables: VaultTableSnapshot[]): Promise<string> {
  const encoded = new TextEncoder().encode(stableJsonStringify(canonicalizeDatabaseTables(tables)))
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
  } finally {
    encoded.fill(0)
  }
}

async function currentDatabaseSha256(): Promise<string> {
  return databaseSha256(await snapshotDatabase())
}

async function replaceDatabase(tables: VaultTableSnapshot[]): Promise<void> {
  const liveTables = [...db.tables]
  await db.transaction('rw', liveTables, async () => {
    for (const table of liveTables) await table.clear()
    for (const snapshot of tables) {
      const table = db.tables.find((candidate) => candidate.name === snapshot.name)
      if (!table) throw new Error(`Vault restore target table ${snapshot.name} no longer exists.`)
      if (snapshot.rows.length > 0) await table.bulkPut(snapshot.rows as Array<Record<string, unknown>>)
    }
  })
}

async function deleteImportStageDirectory(stageId: string): Promise<void> {
  const root = await getRootDirectory()
  const appRoot = await getExistingDirectory(root, ROOT_DIRECTORY)
  if (!appRoot) return
  const staging = await getExistingDirectory(appRoot, IMPORT_STAGING_DIRECTORY)
  if (staging) await removeEntryIfExists(staging, stageId, true)
}

async function cleanupRestoreArtifacts(journal: RestoreJournal): Promise<boolean> {
  let complete = true
  try { await deleteImportStageDirectory(journal.stageId) } catch { complete = false }
  try { await deleteBackup(journal.restoreId) } catch { complete = false }
  if (complete) {
    try { await deleteRestoreJournal() } catch { complete = false }
  }
  return complete
}

async function rollbackJournal(journal: RestoreJournal): Promise<void> {
  await restoreBackupFiles(journal.restoreId)
  await cleanupRestoreArtifacts(journal)
}

export async function recoverInterruptedVaultRestore(): Promise<VaultRestoreRecoveryResult> {
  if (!hasOpfsSupport()) return 'none'
  const journal = await readRestoreJournal()
  if (!journal) return 'none'

  if (journal.phase === 'committed') {
    lockLocalEncryption()
    await cleanupRestoreArtifacts(journal)
    return 'finalized-committed'
  }

  if (journal.phase === 'files-promoted' && await currentDatabaseSha256() === journal.targetDatabaseSha256) {
    lockLocalEncryption()
    await cleanupRestoreArtifacts({ ...journal, phase: 'committed', updatedAt: new Date().toISOString() })
    return 'finalized-committed'
  }

  await rollbackJournal(journal)
  return 'rolled-back'
}

export async function commitStagedVaultImport(
  staged: StagedVaultImport,
  options: CommitStagedVaultImportOptions,
): Promise<VaultRestoreResult> {
  if (options.mode !== 'replace') throw new Error('Vault restore requires explicit replace mode.')
  assertStagedVaultImportReady(staged)
  const stagedFiles = await snapshotStagedFiles(staged)

  emitProgress(options.onProgress, {
    phase: 'recovering', filesCompleted: 0, filesTotal: staged.sourceFileCount,
    bytesCompleted: 0, bytesTotal: staged.sourceBytes,
  })
  await recoverInterruptedVaultRestore()

  const restoreId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const targetDatabaseSha256 = await databaseSha256(staged.manifest.database.tables)
  const liveFiles = await collectManagedLiveFiles()
  const liveBytes = liveFiles.reduce((total, file) => total + file.sizeBytes, 0)

  emitProgress(options.onProgress, {
    phase: 'backup', filesCompleted: 0, filesTotal: liveFiles.length,
    bytesCompleted: 0, bytesTotal: liveBytes,
  })
  await createBackup(restoreId, liveFiles)

  let journal: RestoreJournal = {
    version: RESTORE_JOURNAL_VERSION,
    restoreId,
    stageId: staged.stageId,
    archiveId: staged.archiveId,
    targetDatabaseSha256,
    phase: 'files-mutating',
    createdAt,
    updatedAt: createdAt,
  }
  await writeRestoreJournal(journal)

  let databaseCommitted = false
  try {
    emitProgress(options.onProgress, {
      phase: 'promoting-files', filesCompleted: 0, filesTotal: staged.sourceFileCount,
      bytesCompleted: 0, bytesTotal: staged.sourceBytes,
    })
    await promoteStagedFiles(staged, stagedFiles)
    journal = { ...journal, phase: 'files-promoted', updatedAt: new Date().toISOString() }
    await writeRestoreJournal(journal)

    emitProgress(options.onProgress, {
      phase: 'committing-database', filesCompleted: staged.sourceFileCount, filesTotal: staged.sourceFileCount,
      bytesCompleted: staged.sourceBytes, bytesTotal: staged.sourceBytes,
    })
    await replaceDatabase(staged.manifest.database.tables)
    databaseCommitted = true
    lockLocalEncryption()
    journal = { ...journal, phase: 'committed', updatedAt: new Date().toISOString() }
    await writeRestoreJournal(journal)
  } catch (error) {
    if (!databaseCommitted) {
      try {
        await restoreBackupFiles(restoreId)
        await cleanupRestoreArtifacts(journal)
      } catch {
        // Journal and backup remain for bootstrap recovery.
      }
    }
    throw error
  }

  emitProgress(options.onProgress, {
    phase: 'verifying', filesCompleted: staged.sourceFileCount, filesTotal: staged.sourceFileCount,
    bytesCompleted: staged.sourceBytes, bytesTotal: staged.sourceBytes,
  })

  const verificationErrors: string[] = []
  let databaseVerified = false
  let filesVerified = false
  let mediaIntegrity: MediaIntegrityReport | undefined

  try {
    databaseVerified = await currentDatabaseSha256() === targetDatabaseSha256
    if (!databaseVerified) verificationErrors.push('Restored database fingerprint does not match the Vault target.')
  } catch (error) {
    verificationErrors.push(`Database verification failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    filesVerified = fileInventoriesMatch(normalizeManifestFiles(staged.manifest.files), await collectManagedLiveFiles())
    if (!filesVerified) verificationErrors.push('Restored OPFS inventory does not match the Vault target.')
  } catch (error) {
    verificationErrors.push(`OPFS verification failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    mediaIntegrity = await scanMediaIntegrity()
  } catch (error) {
    verificationErrors.push(`Media integrity scan failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  emitProgress(options.onProgress, {
    phase: 'cleanup', filesCompleted: staged.sourceFileCount, filesTotal: staged.sourceFileCount,
    bytesCompleted: staged.sourceBytes, bytesTotal: staged.sourceBytes,
  })
  const cleanupComplete = await cleanupRestoreArtifacts(journal)

  emitProgress(options.onProgress, {
    phase: 'complete', filesCompleted: staged.sourceFileCount, filesTotal: staged.sourceFileCount,
    bytesCompleted: staged.sourceBytes, bytesTotal: staged.sourceBytes,
  })

  return {
    restoreId,
    archiveId: staged.archiveId,
    restoredFileCount: staged.sourceFileCount,
    restoredBytes: staged.sourceBytes,
    databaseVerified,
    filesVerified,
    ...(mediaIntegrity ? { mediaIntegrity } : {}),
    verificationErrors,
    cleanupComplete,
  }
}
