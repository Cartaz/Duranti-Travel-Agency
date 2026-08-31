import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const guardedPaths = [
  '../../src/application/media/day-media-application.ts',
  '../../src/application/places/place-application.ts',
  '../../src/application/reservations/reservation-application.ts',
  '../../src/application/itinerary/itinerary-application.ts',
  '../../src/data/repositories/place-block-repository.ts',
  '../../src/data/repositories/reservation-block-repository.ts',
]

test('block reference representation has one owner', async () => {
  for (const path of guardedPaths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\.content\.reservationId\b/, `${path} reads reservationId representation directly`)
    assert.doesNotMatch(source, /\.content\.placeId\b/, `${path} reads placeId representation directly`)
  }
})
