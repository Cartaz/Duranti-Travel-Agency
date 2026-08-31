import { DB_VERSION } from '../data/db/dtagency-db.ts'

const LEGACY_DATABASE_SCHEMA_VERSION = 1

export function normalizeVaultDatabaseSchemaVersion(value: unknown): number {
  if (value !== LEGACY_DATABASE_SCHEMA_VERSION && value !== DB_VERSION) {
    throw new Error('Vault database schema is incompatible with this app version.')
  }
  return DB_VERSION
}
