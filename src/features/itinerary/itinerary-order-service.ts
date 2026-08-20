import { itineraryRepository, type ItineraryMoveDirection } from '../../data/repositories/itinerary-repository'
import { assertPlannerDayContext } from '../planner/block-service'

export type ManualItineraryMoveDirection = ItineraryMoveDirection

export async function moveManualUntimedItineraryItem(
  tripId: string,
  dayId: string,
  itineraryId: string,
  direction: ManualItineraryMoveDirection,
): Promise<boolean> {
  await assertPlannerDayContext(tripId, dayId, true)
  return itineraryRepository.moveManualUntimed(tripId, dayId, itineraryId, direction)
}
