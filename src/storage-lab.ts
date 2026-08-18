const DB_NAME = 'DurantiStorageLab'
const STORE_NAME = 'test-records'
const DB_VERSION = 1
const PROBE_PREFIX = 'storage-lab-'
const CHUNK_SIZE = 1024 * 1024
const PROBE_CHUNK_BYTES = 100 * 1024 * 1024

type OpfsStorageManager = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>
}

export type LabRecord = {
  id: string
  createdAt: string
  label: string
  payload: string
}

export type OpfsDiagnostics = {
  files: number
  bytes: number
  expectedBytes: number
  filesDetail: Array<{ name: string; bytes: number }>
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

export async function addRecord(record: LabRecord): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
  })
  db.close()
}

export async function getRecords(): Promise<LabRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      db.close()
      resolve((request.result as LabRecord[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    }
    request.onerror = () => {
      db.close()
      reject(request.error ?? new Error('IndexedDB read failed'))
    }
  })
}

export async function clearLab(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed'))
  })
  db.close()
  await clearOpfsLab()
}

function storageManager(): OpfsStorageManager | undefined {
  return navigator.storage as OpfsStorageManager | undefined
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  const storage = storageManager()
  if (!storage || typeof storage.getDirectory !== 'function') throw new Error('OPFS is not available')
  return storage.getDirectory()
}

export async function getStorageStatus() {
  const storage = storageManager()
  const estimate = storage?.estimate ? await storage.estimate() : undefined
  let persisted: boolean | null = null
  if (storage?.persisted) persisted = await storage.persisted()
  return {
    indexedDb: 'indexedDB' in window,
    opfs: typeof storage?.getDirectory === 'function',
    persistApi: !!storage?.persist,
    persisted,
    usage: estimate?.usage ?? 0,
    quota: estimate?.quota ?? 0,
    online: navigator.onLine,
  }
}

export async function requestPersistentStorage() {
  const storage = storageManager()
  if (!storage?.persist) return false
  return storage.persist()
}

async function getDirectoryEntries(root: FileSystemDirectoryHandle): Promise<Array<[string, FileSystemHandle]>> {
  const directory = root as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }
  if (typeof directory.entries !== 'function') throw new Error('OPFS directory iteration is not available in this browser build')
  const entries: Array<[string, FileSystemHandle]> = []
  for await (const entry of directory.entries()) entries.push(entry)
  return entries
}

export async function getOpfsDiagnostics(): Promise<OpfsDiagnostics> {
  const root = await getOpfsRoot()
  const filesDetail: Array<{ name: string; bytes: number }> = []
  for (const [name, handle] of await getDirectoryEntries(root)) {
    if (handle.kind !== 'file' || !name.startsWith(PROBE_PREFIX)) continue
    const file = await (handle as FileSystemFileHandle).getFile()
    filesDetail.push({ name, bytes: file.size })
  }
  filesDetail.sort((a, b) => a.name.localeCompare(b.name))
  const bytes = filesDetail.reduce((total, file) => total + file.bytes, 0)
  return { files: filesDetail.length, bytes, expectedBytes: filesDetail.length * PROBE_CHUNK_BYTES, filesDetail }
}

export async function appendOpfsProbe(): Promise<OpfsDiagnostics> {
  const root = await getOpfsRoot()
  const diagnostics = await getOpfsDiagnostics()
  const index = diagnostics.files + 1
  const filename = `${PROBE_PREFIX}${String(index).padStart(4, '0')}.bin`
  const fileHandle = await root.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  const chunk = new Uint8Array(CHUNK_SIZE)
  let remaining = PROBE_CHUNK_BYTES
  try {
    while (remaining > 0) {
      const length = Math.min(remaining, chunk.byteLength)
      await writable.write(chunk.subarray(0, length))
      remaining -= length
    }
    await writable.close()
  } catch (error) {
    try { await writable.abort() } catch { /* best effort */ }
    throw error
  }
  return getOpfsDiagnostics()
}

async function clearOpfsLab(): Promise<void> {
  const root = await getOpfsRoot()
  const names: string[] = []
  for (const [name, handle] of await getDirectoryEntries(root)) {
    if (handle.kind === 'file' && name.startsWith(PROBE_PREFIX)) names.push(name)
  }
  for (const name of names) await root.removeEntry(name)
}

export async function removeOpfsProbe(): Promise<void> {
  await clearOpfsLab()
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function exportVault(password: string): Promise<Blob> {
  const records = await getRecords()
  const payload = new TextEncoder().encode(JSON.stringify({ format: 'duranti-vault-test', version: 1, exportedAt: new Date().toISOString(), records }))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload)
  const envelope = { magic: 'DURANTI-VAULT-TEST', version: 1, algorithm: 'PBKDF2-SHA256-250000 + AES-256-GCM', salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) }
  return new Blob([JSON.stringify(envelope)], { type: 'application/vnd.duranti.vault+json' })
}

export async function importVault(file: File, password: string): Promise<number> {
  const envelope = JSON.parse(await file.text())
  if (envelope.magic !== 'DURANTI-VAULT-TEST') throw new Error('File is not a Duranti test vault')
  const salt = base64ToBytes(envelope.salt)
  const iv = base64ToBytes(envelope.iv)
  const ciphertext = base64ToBytes(envelope.ciphertext)
  const key = await deriveKey(password, salt)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  const data = JSON.parse(new TextDecoder().decode(plaintext))
  if (data.format !== 'duranti-vault-test') throw new Error('Invalid vault payload')
  for (const record of data.records as LabRecord[]) await addRecord(record)
  return data.records.length
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
