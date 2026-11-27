import {
  recoverInterruptedVaultRestore,
  sweepStaleVaultStaging,
  type VaultRestoreRecoveryResult,
} from '../vault/restore'
import { ensureInstallationMetadata, type InstallationMetadata } from './app-meta'

export interface ApplicationBootstrapState {
  installation: InstallationMetadata
  restoreRecovery: VaultRestoreRecoveryResult
}

export async function bootstrapApplication(): Promise<ApplicationBootstrapState> {
  // Recover or finalize any interrupted cross-store Vault restore before appMeta
  // is touched. Updating lastOpenedAt first would invalidate restore fingerprint checks.
  const restoreRecovery = await recoverInterruptedVaultRestore()
  const installation = await ensureInstallationMetadata()
  try {
    // Only temporary Vault copies are removed here; user data is never touched.
    await sweepStaleVaultStaging()
  } catch (error) {
    console.warn('DTAgency could not remove stale temporary backup files; they will be retried next launch.', error)
  }

  return {
    installation,
    restoreRecovery,
  }
}
