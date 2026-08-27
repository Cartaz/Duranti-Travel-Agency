import { TravelerDocumentApplication } from '../application/travelers/traveler-document-application'
import { scopedTravelerDocumentRepository } from '../data/repositories/scoped-traveler-document-repository'
import { travelerRepository } from '../data/repositories/repositories'
import {
  configureLocalEncryption,
  isLocalEncryptionConfigured,
  isLocalEncryptionUnlocked,
  lockLocalEncryption,
  unlockLocalEncryption,
} from '../security/local-encryption'

export const travelerDocumentApplication = new TravelerDocumentApplication({
  documents: scopedTravelerDocumentRepository,
  travelers: travelerRepository,
  security: {
    isConfigured: isLocalEncryptionConfigured,
    isUnlocked: isLocalEncryptionUnlocked,
    configure: configureLocalEncryption,
    unlock: unlockLocalEncryption,
    lock: lockLocalEncryption,
  },
})
