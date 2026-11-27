import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSource } from '../support/source.ts'

test('source contracts see through Prettier-wrapped member chains', () => {
  const wrapped = normalizeSource('const rows = await deps.blocks\n      .list()\n      .then((items) => items)\n')
  assert.match(wrapped, /deps\.blocks\.list\(/)
})

test('source contracts see through wrapped argument lists and trailing commas', () => {
  const wrapped = normalizeSource("db.transaction(\n  'rw',\n  db.trips,\n  db.days,\n)")
  assert.match(wrapped, /db\.transaction\('rw', db\.trips, db\.days\)/)
})

test('source normalization keeps object spreads and string spacing intact', () => {
  const source = normalizeSource('const updated: Place = {\n  ...current,\n  name,\n}')
  assert.match(source, /const updated: Place = \{ \.\.\.current, name, \}/)
})
