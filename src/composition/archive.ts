import { createArchiveApplication } from '../application/archive/archive-application'
import { appMetaBackupLedger } from '../data/backup-ledger'
import { tripRepository } from '../data/repositories/repositories'
import { reclaimMediaStorage, scanReclaimableMediaStorage } from '../data/storage/media-integrity'
import { browserStoragePersistence } from '../data/storage-persistence'
import { withVaultLock } from '../vault/lock'

export const archiveApplication = createArchiveApplication({
  // Reclamation shares the Vault lock so it never deletes bytes an export or
  // restore running in another tab is reading.
  maintenance: {
    scan: scanReclaimableMediaStorage,
    reclaim: (scan) => withVaultLock(() => reclaimMediaStorage(scan)),
  },
  persistence: browserStoragePersistence,
  ledger: appMetaBackupLedger,
  data: tripRepository,
  now: () => new Date().toISOString(),
})
