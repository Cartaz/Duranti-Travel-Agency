import { createDayApplication } from '../application/days/day-application'
import { dayRepository } from '../data/repositories/repositories'
import { tripApplication } from './trips'

export const dayApplication = createDayApplication({
  days: dayRepository,
  trips: {
    getTrip: tripApplication.getTrip,
  },
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
