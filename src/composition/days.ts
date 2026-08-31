import { createDayApplication } from '../application/days/day-application'
import { dayRepository } from '../data/repositories/repositories'

export const dayApplication = createDayApplication({
  days: dayRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
