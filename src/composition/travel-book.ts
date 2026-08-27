import { createTravelBookApplication } from '../application/travel-book/travel-book-application'
import { mediaRepository } from '../data/repositories/repositories'
import { dayApplication } from './days'
import { tripApplication } from './trips'

export const travelBookApplication = createTravelBookApplication({
  trips: {
    getTrip: tripApplication.getTrip,
  },
  days: {
    listTripDays: dayApplication.listTripDays,
  },
  media: {
    listDayMedia: (tripId, dayId) => mediaRepository.listForDay(tripId, dayId),
    readMediaFile: (mediaId) => mediaRepository.getFile(mediaId),
  },
})
