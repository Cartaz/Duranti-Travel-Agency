import assert from 'node:assert/strict'
import { readSource } from '../support/source.ts'
import test from 'node:test'

const source = await readSource(new URL('../../src/data/repositories/place-repository.ts', import.meta.url))

test('safe place deletion resolves every reverse reference through an index', () => {
  assert.match(source, /db\.blocks\s*\.where\('content\.placeId'\)\s*\.equals\(id\)/)
  assert.match(source, /db\.reservations\s*\.where\('placeId'\)\s*\.equals\(id\)/)
  assert.match(source, /db\.itineraries\s*\.where\('placeId'\)\s*\.equals\(id\)/)
  assert.match(source, /db\.media\s*\.where\('placeId'\)\s*\.equals\(id\)/)
  assert.doesNotMatch(source, /db\.(blocks|media)\s*\.toArray\(\)/)
})
