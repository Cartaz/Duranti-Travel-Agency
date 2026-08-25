import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertDayDateWithinTripRange,
  isDayDateWithinTripRange,
} from '../../src/domain/trip-calendar.ts'

test('accepts dates inside a closed trip range', () => {
  const range = { startDate: '2026-08-10', endDate: '2026-08-20' }

  assert.equal(isDayDateWithinTripRange(range, '2026-08-10'), true)
  assert.equal(isDayDateWithinTripRange(range, '2026-08-15'), true)
  assert.equal(isDayDateWithinTripRange(range, '2026-08-20'), true)
})

test('rejects dates outside a closed trip range', () => {
  const range = { startDate: '2026-08-10', endDate: '2026-08-20' }

  assert.equal(isDayDateWithinTripRange(range, '2026-08-09'), false)
  assert.equal(isDayDateWithinTripRange(range, '2026-08-21'), false)
})

test('supports open-ended trip ranges', () => {
  assert.equal(isDayDateWithinTripRange({ startDate: '2026-08-10' }, '2027-01-01'), true)
  assert.equal(isDayDateWithinTripRange({ endDate: '2026-08-20' }, '2020-01-01'), true)
  assert.equal(isDayDateWithinTripRange({}, '1990-01-01'), true)
})

test('assertion reports the violated trip boundary', () => {
  const range = { startDate: '2026-08-10', endDate: '2026-08-20' }

  assert.throws(
    () => assertDayDateWithinTripRange(range, '2026-08-09'),
    /2026-08-10/,
  )
  assert.throws(
    () => assertDayDateWithinTripRange(range, '2026-08-21'),
    /2026-08-20/,
  )
  assert.doesNotThrow(() => assertDayDateWithinTripRange(range, '2026-08-15'))
})
