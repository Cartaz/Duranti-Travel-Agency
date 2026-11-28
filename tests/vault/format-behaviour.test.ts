import assert from 'node:assert/strict'
import test from 'node:test'
import {
  base64ToBytes,
  bytesToBase64,
  decodeUint32,
  decryptVaultPayload,
  deriveVaultKey,
  encodeUint32,
  encryptVaultPayload,
  fileChunkAdditionalData,
  manifestAdditionalData,
  stableJsonStringify,
  vaultMagicBytes,
} from '../../src/vault/format.ts'

// Executable counterparts of the source-text identity contracts in format.test.ts:
// these exercise the real serializer, framing and cryptography.

const salt = new Uint8Array(16).fill(7)
const fastIterations = 100_000 // the minimum deriveVaultKey accepts

test('canonical JSON is independent of key insertion order', () => {
  const left = stableJsonStringify({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })
  const right = stableJsonStringify({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 })
  assert.equal(left, right)
  assert.equal(left, '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}')
})

test('uint32 framing is big-endian and rejects values outside the range', () => {
  assert.deepEqual([...encodeUint32(0x01020304)], [1, 2, 3, 4])
  assert.equal(decodeUint32(encodeUint32(4_294_967_295)), 4_294_967_295)
  assert.throws(() => encodeUint32(-1))
  assert.throws(() => encodeUint32(2 ** 32))
  assert.equal(new TextDecoder().decode(vaultMagicBytes()), 'DTAVLT01')
})

test('base64 helpers round-trip arbitrary bytes', () => {
  const bytes = Uint8Array.from({ length: 70_000 }, (_, index) => index % 256)
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes)
})

test('Vault payloads decrypt only with the same passphrase and authenticated context', async () => {
  const key = await deriveVaultKey('correct horse battery staple', salt, fastIterations)
  const plaintext = new TextEncoder().encode('{"trips":[]}')
  const aad = manifestAdditionalData('archive-1')
  const encrypted = await encryptVaultPayload(key, aad, plaintext.slice())

  assert.equal(encrypted.iv.byteLength, 12)
  assert.notDeepEqual(encrypted.ciphertext.subarray(0, plaintext.byteLength), plaintext)
  assert.deepEqual(await decryptVaultPayload(key, aad, encrypted.iv, encrypted.ciphertext), plaintext)

  const wrongKey = await deriveVaultKey('wrong passphrase entirely', salt, fastIterations)
  await assert.rejects(decryptVaultPayload(wrongKey, aad, encrypted.iv, encrypted.ciphertext))
  await assert.rejects(
    decryptVaultPayload(key, manifestAdditionalData('archive-2'), encrypted.iv, encrypted.ciphertext),
  )

  const tampered = encrypted.ciphertext.slice()
  tampered[0] ^= 1
  await assert.rejects(decryptVaultPayload(key, aad, encrypted.iv, tampered))
})

test('file chunk authentication binds path, chunk index and plaintext length', () => {
  const entry = {
    index: 3,
    namespace: 'media' as const,
    path: 'dtagency/media/a/original',
    sizeBytes: 10,
    chunkCount: 1,
  }
  const aad = fileChunkAdditionalData('archive-1', entry, 0, 10)
  assert.notEqual(aad, fileChunkAdditionalData('archive-1', { ...entry, path: 'dtagency/media/b/original' }, 0, 10))
  assert.notEqual(aad, fileChunkAdditionalData('archive-1', entry, 1, 10))
  assert.notEqual(aad, fileChunkAdditionalData('archive-1', entry, 0, 9))
})
