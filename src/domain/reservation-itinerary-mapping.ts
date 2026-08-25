import type { Itinerary, Reservation } from './entities'

export function itineraryTypeForReservation(type: Reservation['type']): Itinerary['type'] {
  switch (type) {
    case 'transport': return 'transport'
    case 'restaurant': return 'meal'
    case 'activity': return 'activity'
    case 'accommodation': return 'reservation'
    default: return 'reservation'
  }
}

export function itineraryStatusForReservation(status: Reservation['status']): Itinerary['status'] {
  switch (status) {
    case 'booked': return 'booked'
    case 'completed': return 'done'
    case 'cancelled': return 'cancelled'
    case 'planned':
    default:
      return 'planned'
  }
}
