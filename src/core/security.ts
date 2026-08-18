/**
 * Security boundary for sensitive local data.
 *
 * This first layer deliberately exposes only Web Crypto primitives. Sensitive
 * documents must never be stored as plaintext blobs. The final key lifecycle
 * will be tied to a local user credential/passkey before document storage is
 * enabled in the UI.
 */

export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptBytes(key: CryptoKey, bytes: ArrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)

  return { iv, ciphertext }
}

export async function decryptBytes(
  key: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
}

export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key)
}

export async function importDataKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}
