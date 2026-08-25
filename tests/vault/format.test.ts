import assert from 'node:assert/strict'
import test from 'node:test'
import {
  VAULT_FILE_EXTENSION,
  VAULT_MIME_TYPE,
  decodeUint32,
  decryptVaultPayload,
  deriveVaultKey,
  encodeUint32,
  encryptVaultPayload,
  fileChunkAdditionalData,
  manifestAdditionalData,
  stableJsonStringify,
  vaultMagicBytes,
  type VaultFileManifestEntry,
} from '../../src/vault/format.ts'

test('Vault v1 exposes only DTAgency file identity', () => {
  assert.equal(VAULT_FILE_EXTENSION, '.dtagency')
  assert.equal(VAULT_MIME_TYPE, 'application/vnd.dtagency.vault')
  assert.equal(new TextDecoder().decode(vaultMagicBytes()), 'DTAVLT01')
})

test('canonical JSON is stable regardless of object insertion order', () => {
  const left = stableJsonStringify({ z: 1, nested: { b: 2, a: 1 }, a: 3 })
  const right = stableJsonStringify({ a: 3, nested: { a: 1, b: 2 }, z: 1 })
  assert.equal(left, right)
  assert.equal(left, '{"a":3,"nested":{"a":1,"b":2},"z":1}')
})

test('uint32 framing round-trips supported boundaries', () => {
  for (const value of [0, 1, 255, 65_535, 0xffff_ffff]) {
    assert.equal(decodeUint32(encodeUint32(value)), value)
  }
  assert.throws(() => encodeUint32(-1))
  assert.throws(() => encodeUint32(0x1_0000_0000))
})

test('AAD binds Vault records to DTAgency v1 identity and file metadata', () => {
  assert.equal(manifestAdditionalData('archive'), 'dtagency|vault|v1|archive|manifest')

  const entry: VaultFileManifestEntry = {
    index: 3,
    namespace: 'media',
    path: 'dtagency/media/item/original',
    sizeBytes: 12,
    chunkCount: 1,
  }
  assert.equal(
    fileChunkAdditionalData('archive', entry, 0, 12),
    'dtagency|vault|v1|archive|file|3|dtagency/media/item/original|chunk|0|12',
  )
})

test('Vault payload authenticates ciphertext and AAD', async () => {
  const salt = new Uint8Array(16)
  salt.fill(7)
  const key = await deriveVaultKey('correct horse battery staple', salt, 100_000)
  const plaintext = new TextEncoder().encode('DTAgency Vault regression payload')
  const aad = manifestAdditionalData('regression-archive')
  const encrypted = await encryptVaultPayload(key, aad, plaintext)

  const decrypted = await decryptVaultPayload(key, aad, encrypted.iv, encrypted.ciphertext)
  assert.equal(new TextDecoder().decode(decrypted), 'DTAgency Vault regression payload')

  await assert.rejects(
    decryptVaultPayload(key, `${aad}-wrong`, encrypted.iv, encrypted.ciphertext),
  )

  const tampered = encrypted.ciphertext.slice()
  tampered[0] ^= 1
  await assert.rejects(decryptVaultPayload(key, aad, encrypted.iv, tampered))
})

test('Vault KDF rejects weak passphrases', async () => {
  await assert.rejects(deriveVaultKey('too-short', new Uint8Array(16), 100_000))
})
