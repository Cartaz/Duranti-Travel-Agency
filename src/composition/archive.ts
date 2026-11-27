import { createArchiveApplication } from '../application/archive/archive-application'
import { appMetaBackupLedger } from '../data/backup-ledger'
import { tripRepository } from '../data/repositories/repositories'
import { reclaimMediaStorage, scanReclaimableMediaStorage } from '../data/storage/media-integrity'
import { browserStoragePersistence } from '../data/storage-persistence'

export const archiveApplication = createArchiveApplication({
  // Each deletion inside reclamation takes the cross-tab Vault lock itself.
  maintenance: {
    scan: () => scanReclaimableMediaStorage(),
    reclaim: (scan) => reclaimMediaStorage(scan),
  },
  persistence: browserStoragePersistence,
  ledger: appMetaBackupLedger,
  data: tripRepository,
  now: () => new Date().toISOString(),
})
