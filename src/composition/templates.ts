import { createDayTemplateApplication } from '../application/templates/day-template-application'
import { blockRepository, dayRepository, templateRepository, tripRepository } from '../data/repositories/repositories'
import { dayApplication } from './days'

export const dayTemplateApplication = createDayTemplateApplication({
  templates: templateRepository,
  blocks: blockRepository,
  days: dayRepository,
  trips: tripRepository,
  dayCreator: dayApplication,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
