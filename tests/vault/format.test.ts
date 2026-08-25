import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const formatSource = await readFile(new URL('../../src/vault/format.ts', import.meta.url), 'utf8')
const exportSource = await readFile(new URL('../../src/vault/export.ts', import.meta.url), 'utf8')
const importSource = await readFile(new URL('../../src/vault/import.ts', import.meta.url), 'utf8')

test('Vault v1 exposes only DTAgency file identity', () => {
  assert.match(formatSource, /VAULT_FILE_EXTENSION = '\.dtagency'/)
  assert.match(formatSource, /VAULT_MIME_TYPE = 'application\/vnd\.dtagency\.vault'/)
  assert.match(formatSource, /encode\('DTAVLT01'\)/)
})

test('Vault manifest and authenticated-data namespaces are DTAgency v1', () => {
  assert.match(formatSource, /format: 'dtagency-vault'/)
  assert.match(formatSource, /`dtagency\|vault\|v1\|\$\{archiveId\}\|manifest`/)
  assert.match(formatSource, /`dtagency\|vault\|v1\|\$\{archiveId\}\|file\|/)
})

test('Vault export writes the current DTAgency identity', () => {
  assert.match(exportSource, /magic: 'DTAVLT01'/)
  assert.match(exportSource, /format: 'dtagency-vault'/)
  assert.match(exportSource, /`DTAgency-\$\{timestamp\}\$\{VAULT_FILE_EXTENSION\}`/)
})

test('Vault import rejects identities outside DTAgency v1', () => {
  assert.match(importSource, /value\.magic !== 'DTAVLT01'/)
  assert.match(importSource, /value\.format !== 'dtagency-vault'/)
  assert.match(importSource, /\['dtagency', 'media'\]/)
  assert.match(importSource, /\['dtagency', 'private', 'traveler-documents'\]/)
})

test('canonical serializer and uint32 framing remain part of the production format', () => {
  assert.match(formatSource, /export function stableJsonStringify/)
  assert.match(formatSource, /export function encodeUint32/)
  assert.match(formatSource, /export function decodeUint32/)
  assert.match(formatSource, /setUint32\(0, value, false\)/)
  assert.match(formatSource, /getUint32\(0, false\)/)
})

test('Vault cryptography remains PBKDF2-SHA256 plus AES-256-GCM', () => {
  assert.match(formatSource, /VAULT_PBKDF2_ITERATIONS = 600_000/)
  assert.match(formatSource, /hash: 'SHA-256'/)
  assert.match(formatSource, /\{ name: 'AES-GCM', length: 256 \}/)
  assert.match(formatSource, /tagLength: AES_GCM_TAG_BITS/)
  assert.match(formatSource, /crypto\.getRandomValues\(new Uint8Array\(AES_GCM_IV_BYTES\)\)/)
})
