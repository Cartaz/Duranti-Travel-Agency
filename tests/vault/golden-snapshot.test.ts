import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const fixture = JSON.parse(
  await readFile(new URL('../fixtures/vault-v1/database-snapshot.json', import.meta.url), 'utf8'),
) as {
  name: string
  schemaVersion: number
  tables: Array<{ name: string; rows: unknown[] }>
}

const expectedTables = [
  'appMeta',
  'auditLog',
  'blocks',
  'days',
  'expenses',
  'itineraries',
  'links',
  'media',
  'places',
  'reservations',
  'templates',
  'travelerDocuments',
  'travelers',
  'trips',
  'tripTravelers',
]

test('golden snapshot represents DTAgency database v1', () => {
  assert.equal(fixture.name, 'dtagency')
  assert.equal(fixture.schemaVersion, 1)
})

test('golden snapshot freezes the v1 table inventory', () => {
  assert.deepEqual(fixture.tables.map((table) => table.name), expectedTables)
  assert.equal(new Set(fixture.tables.map((table) => table.name)).size, expectedTables.length)
})

test('golden baseline contains no user data', () => {
  assert.ok(fixture.tables.every((table) => Array.isArray(table.rows) && table.rows.length === 0))
})
