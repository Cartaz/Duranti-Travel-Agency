import assert from 'node:assert/strict'
import test from 'node:test'
import { createTravelerApplication } from '../../src/application/travelers/traveler-application.ts'
import type { Traveler, Trip, TripTraveler } from '../../src/domain/entities.ts'

const timestamp = '2026-08-25T12:00:00.000Z'

function traveler(id: string, displayName: string): Traveler {
  const [firstName, lastName] = displayName.split(' ')
  return { id, firstName, lastName, displayName, createdAt: timestamp, updatedAt: timestamp }
}

test('trip participants resolve traveler profiles with one batch lookup', async () => {
  const trip: Trip = {
    id: 'trip-1', title: 'Group trip', status: 'planned', createdAt: timestamp, updatedAt: timestamp,
  }
  const memberships: TripTraveler[] = [
    {
      id: 'membership-b', tripId: trip.id, travelerId: 'traveler-b', role: 'companion',
      createdAt: timestamp, updatedAt: timestamp,
    },
    {
      id: 'membership-a', tripId: trip.id, travelerId: 'traveler-a', role: 'owner',
      createdAt: timestamp, updatedAt: timestamp,
    },
  ]
  const profiles = [traveler('traveler-b', 'Zeno Bianchi'), traveler('traveler-a', 'Anna Rossi')]
  const requestedIds: string[][] = []

  const application = createTravelerApplication({
    travelers: {
      getMany: async (ids) => { requestedIds.push([...ids]); return profiles },
    } as never,
    trips: { get: async (id) => id === trip.id ? trip : undefined },
    memberships: { listActiveForTrip: async () => memberships } as never,
    now: () => timestamp,
    newId: () => 'unused',
    today: () => '2026-08-25',
  })

  const participants = await application.listTripParticipants(trip.id)

  assert.deepEqual(requestedIds, [['traveler-b', 'traveler-a']])
  assert.deepEqual(participants.map((participant) => participant.traveler.id), ['traveler-a', 'traveler-b'])
})

test('trip participants still reject a missing traveler profile after batch lookup', async () => {
  const trip: Trip = {
    id: 'trip-1', title: 'Broken group trip', status: 'planned', createdAt: timestamp, updatedAt: timestamp,
  }
  const membership: TripTraveler = {
    id: 'membership-missing', tripId: trip.id, travelerId: 'traveler-missing', role: 'companion',
    createdAt: timestamp, updatedAt: timestamp,
  }

  const application = createTravelerApplication({
    travelers: { getMany: async () => [] } as never,
    trips: { get: async (id) => id === trip.id ? trip : undefined },
    memberships: { listActiveForTrip: async () => [membership] } as never,
    now: () => timestamp,
    newId: () => 'unused',
    today: () => '2026-08-25',
  })

  await assert.rejects(
    () => application.listTripParticipants(trip.id),
    /profilo mancante o eliminato/,
  )
})
