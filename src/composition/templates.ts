import { createDayTemplateApplication } from '../application/templates/day-template-application'
import { dayTemplateTransactionRepository } from '../data/repositories/day-template-transaction-repository'
import { blockRepository, dayRepository, templateRepository, tripRepository } from '../data/repositories/repositories'

export const dayTemplateApplication = createDayTemplateApplication({
  templates: templateRepository,
  blocks: blockRepository,
  days: dayRepository,
  trips: tripRepository,
  transactions: dayTemplateTransactionRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
