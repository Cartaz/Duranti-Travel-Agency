import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTripStatus } from '../../src/application/trips/trip-lifecycle.ts'
import type { Trip } from '../../src/domain/entities.ts'

const baseTrip: Trip = {
  id: 'trip-1',
  title: 'Tokyo',
  status: 'planned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

test('trip lifecycle status changes update only lifecycle state and timestamp', () => {
  const ongoing = applyTripStatus(baseTrip, 'ongoing', '2026-08-26T15:10:00.000Z')
  assert.equal(ongoing.status, 'ongoing')
  assert.equal(ongoing.title, 'Tokyo')
  assert.equal(ongoing.updatedAt, '2026-08-26T15:10:00.000Z')

  const completed = applyTripStatus(ongoing, 'completed', '2026-08-26T15:11:00.000Z')
  assert.equal(completed.status, 'completed')
  assert.equal(completed.updatedAt, '2026-08-26T15:11:00.000Z')
})

test('trip lifecycle status change rejects archived trips', () => {
  const archived: Trip = { ...baseTrip, status: 'archived', archivedFromStatus: 'ongoing' }

  assert.throws(
    () => applyTripStatus(archived, 'completed', '2026-08-26T15:10:00.000Z'),
    /Ripristina il viaggio dall’archivio prima di cambiarne lo stato/,
  )
  assert.equal(archived.status, 'archived')
})

test('trip lifecycle status update is idempotent without touching updatedAt', () => {
  const ongoing: Trip = { ...baseTrip, status: 'ongoing' }
  const result = applyTripStatus(ongoing, 'ongoing', '2026-08-26T16:00:00.000Z')

  assert.strictEqual(result, ongoing)
  assert.equal(result.updatedAt, '2026-01-01T00:00:00.000Z')
})
