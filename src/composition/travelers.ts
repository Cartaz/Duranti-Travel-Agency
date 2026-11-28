import { createTravelerApplication } from '../application/travelers/traveler-application'
import { contentDeletionRepository } from '../data/repositories/content-deletion-repository'
import { travelerRepository, tripRepository, tripTravelerRepository } from '../data/repositories/repositories'
import { secureTravelerDocumentRepository } from '../data/repositories/traveler-document-repository'

function localTodayKey(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const travelerApplication = createTravelerApplication({
  travelers: travelerRepository,
  deletion: contentDeletionRepository,
  documents: secureTravelerDocumentRepository,
  trips: tripRepository,
  memberships: tripTravelerRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
  today: localTodayKey,
})
