import type { EncryptedPayloadV1 } from '../domain/entities'
import { db } from '../data/db/duranti-db'

const SECURITY_KEY_META = 'security.rootKey.v1'
const PBKDF2_ITERATIONS = 600_000
const PBKDF2_SALT_BYTES = 16
const AES_GCM_IV_BYTES = 12
const AES_GCM_TAG_LENGTH = 128
const MIN_PASSPHRASE_LENGTH = 12

interface RootKeyEnvelopeV1 {
  version: 1
  createdAt: string
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    saltB64: string
  }
  wrapping: {
    name: 'AES-KW'
    wrappedKeyB64: string
  }
}

let sessionDataKey: CryptoKey | undefined

export class LocalEncryptionLockedError extends Error {
  constructor() {
    super('Local encryption is locked.')
    this.name = 'LocalEncryptionLockedError'
  }
}

export class LocalEncryptionUnlockError extends Error {
  constructor() {
    super('The local encryption key could not be unlocked.')
    this.name = 'LocalEncryptionUnlockError'
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRootKeyEnvelopeV1(value: unknown): value is RootKeyEnvelopeV1 {
  if (!isRecord(value) || value.version !== 1 || typeof value.createdAt !== 'string') return false
  if (!isRecord(value.kdf) || !isRecord(value.wrapping)) return false

  return (
    value.kdf.name === 'PBKDF2' &&
    value.kdf.hash === 'SHA-256' &&
    typeof value.kdf.iterations === 'number' &&
    Number.isInteger(value.kdf.iterations) &&
    value.kdf.iterations >= 100_000 &&
    typeof value.kdf.saltB64 === 'string' &&
    value.kdf.saltB64.length > 0 &&
    value.wrapping.name === 'AES-KW' &&
    typeof value.wrapping.wrappedKeyB64 === 'string' &&
    value.wrapping.wrappedKeyB64.length > 0
  )
}

export function isEncryptedPayloadV1(value: unknown): value is EncryptedPayloadV1 {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.algorithm === 'AES-GCM' &&
    value.tagLength === AES_GCM_TAG_LENGTH &&
    typeof value.ivB64 === 'string' &&
    value.ivB64.length > 0 &&
    typeof value.ciphertextB64 === 'string' &&
    value.ciphertextB64.length > 0
  )
}

async function importPassphrase(passphrase: string): Promise<CryptoKey> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`The local encryption passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`)
  }

  const encoded = new TextEncoder().encode(passphrase)
  try {
    return await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveKey'])
  } finally {
    encoded.fill(0)
  }
}

async function deriveWrappingKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await importPassphrase(passphrase)
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

async function unwrapDataKey(
  wrappedKey: Uint8Array<ArrayBuffer>,
  wrappingKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    wrappingKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function requireSessionDataKey(): CryptoKey {
  if (!sessionDataKey) throw new LocalEncryptionLockedError()
  return sessionDataKey
}

function buildAdditionalData(purpose: string, entityId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`duranti|encrypted-json|v1|${purpose}|${entityId}`)
}

export async function isLocalEncryptionConfigured(): Promise<boolean> {
  return Boolean(await db.appMeta.get(SECURITY_KEY_META))
}

export function isLocalEncryptionUnlocked(): boolean {
  return Boolean(sessionDataKey)
}

export function lockLocalEncryption(): void {
  sessionDataKey = undefined
}

export async function configureLocalEncryption(passphrase: string): Promise<void> {
  if (await db.appMeta.get(SECURITY_KEY_META)) {
    throw new Error('Local encryption is already configured.')
  }

  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES))
  const wrappingKey = await deriveWrappingKey(passphrase, salt, PBKDF2_ITERATIONS)
  const generatedDataKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
  const wrappedKeyBuffer = await crypto.subtle.wrapKey('raw', generatedDataKey, wrappingKey, 'AES-KW')
  const wrappedKey = new Uint8Array(wrappedKeyBuffer)
  const nonExtractableDataKey = await unwrapDataKey(wrappedKey, wrappingKey)

  const envelope: RootKeyEnvelopeV1 = {
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      saltB64: bytesToBase64(salt),
    },
    wrapping: {
      name: 'AES-KW',
      wrappedKeyB64: bytesToBase64(wrappedKey),
    },
  }

  try {
    await db.appMeta.add({ key: SECURITY_KEY_META, value: envelope })
    sessionDataKey = nonExtractableDataKey
  } catch (error) {
    lockLocalEncryption()
    throw error
  }
}

export async function unlockLocalEncryption(passphrase: string): Promise<void> {
  lockLocalEncryption()
  const record = await db.appMeta.get(SECURITY_KEY_META)
  if (!record || !isRootKeyEnvelopeV1(record.value)) {
    throw new LocalEncryptionUnlockError()
  }

  try {
    const salt = base64ToBytes(record.value.kdf.saltB64)
    const wrappedKey = base64ToBytes(record.value.wrapping.wrappedKeyB64)
    const wrappingKey = await deriveWrappingKey(passphrase, salt, record.value.kdf.iterations)
    sessionDataKey = await unwrapDataKey(wrappedKey, wrappingKey)
  } catch {
    lockLocalEncryption()
    throw new LocalEncryptionUnlockError()
  }
}

export async function encryptJson<T>(
  purpose: string,
  entityId: string,
  value: T,
): Promise<EncryptedPayloadV1> {
  const key = requireSessionDataKey()
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
  const additionalData = buildAdditionalData(purpose, entityId)
  const plaintext = new TextEncoder().encode(JSON.stringify(value))

  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData,
        tagLength: AES_GCM_TAG_LENGTH,
      },
      key,
      plaintext,
    )

    return {
      version: 1,
      algorithm: 'AES-GCM',
      tagLength: AES_GCM_TAG_LENGTH,
      ivB64: bytesToBase64(iv),
      ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
    }
  } finally {
    plaintext.fill(0)
  }
}

export async function decryptJson<T>(
  purpose: string,
  entityId: string,
  payload: EncryptedPayloadV1,
): Promise<T> {
  if (!isEncryptedPayloadV1(payload)) throw new Error('Unsupported encrypted payload format.')

  const key = requireSessionDataKey()
  const iv = base64ToBytes(payload.ivB64)
  const ciphertext = base64ToBytes(payload.ciphertextB64)
  const additionalData = buildAdditionalData(purpose, entityId)

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData,
      tagLength: payload.tagLength,
    },
    key,
    ciphertext,
  )

  const decrypted = new Uint8Array(decryptedBuffer)
  try {
    return JSON.parse(new TextDecoder().decode(decrypted)) as T
  } finally {
    decrypted.fill(0)
  }
}
