import assert from 'node:assert/strict'
import { readSource } from '../support/source.ts'
import test from 'node:test'

const mediaStore = await readSource(new URL('../../src/data/opfs/opfs-store.ts', import.meta.url))
const privateStore = await readSource(new URL('../../src/data/opfs/private-document-store.ts', import.meta.url))
const encryption = await readSource(new URL('../../src/security/local-encryption.ts', import.meta.url))

test('managed OPFS trees live under the DTAgency root', () => {
  assert.match(mediaStore, /const ROOT_DIRECTORY = 'dtagency'/)
  assert.match(privateStore, /const ROOT_DIRECTORY = 'dtagency'/)
  assert.match(mediaStore, /`\$\{ROOT_DIRECTORY\}\/\$\{MEDIA_DIRECTORY\}\/\$\{mediaId\}\/original`/)
  assert.match(privateStore, /const DOCUMENT_DIRECTORY = 'traveler-documents'/)
})

test('private document envelope uses the DTAgency v1 marker', () => {
  assert.match(privateStore, /encode\('DTADOC01'\)/)
  assert.match(privateStore, /const AES_GCM_IV_BYTES = 12/)
  assert.match(privateStore, /const AES_GCM_TAG_BYTES = 16/)
})

test('local encryption AAD is namespaced to DTAgency v1', () => {
  assert.match(encryption, /`dtagency\|encrypted-json\|v1\|\$\{purpose\}\|\$\{entityId\}`/)
  assert.match(encryption, /`dtagency\|encrypted-file\|v1\|\$\{purpose\}\|\$\{entityId\}`/)
})

test('local sensitive-data encryption remains AES-GCM with wrapped DEK', () => {
  assert.match(encryption, /PBKDF2_ITERATIONS = 600_000/)
  assert.match(encryption, /name: 'AES-KW'/)
  assert.match(encryption, /name: 'AES-GCM'/)
  assert.match(encryption, /AES_GCM_IV_BYTES = 12/)
})
