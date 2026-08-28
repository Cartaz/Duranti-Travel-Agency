import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { validateDatabaseV1Semantics } from '../../src/vault/database-v1-validator.ts'
import type { VaultTableSnapshot } from '../../src/vault/format.ts'

const timestamp = '2026-08-28T12:00:00.000Z'

function table(name: string, rows: unknown[]): VaultTableSnapshot {
  return { name, rows }
}

test('Vault v1 semantic validation rejects impossible calendar dates', () => {
  assert.throws(
    () => validateDatabaseV1Semantics([
      table('trips', [{
        id: 'trip-1', title: 'Impossible', status: 'planned',
        startDate: '2026-02-30', createdAt: timestamp, updatedAt: timestamp,
      }]),
    ]),
    /does not exist in the calendar/,
  )
})

test('Vault v1 semantic validation rejects dangling traveler document ownership', () => {
  assert.throws(
    () => validateDatabaseV1Semantics([
      table('travelers', []),
      table('travelerDocuments', [{
        id: 'document-1', travelerId: 'traveler-missing', type: 'passport',
        encryptedPayload: {
          version: 1, algorithm: 'AES-GCM', tagLength: 128,
          ivB64: 'AA==', ciphertextB64: 'AA==',
        },
        createdAt: timestamp, updatedAt: timestamp,
      }]),
    ]),
    /references missing entity traveler-missing/,
  )
})

test('validated Vault staging cleans temporary data when semantic validation fails', async () => {
  const wrapper = await readFile(new URL('../../src/vault/validated-import.ts', import.meta.url), 'utf8')

  assert.match(wrapper, /validateDatabaseV1Semantics\(staged\.manifest\.database\.tables\)/)
  assert.match(wrapper, /validateActiveMediaFiles\(staged\.manifest\.database\.tables, staged\.manifest\.files\)/)
  assert.match(wrapper, /await discardRawStagedVaultImport\(staged\)/)
})
