import { createItineraryApplication } from '../../src/application/itinerary/itinerary-application'
import type { Block, Day, Itinerary, Place, Reservation, Trip } from '../../src/domain/entities'

export interface ItineraryQueryContractResult {
  name: string
  ok: boolean
  error?: string
}

function resultError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runItineraryQueryContract(): Promise<ItineraryQueryContractResult> {
  const name = 'Itinerary uses semantic day/trip queries and referenced place lookups'
  try {
    const timestamp = '2026-08-25T12:00:00.000Z'
    const trip: Trip = {
      id: 'trip-1', title: 'Itinerary trip', status: 'planned', createdAt: timestamp, updatedAt: timestamp,
    }
    const day: Day = {
      id: 'day-1', tripId: trip.id, sequence: 1, date: '2026-09-01', createdAt: timestamp, updatedAt: timestamp,
    }
    const itinerary: Itinerary = {
      id: 'itinerary-1', tripId: trip.id, dayId: day.id, placeId: 'place-a', type: 'custom', status: 'planned',
      title: 'Passeggiata', position: 1, createdAt: timestamp, updatedAt: timestamp,
    }
    const reservation: Reservation = {
      id: 'reservation-1', tripId: trip.id, dayId: day.id, placeId: 'place-b', type: 'restaurant', status: 'booked',
      title: 'Cena', createdAt: timestamp, updatedAt: timestamp,
    }
    const block: Block = {
      id: 'block-1', tripId: trip.id, dayId: day.id, type: 'restaurant', position: 2,
      content: { reservationId: reservation.id }, createdAt: timestamp, updatedAt: timestamp,
    }
    const places = new Map<string, Place>([
      ['place-a', { id: 'place-a', name: 'Museo', createdAt: timestamp, updatedAt: timestamp }],
      ['place-b', { id: 'place-b', name: 'Trattoria', createdAt: timestamp, updatedAt: timestamp }],
    ])
    const dayQueries = { itineraries: [] as string[], reservations: [] as string[], blocks: [] as string[] }
    const tripQueries = { days: [] as string[], itineraries: [] as string[], reservations: [] as string[], blocks: [] as string[] }
    const placeQueries: string[][] = []

    const application = createItineraryApplication({
      trips: { get: async (id) => id === trip.id ? trip : undefined },
      days: {
        get: async (id) => id === day.id ? day : undefined,
        listByTrip: async (tripId) => { tripQueries.days.push(tripId); return tripId === trip.id ? [day] : [] },
      },
      itineraries: {
        listByDay: async (dayId) => { dayQueries.itineraries.push(dayId); return dayId === day.id ? [itinerary] : [] },
        listByTrip: async (tripId) => { tripQueries.itineraries.push(tripId); return tripId === trip.id ? [itinerary] : [] },
      } as never,
      reservations: {
        listByDay: async (dayId) => { dayQueries.reservations.push(dayId); return dayId === day.id ? [reservation] : [] },
        listByTrip: async (tripId) => { tripQueries.reservations.push(tripId); return tripId === trip.id ? [reservation] : [] },
      } as never,
      blocks: {
        listByDay: async (dayId) => { dayQueries.blocks.push(dayId); return dayId === day.id ? [block] : [] },
        listByTrip: async (tripId) => { tripQueries.blocks.push(tripId); return tripId === trip.id ? [block] : [] },
      } as never,
      places: {
        getMany: async (ids) => {
          placeQueries.push([...ids])
          return ids.map((id) => places.get(id)).filter((item): item is Place => Boolean(item))
        },
      } as never,
      reservationSync: undefined as never,
      now: () => timestamp,
      newId: () => 'unused',
    })

    const dayItems = await application.listDayItineraryItems(trip.id, day.id)
    const overview = await application.listTripItineraryOverview(trip.id)

    assert(dayItems.length === 2, `Expected 2 day itinerary items, got ${dayItems.length}.`)
    assert(overview.stopCount === 2, `Expected 2 overview stops, got ${overview.stopCount}.`)
    assert(JSON.stringify(dayQueries) === JSON.stringify({ itineraries: [day.id], reservations: [day.id], blocks: [day.id] }), 'Day itinerary did not use only day-scoped queries.')
    assert(JSON.stringify(tripQueries) === JSON.stringify({ days: [trip.id], itineraries: [trip.id], reservations: [trip.id], blocks: [trip.id] }), 'Trip overview did not use only trip-scoped queries.')
    assert(JSON.stringify(placeQueries) === JSON.stringify([['place-a', 'place-b'], ['place-a', 'place-b']]), 'Itinerary requested unrelated places or missed referenced places.')

    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, error: resultError(error) }
  }
}
