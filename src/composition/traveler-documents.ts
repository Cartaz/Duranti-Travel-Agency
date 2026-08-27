import { TravelerDocumentApplication } from '../application/travelers/traveler-document-application'
import { scopedTravelerDocumentRepository } from '../data/repositories/scoped-traveler-document-repository'
import {
  configureLocalEncryption,
  isLocalEncryptionConfigured,
  isLocalEncryptionUnlocked,
  lockLocalEncryption,
  unlockLocalEncryption,
} from '../security/local-encryption'

export const travelerDocumentApplication = new TravelerDocumentApplication({
  documents: scopedTravelerDocumentRepository,
  security: {
    isConfigured: isLocalEncryptionConfigured,
    isUnlocked: isLocalEncryptionUnlocked,
    configure: configureLocalEncryption,
    unlock: unlockLocalEncryption,
    lock: lockLocalEncryption,
  },
})
