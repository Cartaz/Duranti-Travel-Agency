import type { Block, Itinerary, Place, Reservation } from '../../domain/entities'
import {
  blockRepository,
  itineraryRepository,
  placeRepository,
  reservationRepository,
} from '../../data/repositories/repositories'
import { assertPlannerDayContext } from '../planner/block-service'

export interface DayItineraryItem {
  itinerary: Itinerary
  place?: Place
}

function reservationIdFromBlock(block: Block): string | undefined {
  if (!['transport', 'accommodation', 'restaurant', 'activity'].includes(block.type)) return undefined
  const value = block.content.reservationId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il planner contiene un riferimento prenotazione non valido.')
  return value
}

function itineraryTypeForReservation(type: Reservation['type']): Itinerary['type'] {
  switch (type) {
    case 'transport': return 'transport'
    case 'restaurant': return 'meal'
    case 'activity': return 'activity'
    case 'accommodation': return 'reservation'
    default: return 'reservation'
  }
}

function itineraryStatusForReservation(status: Reservation['status']): Itinerary['status'] {
  switch (status) {
    case 'booked': return 'booked'
    case 'completed': return 'done'
    case 'cancelled': return 'cancelled'
    case 'planned':
    default:
      return 'planned'
  }
}

function legacyItineraryFromReservation(reservation: Reservation, block: Block): Itinerary {
  return {
    id: `legacy-reservation:${reservation.id}`,
    tripId: reservation.tripId,
    dayId: reservation.dayId,
    placeId: reservation.placeId,
    blockId: block.id,
    reservationId: reservation.id,
    type: itineraryTypeForReservation(reservation.type),
    startsAt: reservation.startsAt,
    endsAt: reservation.endsAt,
    timezone: reservation.timezone,
    title: reservation.title,
    notes: reservation.notes,
    status: itineraryStatusForReservation(reservation.status),
    bookingReference: reservation.confirmationCode,
    position: block.position,
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
  }
}

function itinerarySortValue(item: Itinerary): string {
  return item.startsAt ?? '9999-12-31T23:59'
}

export async function listDayItineraryItems(tripId: string, dayId: string): Promise<DayItineraryItem[]> {
  await assertPlannerDayContext(tripId, dayId, false)

  const [itineraries, places, reservations, blocks] = await Promise.all([
    itineraryRepository.list().then((items) => items.filter((item) => item.tripId === tripId && item.dayId === dayId)),
    placeRepository.list(),
    reservationRepository.list().then((items) => items.filter((item) => item.tripId === tripId && item.dayId === dayId)),
    blockRepository.list().then((items) => items.filter((item) => item.tripId === tripId && item.dayId === dayId)),
  ])

  const placeById = new Map(places.map((place) => [place.id, place]))
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const blockByReservationId = new Map<string, Block>()
  for (const block of blocks) {
    const reservationId = reservationIdFromBlock(block)
    if (!reservationId) continue
    if (blockByReservationId.has(reservationId)) {
      throw new Error('Più blocchi della giornata fanno riferimento alla stessa prenotazione.')
    }
    blockByReservationId.set(reservationId, block)
  }

  const coveredReservationIds = new Set(
    itineraries
      .map((item) => item.reservationId)
      .filter((reservationId): reservationId is string => Boolean(reservationId)),
  )
  const coveredBlockIds = new Set(
    itineraries
      .map((item) => item.blockId)
      .filter((blockId): blockId is string => Boolean(blockId)),
  )

  const legacyItems = reservations.flatMap((reservation) => {
    const block = blockByReservationId.get(reservation.id)
    if (!block) return []
    if (coveredReservationIds.has(reservation.id) || coveredBlockIds.has(block.id)) return []
    return [legacyItineraryFromReservation(reservation, block)]
  })

  return [...itineraries, ...legacyItems]
    .sort((left, right) => {
      const leftPosition = left.blockId ? blockById.get(left.blockId)?.position : left.position
      const rightPosition = right.blockId ? blockById.get(right.blockId)?.position : right.position
      return itinerarySortValue(left).localeCompare(itinerarySortValue(right))
        || (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER)
        || left.createdAt.localeCompare(right.createdAt)
        || left.id.localeCompare(right.id)
    })
    .map((itinerary) => ({
      itinerary,
      place: itinerary.placeId ? placeById.get(itinerary.placeId) : undefined,
    }))
}
