import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlaceImportApplication, googleMapsSearchQuery } from '../../src/application/places/place-import.ts'

test('Google Maps full place URLs become a provider-neutral search query', () => {
  assert.equal(
    googleMapsSearchQuery('https://www.google.com/maps/place/Trattoria+Mario/@43.77,11.25,17z/data=!4m6!3m5!1s0x0:0x0'),
    'Trattoria Mario',
  )
})

test('Google Maps country domains are accepted', () => {
  assert.equal(
    googleMapsSearchQuery('https://www.google.it/maps/place/Da+Enzo+al+29/'),
    'Da Enzo al 29',
  )
})

test('Google Maps query URLs use the explicit query parameter', () => {
  assert.equal(
    googleMapsSearchQuery('https://www.google.com/maps/search/?api=1&query=Roscioli%2C+Roma'),
    'Roscioli, Roma',
  )
})

test('short Google Maps links fail visibly instead of depending on a fragile redirect scraper', () => {
  assert.throws(
    () => googleMapsSearchQuery('https://maps.app.goo.gl/abc123'),
    /link Google Maps abbreviato/,
  )
})

test('non-Google and Google-lookalike URLs are rejected before external discovery', () => {
  for (const url of [
    'https://example.com/maps/place/Test',
    'https://notgoogle.com/maps/place/Test',
    'https://google.example.com/maps/place/Test',
  ]) {
    assert.throws(
      () => googleMapsSearchQuery(url),
      /link completo di Google Maps/,
    )
  }
})

test('place import delegates only the parsed query to the discovery port', async () => {
  const queries: string[] = []
  const application = createPlaceImportApplication({
    async search(query) {
      queries.push(query)
      return [{ name: 'Trattoria Mario', provider: 'openstreetmap', providerPlaceId: 'node:42' }]
    },
  })

  const candidates = await application.previewGoogleMapsImport({
    sourceUrl: 'https://www.google.com/maps/place/Trattoria+Mario/',
  })

  assert.deepEqual(queries, ['Trattoria Mario'])
  assert.equal(candidates[0]?.providerPlaceId, 'node:42')
})

test('empty discovery results are actionable and do not silently create data', async () => {
  const application = createPlaceImportApplication({ async search() { return [] } })

  await assert.rejects(
    application.previewGoogleMapsImport({ sourceUrl: 'https://www.google.com/maps/place/Unknown/' }),
    /Puoi comunque inserirlo manualmente/,
  )
})
