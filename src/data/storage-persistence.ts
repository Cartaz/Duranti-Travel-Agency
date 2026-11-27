import type { StoragePersistenceState } from '../domain/archive'

function storageManager(): StorageManager | undefined {
  return typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : undefined
}

async function inspect(): Promise<StoragePersistenceState> {
  const storage = storageManager()
  if (!storage || typeof storage.persisted !== 'function') return 'unsupported'
  try {
    return (await storage.persisted()) ? 'persistent' : 'best-effort'
  } catch {
    return 'unknown'
  }
}

async function request(): Promise<StoragePersistenceState> {
  const storage = storageManager()
  if (!storage || typeof storage.persist !== 'function') return inspect()
  try {
    return (await storage.persist()) ? 'persistent' : 'best-effort'
  } catch {
    return 'unknown'
  }
}

export const browserStoragePersistence = { inspect, request }
