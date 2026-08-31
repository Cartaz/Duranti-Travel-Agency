import test from 'node:test'
import assert from 'node:assert/strict'
import { validateIanaTimezoneInput, validateLocalDateTimeInput } from '../../src/application/shared/temporal-input.ts'

test('local datetime validation trims and accepts real calendar values', () => {
  assert.equal(validateLocalDateTimeInput(' 2026-09-15T08:30 ', 'Inizio'), '2026-09-15T08:30')
  assert.equal(validateLocalDateTimeInput(undefined, 'Inizio'), undefined)
})

test('local datetime validation rejects malformed and impossible values', () => {
  assert.throws(() => validateLocalDateTimeInput('2026-02-30T08:30', 'Inizio'), /non esistono nel calendario/)
  assert.throws(() => validateLocalDateTimeInput('2026-09-15 08:30', 'Inizio'), /non valide/)
  assert.throws(() => validateLocalDateTimeInput('2026-09-15T24:00', 'Inizio'), /non esistono nel calendario/)
})

test('timezone validation owns the shared IANA contract', () => {
  assert.equal(validateIanaTimezoneInput(' Europe/Rome '), 'Europe/Rome')
  assert.equal(validateIanaTimezoneInput(''), undefined)
  assert.throws(() => validateIanaTimezoneInput('Not/A_Timezone'), /IANA/)
})
