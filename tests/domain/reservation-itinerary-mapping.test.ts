import test from 'node:test'
import assert from 'node:assert/strict'
import { itineraryStatusForReservation, itineraryTypeForReservation, reservationTypeForBlockType } from '../../src/domain/reservation-itinerary-mapping.ts'

test('planner block types map to the canonical reservation types', () => {
  assert.equal(reservationTypeForBlockType('transport'), 'transport')
  assert.equal(reservationTypeForBlockType('accommodation'), 'accommodation')
  assert.equal(reservationTypeForBlockType('restaurant'), 'restaurant')
  assert.equal(reservationTypeForBlockType('activity'), 'activity')
  assert.equal(reservationTypeForBlockType('text'), undefined)
})

test('reservation types map to the canonical itinerary types', () => {
  assert.equal(itineraryTypeForReservation('transport'), 'transport')
  assert.equal(itineraryTypeForReservation('accommodation'), 'reservation')
  assert.equal(itineraryTypeForReservation('restaurant'), 'meal')
  assert.equal(itineraryTypeForReservation('activity'), 'activity')
})

test('reservation statuses map to the canonical itinerary statuses', () => {
  assert.equal(itineraryStatusForReservation('planned'), 'planned')
  assert.equal(itineraryStatusForReservation('booked'), 'booked')
  assert.equal(itineraryStatusForReservation('completed'), 'done')
  assert.equal(itineraryStatusForReservation('cancelled'), 'cancelled')
})
