import { createPlannerApplication } from '../application/planner/planner-application'
import { blockRepository } from '../data/repositories/repositories'
import { dayApplication } from './days'
import { tripApplication } from './trips'

export const plannerApplication = createPlannerApplication({
  blocks: blockRepository,
  trips: { getTrip: tripApplication.getTrip },
  days: { getTripDay: dayApplication.getTripDay },
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
