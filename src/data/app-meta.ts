import { VAULT_FORMAT_VERSION } from '../lib/versions'
import { DB_VERSION, db } from './db/duranti-db'

export { VAULT_FORMAT_VERSION }

export interface InstallationMetadata {
  installationId: string
  installationCreatedAt: string
  schemaVersion: number
  vaultFormatVersion: number
  lastOpenedAt: string
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export async function ensureInstallationMetadata(): Promise<InstallationMetadata> {
  return db.transaction('rw', db.appMeta, async () => {
    const now = new Date().toISOString()

    const installationIdRecord = await db.appMeta.get('installationId')
    let installationId = readStringValue(installationIdRecord?.value)
    if (!installationId) {
      installationId = crypto.randomUUID()
      await db.appMeta.put({ key: 'installationId', value: installationId })
    }

    const createdAtRecord = await db.appMeta.get('installationCreatedAt')
    let installationCreatedAt = readStringValue(createdAtRecord?.value)
    if (!installationCreatedAt) {
      installationCreatedAt = now
      await db.appMeta.put({ key: 'installationCreatedAt', value: installationCreatedAt })
    }

    await db.appMeta.bulkPut([
      { key: 'schemaVersion', value: DB_VERSION },
      { key: 'vaultFormatVersion', value: VAULT_FORMAT_VERSION },
      { key: 'lastOpenedAt', value: now },
    ])

    return {
      installationId,
      installationCreatedAt,
      schemaVersion: DB_VERSION,
      vaultFormatVersion: VAULT_FORMAT_VERSION,
      lastOpenedAt: now,
    }
  })
}
