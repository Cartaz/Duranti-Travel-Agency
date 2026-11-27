import { db } from './db/dtagency-db'

// appMeta key, part of the Vault snapshot like every other appMeta row.
export const LAST_VAULT_SAVED_AT_KEY = 'vault.lastSavedAt'

export const appMetaBackupLedger = {
  async readLastSavedAt(): Promise<string | undefined> {
    const record = await db.appMeta.get(LAST_VAULT_SAVED_AT_KEY)
    return typeof record?.value === 'string' && record.value ? record.value : undefined
  },
  async recordSaved(at: string): Promise<void> {
    await db.appMeta.put({ key: LAST_VAULT_SAVED_AT_KEY, value: at })
  },
}
