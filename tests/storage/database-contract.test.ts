import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../src/data/db/dtagency-db.ts', import.meta.url), 'utf8')

test('database keeps v1 and declares the index-only v2 schema', () => {
  assert.match(source, /export const DB_NAME = 'dtagency'/)
  assert.match(source, /export const DB_VERSION = 2/)
  assert.match(source, /this\.version\(1\)\.stores\(STORES_V1\)/)
  assert.match(source, /this\.version\(DB_VERSION\)\.stores\(STORES_V2\)/)
  assert.equal((source.match(/\.version\(/g) ?? []).length, 2)
})

test('v2 adds only query indexes and needs no row upgrader', () => {
  assert.match(source, /content\.placeId/)
  assert.match(source, /media: 'id, tripId, dayId, blockId, placeId, kind, sha256, updatedAt'/)
  assert.doesNotMatch(source, /\.upgrade\s*\(/)
})
