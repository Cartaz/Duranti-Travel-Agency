import type { Block, Day, Itinerary, Place, Reservation } from '../../domain/entities'
import { requireTrip } from '../../application/shared/trip-day-context'
import {
  blockRepository,
  dayRepository,
  itineraryRepository,
  placeRepository,
  reservationRepository,
  tripRepository,
} from '../../data/repositories/repositories'
import type { DayItineraryItem, ItinerarySyncState } from './itinerary-service'

export interface TripItineraryDay {
  day: Day
  items: DayItineraryItem[]
}

export interface TripItineraryOverview {
  days: TripItineraryDay[]
  stopCount: number
  warningCount: number
}

const reservationBlockTypes = new Set<Block['type']>(['transport', 'accommodation', 'restaurant', 'activity'])

function reservationIdFromBlock(block: Block): string | undefined {
  if (!reservationBlockTypes.has(block.type)) return undefined
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

function sameOptional(left: string | undefined, right: string | undefined): boolean {
  return (left ?? undefined) === (right ?? undefined)
}

function itineraryMatchesReservation(itinerary: Itinerary, reservation: Reservation, block: Block): boolean {
  return itinerary.tripId === reservation.tripId
    && itinerary.dayId === reservation.dayId
    && itinerary.blockId === block.id
    && itinerary.reservationId === reservation.id
    && sameOptional(itinerary.placeId, reservation.placeId)
    && itinerary.type === itineraryTypeForReservation(reservation.type)
    && sameOptional(itinerary.startsAt, reservation.startsAt)
    && sameOptional(itinerary.endsAt, reservation.endsAt)
    && sameOptional(itinerary.timezone, reservation.timezone)
    && itinerary.title === reservation.title
    && sameOptional(itinerary.notes, reservation.notes)
    && itinerary.status === itineraryStatusForReservation(reservation.status)
    && sameOptional(itinerary.bookingReference, reservation.confirmationCode)
    && itinerary.position === block.position
}

function itinerarySortValue(item: Itinerary): string {
  return item.startsAt ?? '9999-12-31T23:59'
}

function buildDayItems(
  day: Day,
  itineraries: Itinerary[],
  places: Place[],
  reservations: Reservation[],
  blocks: Block[],
): DayItineraryItem[] {
  const dayItineraries = itineraries.filter((item) => item.dayId === day.id)
  const dayReservations = reservations.filter((item) => item.dayId === day.id)
  const dayBlocks = blocks.filter((item) => item.dayId === day.id)
  const placeById = new Map(places.map((place) => [place.id, place]))
  const reservationById = new Map(dayReservations.map((reservation) => [reservation.id, reservation]))
  const blockById = new Map(dayBlocks.map((block) => [block.id, block]))
  const blockByReservationId = new Map<string, Block>()

  for (const block of dayBlocks) {
    const reservationId = reservationIdFromBlock(block)
    if (!reservationId) continue
    if (blockByReservationId.has(reservationId)) {
      throw new Error(`Giorno ${day.sequence}: più blocchi fanno riferimento alla stessa prenotazione.`)
    }
    blockByReservationId.set(reservationId, block)
  }

  const coveredReservationIds = new Set<string>()
  const coveredBlockIds = new Set<string>()
  const persistedItems: DayItineraryItem[] = dayItineraries.map((itinerary) => {
    const linkedBlock = itinerary.blockId ? blockById.get(itinerary.blockId) : undefined
    const referencedReservationId = itinerary.reservationId ?? (linkedBlock ? reservationIdFromBlock(linkedBlock) : undefined)

    if (!referencedReservationId) {
      return {
        itinerary,
        place: itinerary.placeId ? placeById.get(itinerary.placeId) : undefined,
        source: 'manual',
        syncState: 'manual',
      }
    }

    coveredReservationIds.add(referencedReservationId)
    if (itinerary.blockId) coveredBlockIds.add(itinerary.blockId)
    const reservation = reservationById.get(referencedReservationId)
    const block = blockByReservationId.get(referencedReservationId)
    const syncState: ItinerarySyncState = reservation && block
      ? (itineraryMatchesReservation(itinerary, reservation, block) ? 'synced' : 'needs-sync')
      : 'orphaned'

    return {
      itinerary,
      place: itinerary.placeId ? placeById.get(itinerary.placeId) : undefined,
      source: 'reservation',
      syncState,
    }
  })

  const legacyItems: DayItineraryItem[] = dayReservations.flatMap((reservation) => {
    const block = blockByReservationId.get(reservation.id)
    if (!block) return []
    if (coveredReservationIds.has(reservation.id) || coveredBlockIds.has(block.id)) return []
    const itinerary = legacyItineraryFromReservation(reservation, block)
    return [{
      itinerary,
      place: itinerary.placeId ? placeById.get(itinerary.placeId) : undefined,
      source: 'reservation' as const,
      syncState: 'needs-sync' as const,
    }]
  })

  return [...persistedItems, ...legacyItems]
    .sort((left, right) => {
      const leftPosition = left.itinerary.blockId ? blockById.get(left.itinerary.blockId)?.position : left.itinerary.position
      const rightPosition = right.itinerary.blockId ? blockById.get(right.itinerary.blockId)?.position : right.itinerary.position
      return itinerarySortValue(left.itinerary).localeCompare(itinerarySortValue(right.itinerary))
        || (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER)
        || left.itinerary.createdAt.localeCompare(right.itinerary.createdAt)
        || left.itinerary.id.localeCompare(right.itinerary.id)
    })
}

function hasSourceReference(item: DayItineraryItem): boolean {
  return Boolean(item.itinerary.reservationId || item.itinerary.blockId)
}

function needsAttention(item: DayItineraryItem): boolean {
  if (item.syncState === 'needs-sync' || item.syncState === 'orphaned') return true
  return item.source === 'manual' && hasSourceReference(item)
}

async function listTripDaysForOverview(tripId: string): Promise<Day[]> {
  await requireTrip({ trips: tripRepository }, tripId)
  return (await dayRepository.list())
    .filter((day) => day.tripId === tripId)
    .sort((left, right) => left.sequence - right.sequence || left.date.localeCompare(right.date))
}

export async function listTripItineraryOverview(tripId: string): Promise<TripItineraryOverview> {
  const [days, itineraries, places, reservations, blocks] = await Promise.all([
    listTripDaysForOverview(tripId),
    itineraryRepository.list().then((items) => items.filter((item) => item.tripId === tripId)),
    placeRepository.list(),
    reservationRepository.list().then((items) => items.filter((item) => item.tripId === tripId)),
    blockRepository.list().then((items) => items.filter((item) => item.tripId === tripId)),
  ])

  const itineraryDays = days.map((day) => ({
    day,
    items: buildDayItems(day, itineraries, places, reservations, blocks),
  }))

  return {
    days: itineraryDays,
    stopCount: itineraryDays.reduce((total, section) => total + section.items.length, 0),
    warningCount: itineraryDays.reduce(
      (total, section) => total + section.items.filter(needsAttention).length,
      0,
    ),
  }
}
