import { createDayTemplateApplication } from '../application/templates/day-template-application'
import { blockRepository, dayRepository, templateRepository, tripRepository } from '../data/repositories/repositories'

export const dayTemplateApplication = createDayTemplateApplication({
  templates: templateRepository,
  blocks: blockRepository,
  days: dayRepository,
  trips: tripRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
