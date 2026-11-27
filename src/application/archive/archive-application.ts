import type {
  ArchiveApplicationDependencies,
  MediaStorageReclaimResult,
  MediaStorageScan,
  StoragePersistenceState,
} from './ports'

export type { MediaStorageReclaimResult, MediaStorageScan, StoragePersistenceState }

/** A backup older than this is treated as stale for an archive that holds trips. */
export const BACKUP_REMINDER_INTERVAL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export interface ArchiveStatus {
  persistence: StoragePersistenceState
  lastBackupAt?: string
  /** True when trips exist and no external backup is recent enough. */
  backupDue: boolean
}

export interface ArchiveApplication {
  getStatus(): Promise<ArchiveStatus>
  requestPersistence(): Promise<StoragePersistenceState>
  recordBackupSaved(): Promise<string>
  /** Read-only: how much space deleted or orphaned media still occupies. */
  scanStorage(): Promise<MediaStorageScan>
  /** Irreversibly frees the space found by a scan, re-checking every item. */
  reclaimStorage(scan: MediaStorageScan): Promise<MediaStorageReclaimResult>
}

export function isBackupDue(hasActiveTrips: boolean, lastBackupAt: string | undefined, now: string): boolean {
  if (!hasActiveTrips) return false
  if (!lastBackupAt) return true
  const last = Date.parse(lastBackupAt)
  if (!Number.isFinite(last)) return true
  return Date.parse(now) - last > BACKUP_REMINDER_INTERVAL_DAYS * DAY_MS
}

export function createArchiveApplication(deps: ArchiveApplicationDependencies): ArchiveApplication {
  return {
    async getStatus() {
      const [persistence, lastBackupAt, hasActiveTrips] = await Promise.all([
        deps.persistence.inspect(),
        deps.ledger.readLastSavedAt(),
        deps.data.hasActiveTrips(),
      ])
      return { persistence, lastBackupAt, backupDue: isBackupDue(hasActiveTrips, lastBackupAt, deps.now()) }
    },
    requestPersistence() {
      return deps.persistence.request()
    },
    async recordBackupSaved() {
      const at = deps.now()
      await deps.ledger.recordSaved(at)
      return at
    },
    scanStorage() {
      return deps.maintenance.scan()
    },
    async reclaimStorage(scan) {
      if (scan.reclaimableMediaIds.length === 0 && scan.orphanDirectoryIds.length === 0) {
        return { purgedMediaCount: 0, removedOrphanCount: 0, keptReferencedCount: 0, freedBytes: 0 }
      }
      return deps.maintenance.reclaim(scan)
    },
  }
}
