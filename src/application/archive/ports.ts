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
  maintenance: StorageMaintenancePort
  persistence: StoragePersistencePort
  ledger: BackupLedgerPort
  data: ActiveDataPort
  now: () => string
}

export interface MediaStorageScan {
  reclaimableMediaIds: string[]
  orphanDirectoryIds: string[]
  /** Encrypted document directories without metadata (e.g. an interrupted purge). */
  orphanPrivateDocumentIds: string[]
  reclaimableBytes: number
  /** Active media whose bytes are missing, unreadable or inconsistent. */
  unhealthyActiveCount: number
}

export interface MediaStorageReclaimResult {
  purgedMediaCount: number
  removedOrphanCount: number
  keptReferencedCount: number
  freedBytes: number
}

export interface StorageMaintenancePort {
  scan(): Promise<MediaStorageScan>
  reclaim(scan: MediaStorageScan): Promise<MediaStorageReclaimResult>
}
