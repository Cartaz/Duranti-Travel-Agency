export const VAULT_LOCK_NAME = 'dtagency:vault'

/**
 * Serializes every multi-step protocol that reads or replaces managed OPFS
 * bytes together with IndexedDB rows: Vault export, import staging, restore,
 * restore recovery, staging sweep and file purges. IndexedDB and OPFS cannot
 * share a transaction, so two tabs interleaving these steps could observe or
 * produce half-replaced state.
 *
 * Web Locks are not re-entrant: never call a locked entry point from inside
 * another one. With `ifAvailable`, the operation is skipped (undefined) when
 * another tab already holds the lock.
 */
export async function withVaultLock<T>(operation: () => Promise<T>): Promise<T>
export async function withVaultLock<T>(
  operation: () => Promise<T>,
  options: { ifAvailable: true },
): Promise<T | undefined>
export async function withVaultLock<T>(
  operation: () => Promise<T>,
  options: { ifAvailable?: boolean } = {},
): Promise<T | undefined> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return operation()
  if (options.ifAvailable) {
    return locks.request(VAULT_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, (lock) =>
      lock ? operation() : Promise.resolve(undefined),
    ) as Promise<T | undefined>
  }
  return locks.request(VAULT_LOCK_NAME, { mode: 'exclusive' }, operation) as Promise<T>
}

/** True when another context currently holds or waits for the Vault lock. */
export async function isVaultLockBusy(): Promise<boolean> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks || typeof locks.query !== 'function') return false
  const snapshot = await locks.query()
  return [...(snapshot.held ?? []), ...(snapshot.pending ?? [])].some((lock) => lock.name === VAULT_LOCK_NAME)
}
