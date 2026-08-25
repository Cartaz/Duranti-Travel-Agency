import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../src/data/db/dtagency-db.ts', import.meta.url), 'utf8')

test('database has a single DTAgency v1 baseline', () => {
  assert.match(source, /export const DB_NAME = 'dtagency'/)
  assert.match(source, /export const DB_VERSION = 1/)
  assert.equal((source.match(/\.version\(/g) ?? []).length, 1)
})

test('database baseline does not embed migration upgrade chains', () => {
  assert.doesNotMatch(source, /\.upgrade\s*\(/)
  assert.doesNotMatch(source, /\.version\(2\)/)
})
