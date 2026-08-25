import { createItineraryApplication } from '../application/itinerary/itinerary-application'
import { reservationBlockRepository } from '../data/repositories/reservation-block-repository'
import {
  blockRepository,
  dayRepository,
  itineraryRepository,
  placeRepository,
  reservationRepository,
  tripRepository,
} from '../data/repositories/repositories'

export const itineraryApplication = createItineraryApplication({
  trips: tripRepository,
  days: dayRepository,
  blocks: blockRepository,
  itineraries: itineraryRepository,
  places: placeRepository,
  reservations: reservationRepository,
  reservationSync: reservationBlockRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
