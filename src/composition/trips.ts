import { createTripApplication } from '../application/trips/trip-application'
import { tripRepository } from '../data/repositories/repositories'

export const tripApplication = createTripApplication({
  trips: tripRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
