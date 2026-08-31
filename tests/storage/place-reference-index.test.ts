import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../src/data/repositories/place-repository.ts', import.meta.url), 'utf8')

test('safe place deletion resolves every reverse reference through an index', () => {
  assert.match(source, /db\.blocks\.where\('content\.placeId'\)\.equals\(id\)/)
  assert.match(source, /db\.reservations\.where\('placeId'\)\.equals\(id\)/)
  assert.match(source, /db\.itineraries\.where\('placeId'\)\.equals\(id\)/)
  assert.match(source, /db\.media\.where\('placeId'\)\.equals\(id\)/)
  assert.doesNotMatch(source, /db\.(blocks|media)\.toArray\(\)/)
})
