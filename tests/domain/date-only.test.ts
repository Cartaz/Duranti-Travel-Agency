import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDateOnly, normalizeOptionalDateOnly } from '../../src/domain/date-only.ts'

test('date-only validation accepts real calendar dates and trims input', () => {
  assert.equal(normalizeDateOnly(' 2028-02-29 ', 'Data'), '2028-02-29')
  assert.equal(normalizeOptionalDateOnly('2026-08-27', 'Data'), '2026-08-27')
  assert.equal(normalizeOptionalDateOnly('   ', 'Data'), undefined)
})

test('date-only validation rejects impossible and malformed dates', () => {
  assert.throws(() => normalizeDateOnly('2026-02-29', 'Data'), /calendario/)
  assert.throws(() => normalizeDateOnly('2026-13-01', 'Data'), /calendario/)
  assert.throws(() => normalizeDateOnly('27-08-2026', 'Data'), /non è valida/)
})
