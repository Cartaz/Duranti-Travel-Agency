const VAULT_LOCK_NAME = 'dtagency:vault'

/**
 * Serializes Vault export, import staging, restore and recovery across every
 * DTAgency tab of this origin. IndexedDB and OPFS cannot share a transaction,
 * so two tabs interleaving these multi-step protocols could observe or produce
 * half-replaced state. Web Locks are not re-entrant: never call a locked entry
 * point from inside another one.
 */
export async function withVaultLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return operation()
  return locks.request(VAULT_LOCK_NAME, { mode: 'exclusive' }, operation) as Promise<T>
}

const VAULT_CHANNEL_NAME = 'dtagency:vault'
export type VaultBroadcast = { type: 'restored'; restoreId: string }

// One channel per tab for both directions: BroadcastChannel never delivers a
// message to the object that posted it, so the restoring tab does not reload
// itself and can keep its verification report on screen.
let channel: BroadcastChannel | undefined
function vaultChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined
  channel ??= new BroadcastChannel(VAULT_CHANNEL_NAME)
  return channel
}

/** Tells other open tabs that live data was replaced so they stop using stale state. */
export function announceVaultRestore(restoreId: string): void {
  vaultChannel()?.postMessage({ type: 'restored', restoreId } satisfies VaultBroadcast)
}

export function onVaultRestoredElsewhere(listener: () => void): () => void {
  const current = vaultChannel()
  if (!current) return () => undefined
  const handler = (event: MessageEvent<VaultBroadcast>): void => {
    if (event.data?.type === 'restored') listener()
  }
  current.addEventListener('message', handler)
  return () => current.removeEventListener('message', handler)
}
