import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const repositorySource = await readFile(
  new URL('../../src/data/repositories/reservation-block-repository.ts', import.meta.url),
  'utf8',
)

test('reservation delete validates its parent context and cascades only to owned records', () => {
  const deleteStart = repositorySource.indexOf('async softDeleteReservationBlock')
  assert.notEqual(deleteStart, -1)
  const deleteSource = repositorySource.slice(deleteStart)
  const transactionEnd = deleteSource.indexOf('async () => {')
  assert.notEqual(transactionEnd, -1)
  const transactionDeclaration = deleteSource.slice(0, transactionEnd)

  for (const table of ['db.trips', 'db.days', 'db.blocks', 'db.reservations', 'db.itineraries', 'db.media']) {
    assert.match(transactionDeclaration, new RegExp(table.replace('.', '\\.')))
  }
  assert.match(deleteSource, /requireEditableTripDay\(tripId, dayId\)/)
  assert.match(deleteSource, /reservation\.attachmentMediaId/)
  assert.match(deleteSource, /db\.reservations\.put\(\{[\s\S]*deletedAt: now/)
  assert.match(deleteSource, /findOwnedItinerary\(tripId, dayId, blockId, reservationId\)/)
  assert.match(deleteSource, /db\.itineraries\.put\(\{[\s\S]*deletedAt: now/)
  assert.match(deleteSource, /db\.blocks\.put\(\{[\s\S]*deletedAt: now/)

  // Journal media may carry reservationId as historical context, but it is not owned by
  // the reservation block. Only attachmentMediaId is eligible for cascade deletion here.
  assert.doesNotMatch(deleteSource, /where\(['"]reservationId['"]\)/)
  assert.doesNotMatch(deleteSource, /filter\([^)]*reservationId/)
})
