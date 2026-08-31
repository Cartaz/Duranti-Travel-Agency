import test from 'node:test'
import assert from 'node:assert/strict'
import { placeIdForBlock, reservationIdForBlock, withPlaceId, withReservationId } from '../../src/domain/block-content.ts'

test('block reference accessors normalize one persisted contract', () => {
  assert.equal(reservationIdForBlock({ content: { reservationId: 'reservation-1' } }), 'reservation-1')
  assert.equal(placeIdForBlock({ content: { placeId: 'place-1' } }), 'place-1')
  assert.equal(reservationIdForBlock({ content: {} }), undefined)
  assert.equal(placeIdForBlock(undefined), undefined)
})

test('invalid block references fail instead of being interpreted differently by callers', () => {
  assert.throws(() => reservationIdForBlock({ content: { reservationId: 42 } }), /non è valido/)
  assert.throws(() => placeIdForBlock({ content: { placeId: '   ' } }), /non è valido/)
})

test('block reference writers preserve unrelated content', () => {
  assert.deepEqual(withReservationId({ title: 'A' }, 'reservation-1'), { title: 'A', reservationId: 'reservation-1' })
  assert.deepEqual(withPlaceId({ title: 'A' }, 'place-1'), { title: 'A', placeId: 'place-1' })
})
