import type { StoragePersistenceState } from '../../domain/archive'

export type { StoragePersistenceState }

/** Browser durability of origin storage (StorageManager.persisted/persist). */
export interface StoragePersistencePort {
  inspect(): Promise<StoragePersistenceState>
  request(): Promise<StoragePersistenceState>
}

/** Records when the user last moved an encrypted Vault outside origin storage. */
export interface BackupLedgerPort {
  readLastSavedAt(): Promise<string | undefined>
  recordSaved(at: string): Promise<void>
}

export interface ActiveDataPort {
  hasActiveTrips(): Promise<boolean>
}

export interface ArchiveApplicationDependencies {
  persistence: StoragePersistencePort
  ledger: BackupLedgerPort
  data: ActiveDataPort
  now: () => string
}
