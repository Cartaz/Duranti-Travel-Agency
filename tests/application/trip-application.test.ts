import test from 'node:test'
import assert from 'node:assert/strict'
import type { Day, Trip } from '../../src/domain/entities'
import { createTripApplication } from '../../src/application/trips/trip-application'

function fixture() {
  const trips = new Map<string, Trip>()
  const days: Day[] = []
  const app = createTripApplication({
    trips: {
      async list() { return [...trips.values()] },
      async get(id) { return trips.get(id) },
      async put(value) { trips.set(value.id, structuredClone(value)) },
    },
    days: {
      async list() { return structuredClone(days) },
    },
    now: () => '2026-08-25T08:00:00.000Z',
    newId: () => 'trip-1',
  })
  return { app, trips, days }
}

test('trip application creates normalized trips without data-layer knowledge', async () => {
  const { app, trips } = fixture()
  const created = await app.createTrip({
    title: '  Tokyo  ',
    status: 'planned',
    currency: 'eur',
    budgetMinor: 150000,
  })

  assert.equal(created.id, 'trip-1')
  assert.equal(created.title, 'Tokyo')
  assert.equal(created.currency, 'EUR')
  assert.deepEqual(trips.get('trip-1'), created)
})

test('trip application refuses a range that would orphan an existing day', async () => {
  const { app, trips, days } = fixture()
  trips.set('trip-1', {
    id: 'trip-1',
    title: 'Tokyo',
    status: 'planned',
    startDate: '2026-09-01',
    endDate: '2026-09-10',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  })
  days.push({
    id: 'day-1',
    tripId: 'trip-1',
    date: '2026-09-09',
    sequence: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  })

  await assert.rejects(
    () => app.updateTrip('trip-1', {
      title: 'Tokyo',
      status: 'planned',
      startDate: '2026-09-01',
      endDate: '2026-09-08',
    }),
    /resterebbe fuori dal nuovo intervallo/,
  )
})

test('archive and restore preserve the previous lifecycle status', async () => {
  const { app, trips } = fixture()
  trips.set('trip-1', {
    id: 'trip-1',
    title: 'Tokyo',
    status: 'ongoing',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  })

  const archived = await app.archiveTrip('trip-1')
  assert.equal(archived.status, 'archived')
  assert.equal(archived.archivedFromStatus, 'ongoing')

  const restored = await app.restoreArchivedTrip('trip-1')
  assert.equal(restored.status, 'ongoing')
  assert.equal(restored.archivedFromStatus, undefined)
})
