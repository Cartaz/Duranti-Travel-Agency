import assert from 'node:assert/strict'
import test from 'node:test'
import { createDayMediaApplication } from '../../src/application/media/day-media-application.ts'
import type { Block, Day, Place, Trip } from '../../src/domain/entities.ts'

const timestamp = '2026-08-25T12:00:00.000Z'

function place(id: string, name: string): Place {
  return { id, name, createdAt: timestamp, updatedAt: timestamp }
}

test('day media context scopes block and place reads to referenced day data', async () => {
  const trip: Trip = {
    id: 'trip-1', title: 'Media trip', status: 'planned', createdAt: timestamp, updatedAt: timestamp,
  }
  const day: Day = {
    id: 'day-1', tripId: trip.id, sequence: 1, date: '2026-09-01', createdAt: timestamp, updatedAt: timestamp,
  }
  const blocks: Block[] = [
    {
      id: 'place-block', tripId: trip.id, dayId: day.id, type: 'place', position: 1,
      content: { placeId: 'place-b' }, createdAt: timestamp, updatedAt: timestamp,
    },
    {
      id: 'foreign-place-block', tripId: 'trip-2', dayId: day.id, type: 'place', position: 2,
      content: { placeId: 'place-foreign' }, createdAt: timestamp, updatedAt: timestamp,
    },
    {
      id: 'text-block', tripId: trip.id, dayId: day.id, type: 'text', position: 3,
      content: { placeId: 'place-ignored' }, createdAt: timestamp, updatedAt: timestamp,
    },
  ]
  const places = new Map([
    ['place-a', place('place-a', 'Albergo')],
    ['place-b', place('place-b', 'Zoologico')],
  ])
  const queriedDays: string[] = []
  const queriedPlaceIds: string[][] = []

  const application = createDayMediaApplication({
    blocks: {
      listByDay: async (dayId) => { queriedDays.push(dayId); return blocks },
    },
    places: {
      getMany: async (ids) => {
        queriedPlaceIds.push([...ids])
        return ids.map((id) => places.get(id)).filter((item): item is Place => Boolean(item))
      },
      get: async (id) => places.get(id),
    },
    trips: { get: async (id) => id === trip.id ? trip : undefined },
    days: { get: async (id) => id === day.id ? day : undefined },
    itinerary: {
      listDayItems: async () => [{
        itinerary: { id: 'itinerary-1', title: 'Cena', placeId: 'place-a' },
        place: { name: 'Albergo' },
      }],
    },
    media: undefined as never,
  })

  const context = await application.listDayMediaContext(trip.id, day.id)

  assert.deepEqual(queriedDays, [day.id])
  assert.deepEqual(queriedPlaceIds, [['place-b', 'place-a']])
  assert.deepEqual(context.places, [
    { id: 'place-a', name: 'Albergo' },
    { id: 'place-b', name: 'Zoologico' },
  ])
  assert.deepEqual(context.itineraries, [{
    key: 'itinerary:itinerary-1',
    title: 'Cena',
    placeName: 'Albergo',
    itineraryId: 'itinerary-1',
    reservationId: undefined,
  }])
})
