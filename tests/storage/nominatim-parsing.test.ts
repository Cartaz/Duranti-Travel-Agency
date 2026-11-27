import assert from 'node:assert/strict'
import test from 'node:test'
import { parseNominatimResults } from '../../src/data/external/nominatim-place-discovery.ts'

test('Nominatim responses are validated as external input', () => {
  assert.throws(() => parseNominatimResults({ error: 'rate limited' }), /risposta non valida/)
  const parsed = parseNominatimResults([
    { place_id: 1, display_name: 'Louvre, Paris', lat: '48.86', lon: '2.33', address: { city: 'Paris', bogus: 4 } },
    { place_id: 2, lat: '48.86', lon: '2.33' },
    { place_id: 3, display_name: 'Nowhere', lat: 'north', lon: '2.33' },
    { place_id: '4', display_name: 'Bad id', lat: '1', lon: '1' },
    null,
  ])
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].display_name, 'Louvre, Paris')
  assert.deepEqual(parsed[0].address, { city: 'Paris' })
})
