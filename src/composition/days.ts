import { createDayApplication } from '../application/days/day-application'
import { contentDeletionRepository } from '../data/repositories/content-deletion-repository'
import { dayRepository, mediaRepository } from '../data/repositories/repositories'

export const dayApplication = createDayApplication({
  days: dayRepository,
  deletion: contentDeletionRepository,
  media: mediaRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
