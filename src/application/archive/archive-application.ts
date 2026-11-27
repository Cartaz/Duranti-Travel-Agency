import type { ArchiveApplicationDependencies, StoragePersistenceState } from './ports'

export type { StoragePersistenceState }

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
  }
}
