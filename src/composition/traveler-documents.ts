import { TravelerDocumentApplication } from '../application/travelers/traveler-document-application'
import { secureTravelerDocumentRepository } from '../data/repositories/traveler-document-repository'
import {
  configureLocalEncryption,
  isLocalEncryptionConfigured,
  isLocalEncryptionUnlocked,
  lockLocalEncryption,
  unlockLocalEncryption,
} from '../security/local-encryption'

export const travelerDocumentApplication = new TravelerDocumentApplication({
  documents: secureTravelerDocumentRepository,
  security: {
    isConfigured: isLocalEncryptionConfigured,
    isUnlocked: isLocalEncryptionUnlocked,
    configure: configureLocalEncryption,
    unlock: unlockLocalEncryption,
    lock: lockLocalEncryption,
  },
})
