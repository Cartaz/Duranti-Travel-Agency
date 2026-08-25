import { createReservationApplication } from '../application/reservations/reservation-application'
import { reservationBlockRepository } from '../data/repositories/reservation-block-repository'
import {
  blockRepository,
  dayRepository,
  mediaRepository,
  placeRepository,
  reservationRepository,
  tripRepository,
} from '../data/repositories/repositories'

export const reservationApplication = createReservationApplication({
  blocks: blockRepository,
  reservations: reservationRepository,
  places: placeRepository,
  media: mediaRepository,
  transactions: reservationBlockRepository,
  trips: tripRepository,
  days: dayRepository,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})
