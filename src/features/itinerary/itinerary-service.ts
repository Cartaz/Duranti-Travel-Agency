import type { Itinerary, Place } from '../../domain/entities'
import { itineraryRepository, placeRepository } from '../../data/repositories/repositories'
import { assertPlannerDayContext } from '../planner/block-service'

export interface DayItineraryItem {
  itinerary: Itinerary
  place?: Place
}

function itinerarySortValue(item: Itinerary): string {
  return item.startsAt ?? '9999-12-31T23:59'
}

export async function listDayItineraryItems(tripId: string, dayId: string): Promise<DayItineraryItem[]> {
  await assertPlannerDayContext(tripId, dayId, false)

  const [itineraries, places] = await Promise.all([
    itineraryRepository.list().then((items) => items.filter((item) => item.tripId === tripId && item.dayId === dayId)),
    placeRepository.list(),
  ])
  const placeById = new Map(places.map((place) => [place.id, place]))

  return itineraries
    .sort((left, right) => (
      itinerarySortValue(left).localeCompare(itinerarySortValue(right))
      || (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id)
    ))
    .map((itinerary) => ({
      itinerary,
      place: itinerary.placeId ? placeById.get(itinerary.placeId) : undefined,
    }))
}
