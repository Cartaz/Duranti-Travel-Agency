import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const repositorySource = await readFile(
  new URL('../../src/data/repositories/trip-traveler-repository.ts', import.meta.url),
  'utf8',
)

test('membership detach validates the parent trip inside the write transaction', () => {
  const detachStart = repositorySource.indexOf('async detachMembership')
  assert.notEqual(detachStart, -1)
  const detachSource = repositorySource.slice(detachStart)

  assert.match(detachSource, /db\.transaction\('rw', db\.trips, db\.tripTravelers/)
  assert.match(detachSource, /const trip = await db\.trips\.get\(tripId\)/)
  assert.match(detachSource, /if \(!trip \|\| trip\.deletedAt\)/)
  assert.match(detachSource, /if \(trip\.status === 'archived'\)/)
})
