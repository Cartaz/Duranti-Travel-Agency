import { assertTripDayContext } from '../../application/shared/trip-day-context'
import { itineraryRepository, type ItineraryMoveDirection } from '../../data/repositories/itinerary-repository'
import { dayRepository, tripRepository } from '../../data/repositories/repositories'

export type ManualItineraryMoveDirection = ItineraryMoveDirection

export async function moveManualUntimedItineraryItem(
  tripId: string,
  dayId: string,
  itineraryId: string,
  direction: ManualItineraryMoveDirection,
): Promise<boolean> {
  await assertTripDayContext(
    { trips: tripRepository, days: dayRepository },
    tripId,
    dayId,
    true,
    'Ripristina il viaggio prima di modificare l’itinerario.',
  )
  return itineraryRepository.moveManualUntimed(tripId, dayId, itineraryId, direction)
}
