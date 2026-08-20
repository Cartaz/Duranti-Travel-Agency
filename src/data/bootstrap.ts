import { recoverInterruptedVaultRestore, type VaultRestoreRecoveryResult } from '../vault/restore'
import { ensureInstallationMetadata, type InstallationMetadata } from './app-meta'

export type StoragePersistenceState = 'persistent' | 'best-effort' | 'unsupported' | 'unknown'

export interface ApplicationBootstrapState {
  installation: InstallationMetadata
  storagePersistence: StoragePersistenceState
  restoreRecovery: VaultRestoreRecoveryResult
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
  // Recover or finalize any interrupted cross-store Vault restore before appMeta
  // is touched. Updating lastOpenedAt first would invalidate restore fingerprint checks.
  const restoreRecovery = await recoverInterruptedVaultRestore()
  const installation = await ensureInstallationMetadata()
  const storagePersistence = await inspectStoragePersistence()

  return {
    installation,
    storagePersistence,
    restoreRecovery,
  }
}
