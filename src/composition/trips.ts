import { createTripApplication } from '../application/trips/trip-application'
import { contentDeletionRepository } from '../data/repositories/content-deletion-repository'
import { mediaRepository, tripRepository } from '../data/repositories/repositories'

export const tripApplication = createTripApplication({
  trips: tripRepository,
  deletion: contentDeletionRepository,
  media: mediaRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
