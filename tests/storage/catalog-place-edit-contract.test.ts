import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../support/source.ts'

const sourceUrl = new URL('../../src/application/places/place-application.ts', import.meta.url)

test('catalog place editing preserves canonical identity and creation timestamp', async () => {
  const source = await readSource(sourceUrl)
  const updateStart = source.indexOf('async function updateCatalogPlace')
  const updateEnd = source.indexOf('async function getPlannerPlace', updateStart)
  const updateSource = source.slice(updateStart, updateEnd)

  assert.notEqual(updateStart, -1)
  assert.notEqual(updateEnd, -1)
  assert.match(source, /updateCatalogPlace\(placeId: string, input: PlaceDraft\): Promise<Place>/)
  assert.match(updateSource, /const current = await deps\.places\.get\(placeId\)/)
  assert.match(
    updateSource,
    /const updated: Place = \{ \.\.\.current, \.\.\.placeBaseFromDraft\(input\), updatedAt: deps\.now\(\) \}/,
  )
  assert.doesNotMatch(updateSource, /newId\(\)/)
})
