import { createDayMediaApplication } from '../application/media/day-media-application'
import {
  blockRepository,
  dayRepository,
  mediaRepository,
  placeRepository,
  tripRepository,
} from '../data/repositories/repositories'
import { listDayItineraryItems } from '../features/itinerary/itinerary-service'

export const dayMediaApplication = createDayMediaApplication({
  media: mediaRepository,
  blocks: blockRepository,
  places: placeRepository,
  trips: tripRepository,
  days: dayRepository,
  itinerary: {
    listDayItems: listDayItineraryItems,
  },
})
