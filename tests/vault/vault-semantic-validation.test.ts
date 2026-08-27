import assert from 'node:assert/strict'
import test from 'node:test'
import type { VaultTableSnapshot } from '../../src/vault/format.ts'
import { validateVaultDatabaseSnapshotV1 } from '../../src/vault/validate-snapshot-v1.ts'

const TABLES = [
  'appMeta', 'auditLog', 'blocks', 'days', 'expenses', 'itineraries', 'links', 'media', 'places',
  'reservations', 'templates', 'travelerDocuments', 'travelers', 'trips', 'tripTravelers',
] as const

function emptySnapshot(): VaultTableSnapshot[] {
  return TABLES.map((name) => ({ name, rows: [] }))
}

function table(tables: VaultTableSnapshot[], name: string): VaultTableSnapshot {
  const value = tables.find((candidate) => candidate.name === name)
  if (!value) throw new Error(`Missing test table ${name}`)
  return value
}

const timestamp = '2026-08-27T08:00:00.000Z'

test('Vault v1 semantic validation accepts an empty baseline', () => {
  assert.doesNotThrow(() => validateVaultDatabaseSnapshotV1(emptySnapshot()))
})

test('Vault v1 semantic validation rejects impossible trip dates and statuses', () => {
  const tables = emptySnapshot()
  table(tables, 'trips').rows.push({
    id: 'trip-1', title: 'Invalid', status: 'teleporting', startDate: '2026-02-31',
    createdAt: timestamp, updatedAt: timestamp,
  })
  assert.throws(() => validateVaultDatabaseSnapshotV1(tables), /status is unsupported|calendar date/)
})

test('Vault v1 semantic validation rejects missing ownership parents', () => {
  const tables = emptySnapshot()
  table(tables, 'days').rows.push({
    id: 'day-1', tripId: 'missing-trip', date: '2026-09-01', sequence: 1,
    createdAt: timestamp, updatedAt: timestamp,
  })
  assert.throws(() => validateVaultDatabaseSnapshotV1(tables), /tripId references a missing record/)
})

test('Vault v1 semantic validation accepts references to tombstoned parents', () => {
  const tables = emptySnapshot()
  table(tables, 'trips').rows.push({
    id: 'trip-1', title: 'Historical', status: 'completed',
    createdAt: timestamp, updatedAt: timestamp, deletedAt: '2026-08-28T08:00:00.000Z',
  })
  table(tables, 'days').rows.push({
    id: 'day-1', tripId: 'trip-1', date: '2026-09-01', sequence: 1,
    createdAt: timestamp, updatedAt: timestamp, deletedAt: '2026-08-28T08:00:00.000Z',
  })
  assert.doesNotThrow(() => validateVaultDatabaseSnapshotV1(tables))
})

test('Vault v1 semantic validation rejects malformed encrypted traveler documents', () => {
  const tables = emptySnapshot()
  table(tables, 'travelers').rows.push({
    id: 'traveler-1', firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada Lovelace',
    createdAt: timestamp, updatedAt: timestamp,
  })
  table(tables, 'travelerDocuments').rows.push({
    id: 'document-1', travelerId: 'traveler-1', type: 'passport', encryptedPayload: { version: 0 },
    createdAt: timestamp, updatedAt: timestamp,
  })
  assert.throws(() => validateVaultDatabaseSnapshotV1(tables), /encryptedPayload/)
})
