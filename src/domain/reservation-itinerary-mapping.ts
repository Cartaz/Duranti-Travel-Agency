import type { Block, Itinerary, Reservation } from './entities'

export function reservationTypeForBlockType(type: Block['type']): Reservation['type'] | undefined {
  switch (type) {
    case 'transport': return 'transport'
    case 'accommodation': return 'accommodation'
    case 'restaurant': return 'restaurant'
    case 'activity': return 'activity'
    default: return undefined
  }
}

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
