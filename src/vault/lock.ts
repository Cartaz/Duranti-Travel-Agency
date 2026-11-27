// The lock primitive lives in lib/ so data adapters (purge) can share it.
export { isVaultLockBusy, withVaultLock } from '../lib/vault-lock'

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
