import type { Place } from '../../domain/entities'
import type { PlannerReservationType, ReservationDraft } from './reservation-application'

/**
 * Link an existing canonical Place to a reservation draft without copying place details
 * into Reservation. Restaurant blocks may use the place name as an initial title, but
 * only while the user has not already authored one.
 */
export function selectSavedPlaceForReservation(
  current: ReservationDraft,
  place: Place,
  type: PlannerReservationType,
): ReservationDraft {
  return {
    ...current,
    placeId: place.id,
    title: type === 'restaurant' && !current.title.trim() ? place.name : current.title,
  }
}
