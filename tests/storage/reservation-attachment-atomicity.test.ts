import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const applicationSource = await readFile(
  new URL('../../src/application/reservations/reservation-application.ts', import.meta.url),
  'utf8',
)
const repositorySource = await readFile(
  new URL('../../src/data/repositories/reservation-block-repository.ts', import.meta.url),
  'utf8',
)

test('reservation application delegates attachment ownership as one semantic mutation', () => {
  const attachStart = applicationSource.indexOf('async function attachPlannerReservationFile')
  const removeStart = applicationSource.indexOf('async function removePlannerReservationAttachment')
  assert.notEqual(attachStart, -1)
  assert.notEqual(removeStart, -1)
  const attachSource = applicationSource.slice(attachStart, removeStart)

  assert.match(attachSource, /deps\.transactions\.attachReservationFile\(/)
  assert.doesNotMatch(attachSource, /deps\.media\.create\(/)
  assert.doesNotMatch(attachSource, /softDelete\(/)
  assert.doesNotMatch(attachSource, /setReservationAttachment\(/)
})

test('reservation attachment metadata and link commit in the same IndexedDB transaction', () => {
  const attachStart = repositorySource.indexOf('async attachReservationFile')
  const removeStart = repositorySource.indexOf('async removeReservationAttachment')
  assert.notEqual(attachStart, -1)
  assert.notEqual(removeStart, -1)
  const attachSource = repositorySource.slice(attachStart, removeStart)

  assert.match(attachSource, /writeMediaFile\(mediaId, source\)/)
  assert.match(attachSource, /db\.transaction\('rw', db\.trips, db\.days, db\.blocks, db\.reservations, db\.media/)
  assert.match(attachSource, /await db\.media\.add\(media\)/)
  assert.match(attachSource, /attachmentMediaId: media\.id/)
  assert.match(attachSource, /await db\.reservations\.put\(updated\)/)
  assert.match(attachSource, /deleteMediaFile\(mediaId\)/)
})
