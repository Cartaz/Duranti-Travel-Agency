import { createPlaceApplication } from '../application/places/place-application'
import { placeBlockRepository } from '../data/repositories/place-block-repository'
import { blockRepository, dayRepository, placeRepository, tripRepository } from '../data/repositories/repositories'

export const placeApplication = createPlaceApplication({
  trips: tripRepository,
  days: dayRepository,
  blocks: blockRepository,
  places: placeRepository,
  blockTransactions: placeBlockRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
