import { createTravelBookApplication } from '../application/travel-book/travel-book-application'
import { dayApplication } from './days'
import { tripApplication } from './trips'

export const travelBookApplication = createTravelBookApplication({
  trips: {
    getTrip: tripApplication.getTrip,
  },
  days: {
    listTripDays: dayApplication.listTripDays,
  },
})
