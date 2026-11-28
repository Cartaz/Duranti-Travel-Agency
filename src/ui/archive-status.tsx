import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { ArchiveStatus, StoragePersistenceState } from '../application/archive/archive-application'
import { useApplicationServices } from './application-context'

interface ArchiveStatusValue {
  status?: ArchiveStatus
  /** Re-reads persistence, backup date and whether trips exist. */
  refresh(): void
  requestPersistence(): Promise<StoragePersistenceState>
  recordBackupSaved(): Promise<void>
}

const ArchiveStatusContext = createContext<ArchiveStatusValue | null>(null)

/**
 * Single owner of the live archive-health state shown by the shell and the
 * backup page, so recording a backup or granting persistence updates every
 * consumer without remounts or reloads.
 */
export function ArchiveStatusProvider({ children }: PropsWithChildren) {
  const { archive } = useApplicationServices('archive')
  const [status, setStatus] = useState<ArchiveStatus>()

  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((current) => current + 1), [])

  useEffect(() => {
    let cancelled = false
    void archive
      .getStatus()
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
      .catch((error: unknown) => {
        console.error('DTAgency archive status is unavailable.', error)
        // Unknown durability must still be visible as a warning, not hidden.
        if (!cancelled) setStatus((current) => ({ backupDue: false, ...current, persistence: 'unknown' }))
      })
    return () => {
      cancelled = true
    }
  }, [archive, revision])

  const requestPersistence = useCallback(async () => {
    const persistence = await archive.requestPersistence()
    setStatus((current) => (current ? { ...current, persistence } : current))
    return persistence
  }, [archive])

  const recordBackupSaved = useCallback(async () => {
    const lastBackupAt = await archive.recordBackupSaved()
    setStatus((current) => (current ? { ...current, lastBackupAt, backupDue: false } : current))
  }, [archive])

  const value = useMemo(
    () => ({ status, refresh, requestPersistence, recordBackupSaved }),
    [status, refresh, requestPersistence, recordBackupSaved],
  )
  return <ArchiveStatusContext.Provider value={value}>{children}</ArchiveStatusContext.Provider>
}

export function useArchiveStatus(): ArchiveStatusValue {
  const value = useContext(ArchiveStatusContext)
  if (!value) throw new Error('DTAgency archive status is not available.')
  return value
}
