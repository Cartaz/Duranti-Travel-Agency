import test from 'node:test'
import assert from 'node:assert/strict'
import { createTripApplication } from '../../src/application/trips/trip-application.ts'
import type { Trip } from '../../src/domain/entities.ts'

function createHarness(initial: Trip) {
  let current = initial
  let nowValue = '2026-08-26T15:10:00.000Z'

  const application = createTripApplication({
    trips: {
      async listBookTrips() { return current.status === 'archived' ? [] : [current] },
      async listArchivedTrips() { return current.status === 'archived' ? [current] : [] },
      async get(id) { return id === current.id ? current : undefined },
      async put(value) { current = value },
    },
    days: { async listByTrip() { return [] } },
    now() { return nowValue },
    newId() { return 'unused' },
  })

  return {
    application,
    current: () => current,
    setNow(value: string) { nowValue = value },
  }
}

const baseTrip: Trip = {
  id: 'trip-1',
  title: 'Tokyo',
  status: 'planned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

test('trip lifecycle status changes update only lifecycle state and timestamp', async () => {
  const harness = createHarness(baseTrip)

  const ongoing = await harness.application.setTripStatus('trip-1', 'ongoing')
  assert.equal(ongoing.status, 'ongoing')
  assert.equal(ongoing.title, 'Tokyo')
  assert.equal(ongoing.updatedAt, '2026-08-26T15:10:00.000Z')

  harness.setNow('2026-08-26T15:11:00.000Z')
  const completed = await harness.application.setTripStatus('trip-1', 'completed')
  assert.equal(completed.status, 'completed')
  assert.equal(completed.updatedAt, '2026-08-26T15:11:00.000Z')
})

test('trip lifecycle status change rejects archived trips', async () => {
  const harness = createHarness({ ...baseTrip, status: 'archived', archivedFromStatus: 'ongoing' })

  await assert.rejects(
    harness.application.setTripStatus('trip-1', 'completed'),
    /Ripristina il viaggio dall’archivio prima di cambiarne lo stato/,
  )
  assert.equal(harness.current().status, 'archived')
})

test('trip lifecycle status update is idempotent without touching updatedAt', async () => {
  const harness = createHarness({ ...baseTrip, status: 'ongoing' })
  const before = harness.current()
  harness.setNow('2026-08-26T16:00:00.000Z')

  const result = await harness.application.setTripStatus('trip-1', 'ongoing')

  assert.strictEqual(result, before)
  assert.strictEqual(harness.current(), before)
  assert.equal(result.updatedAt, '2026-01-01T00:00:00.000Z')
})
