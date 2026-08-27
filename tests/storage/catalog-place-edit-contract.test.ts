import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sourceUrl = new URL('../../src/application/places/place-application.ts', import.meta.url)

test('catalog place editing preserves canonical identity and creation timestamp', async () => {
  const source = await readFile(sourceUrl, 'utf8')

  assert.match(source, /updateCatalogPlace\(placeId: string, input: PlaceDraft\): Promise<Place>/)
  assert.match(source, /const current = await deps\.places\.get\(placeId\)/)
  assert.match(source, /const updated: Place = \{ \.\.\.current, \.\.\.placeBaseFromDraft\(input\), updatedAt: deps\.now\(\) \}/)
  assert.doesNotMatch(source, /updateCatalogPlace[\s\S]*newId\(\)/)
})
