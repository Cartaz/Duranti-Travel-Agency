import test from 'node:test'
import assert from 'node:assert/strict'
import { itineraryStatusForReservation, itineraryTypeForReservation } from '../../src/domain/reservation-itinerary-mapping.ts'

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
