import { createArchiveApplication } from '../application/archive/archive-application'
import { appMetaBackupLedger } from '../data/backup-ledger'
import { tripRepository } from '../data/repositories/repositories'
import { browserStoragePersistence } from '../data/storage-persistence'

export const archiveApplication = createArchiveApplication({
  persistence: browserStoragePersistence,
  ledger: appMetaBackupLedger,
  data: tripRepository,
  now: () => new Date().toISOString(),
})
