const DB_NAME = 'DurantiStorageLab'
const STORE_NAME = 'test-records'
const DB_VERSION = 1

type OpfsStorageManager = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>
}

export type LabRecord = {
  id: string
  createdAt: string
  label: string
  payload: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
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
}

function storageManager(): OpfsStorageManager | undefined {
  return navigator.storage as OpfsStorageManager | undefined
}

export async function getStorageStatus() {
  const storage = storageManager()
  const estimate = storage?.estimate ? await storage.estimate() : undefined
  let persisted: boolean | null = null
  if (storage?.persisted) persisted = await storage.persisted()
  return {
    indexedDb: 'indexedDB' in window,
    opfs: !!storage?.getDirectory,
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

export async function writeOpfsProbe(sizeBytes: number): Promise<void> {
  const getDirectory = storageManager()?.getDirectory
  if (!getDirectory) throw new Error('OPFS is not available')
  const root = await getDirectory()
  const fileHandle = await root.getFileHandle('storage-lab.bin', { create: true })
  const writable = await fileHandle.createWritable()
  const chunk = new Uint8Array(Math.min(sizeBytes, 1024 * 1024))
  let remaining = sizeBytes
  while (remaining > 0) {
    const length = Math.min(remaining, chunk.byteLength)
    await writable.write(chunk.subarray(0, length))
    remaining -= length
  }
  await writable.close()
}

export async function removeOpfsProbe(): Promise<void> {
  const getDirectory = storageManager()?.getDirectory
  if (!getDirectory) return
  const root = await getDirectory()
  try {
    await root.removeEntry('storage-lab.bin')
  } catch {
    // Nothing to remove.
  }
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function exportVault(password: string): Promise<Blob> {
  const records = await getRecords()
  const payload = new TextEncoder().encode(JSON.stringify({ format: 'duranti-vault-test', version: 1, exportedAt: new Date().toISOString(), records }))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload)
  const envelope = {
    magic: 'DURANTI-VAULT-TEST',
    version: 1,
    algorithm: 'PBKDF2-SHA256-250000 + AES-256-GCM',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
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
