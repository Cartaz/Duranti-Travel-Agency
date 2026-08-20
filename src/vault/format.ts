import { VAULT_FORMAT_VERSION } from '../lib/versions'

const VAULT_MAGIC = new TextEncoder().encode('DURVLT01')
const AES_GCM_IV_BYTES = 12
const AES_GCM_TAG_BITS = 128
const MIN_VAULT_PASSPHRASE_LENGTH = 12

export { VAULT_FORMAT_VERSION }
export const VAULT_MIME_TYPE = 'application/vnd.duranti.vault'
export const VAULT_FILE_EXTENSION = '.duranti'
export const VAULT_CHUNK_BYTES = 4 * 1024 * 1024
export const VAULT_PBKDF2_ITERATIONS = 600_000
export const MAX_VAULT_MANIFEST_BYTES = 32 * 1024 * 1024

export const VAULT_FRAME_MANIFEST = 1 as const
export const VAULT_FRAME_FILE_CHUNK = 2 as const
export const VAULT_FRAME_END = 255 as const

export interface VaultHeaderV1 {
  magic: 'DURVLT01'
  version: 1
  archiveId: string
  createdAt: string
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    saltB64: string
  }
  encryption: {
    name: 'AES-GCM'
    keyBits: 256
    ivBytes: 12
    tagBits: 128
  }
  chunkBytes: number
}

export type VaultManagedNamespace = 'media' | 'private-document'

export interface VaultTableSnapshot {
  name: string
  rows: unknown[]
}

export interface VaultFileManifestEntry {
  index: number
  namespace: VaultManagedNamespace
  path: string
  sizeBytes: number
  chunkCount: number
}

export interface VaultManifestV1 {
  format: 'duranti-vault'
  version: 1
  archiveId: string
  createdAt: string
  database: {
    name: string
    schemaVersion: number
    tables: VaultTableSnapshot[]
  }
  files: VaultFileManifestEntry[]
}

export interface VaultEncryptedPayload {
  iv: Uint8Array<ArrayBuffer>
  ciphertext: Uint8Array<ArrayBuffer>
}

type JsonPrimitive = null | boolean | number | string
type CanonicalJsonValue =
  | JsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue }

function normalizeJson(value: unknown, inArray = false): CanonicalJsonValue | undefined {
  if (value === undefined) return inArray ? null : undefined
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Vault serialization rejects non-finite numbers.')
    return value
  }

  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item, true) ?? null)
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>
    const output: { [key: string]: CanonicalJsonValue } = {}

    for (const key of Object.keys(source).sort((a, b) => a.localeCompare(b))) {
      const normalized = normalizeJson(source[key])
      if (normalized !== undefined) output[key] = normalized
    }

    return output
  }

  throw new Error(`Vault serialization does not support values of type ${typeof value}.`)
}

export function stableJsonStringify(value: unknown): string {
  const normalized = normalizeJson(value)
  if (normalized === undefined) throw new Error('Vault serialization requires a defined root value.')
  return JSON.stringify(normalized)
}

export function encodeUint32(value: number): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error('Vault frame integer is outside the uint32 range.')
  }

  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, false)
  return bytes
}

export function vaultMagicBytes(): Uint8Array<ArrayBuffer> {
  return VAULT_MAGIC.slice()
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = VAULT_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  if (passphrase.length < MIN_VAULT_PASSPHRASE_LENGTH) {
    throw new Error(`Vault passphrase must be at least ${MIN_VAULT_PASSPHRASE_LENGTH} characters.`)
  }
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) {
    throw new Error('Vault PBKDF2 iterations are invalid.')
  }

  const encoded = new TextEncoder().encode(passphrase)
  try {
    const material = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations,
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  } finally {
    encoded.fill(0)
  }
}

export async function encryptVaultPayload(
  key: CryptoKey,
  aadText: string,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<VaultEncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
  const additionalData = new TextEncoder().encode(aadText)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData,
      tagLength: AES_GCM_TAG_BITS,
    },
    key,
    plaintext,
  )

  return {
    iv,
    ciphertext: new Uint8Array(ciphertext),
  }
}

export function manifestAdditionalData(archiveId: string): string {
  return `duranti|vault|v1|${archiveId}|manifest`
}

export function fileChunkAdditionalData(
  archiveId: string,
  file: VaultFileManifestEntry,
  chunkIndex: number,
  plaintextBytes: number,
): string {
  return `duranti|vault|v1|${archiveId}|file|${file.index}|${file.path}|chunk|${chunkIndex}|${plaintextBytes}`
}
