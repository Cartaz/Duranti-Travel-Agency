import { createTripApplication } from '../application/trips/trip-application'
import { dayRepository, tripRepository } from '../data/repositories/repositories'

export const tripApplication = createTripApplication({
  trips: tripRepository,
  days: dayRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
