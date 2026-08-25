import { createDayMediaApplication } from '../application/media/day-media-application'
import {
  blockRepository,
  dayRepository,
  mediaRepository,
  placeRepository,
  tripRepository,
} from '../data/repositories/repositories'
import { itineraryApplication } from './itinerary'

export const dayMediaApplication = createDayMediaApplication({
  media: mediaRepository,
  blocks: blockRepository,
  places: placeRepository,
  trips: tripRepository,
  days: dayRepository,
  itinerary: {
    listDayItems: itineraryApplication.listDayItineraryItems,
  },
})
