import { ensureInstallationMetadata, type InstallationMetadata } from './app-meta'

export type StoragePersistenceState = 'persistent' | 'best-effort' | 'unsupported' | 'unknown'

export interface ApplicationBootstrapState {
  installation: InstallationMetadata
  storagePersistence: StoragePersistenceState
}

async function inspectStoragePersistence(): Promise<StoragePersistenceState> {
  if (!('storage' in navigator) || typeof navigator.storage.persisted !== 'function') {
    return 'unsupported'
  }

  try {
    return (await navigator.storage.persisted()) ? 'persistent' : 'best-effort'
  } catch {
    return 'unknown'
  }
}

export async function bootstrapApplication(): Promise<ApplicationBootstrapState> {
  const installation = await ensureInstallationMetadata()
  const storagePersistence = await inspectStoragePersistence()

  return {
    installation,
    storagePersistence,
  }
}
