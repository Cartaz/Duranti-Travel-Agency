import assert from 'node:assert/strict'
import test from 'node:test'
import { DB_VERSION } from '../../src/data/db/dtagency-db.ts'
import { normalizeVaultDatabaseSchemaVersion } from '../../src/vault/database-schema-compatibility.ts'

test('Vault accepts the frozen v1 snapshot and normalizes it to the current index-only schema', () => {
  assert.equal(DB_VERSION, 2)
  assert.equal(normalizeVaultDatabaseSchemaVersion(1), DB_VERSION)
  assert.equal(normalizeVaultDatabaseSchemaVersion(DB_VERSION), DB_VERSION)
})

test('Vault rejects unknown database schema versions', () => {
  for (const value of [0, 3, '1', null, undefined]) {
    assert.throws(() => normalizeVaultDatabaseSchemaVersion(value), /incompatible/)
  }
})
