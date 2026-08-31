import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_NOMINATIM_ENDPOINT, loadRuntimeConfig } from '../../src/data/external/runtime-config.ts'
import { createNominatimPlaceDiscovery } from '../../src/data/external/nominatim-place-discovery.ts'

test('runtime config can replace Nominatim without a software build', async () => {
  const config = await loadRuntimeConfig('https://app.test/runtime-config.json', async () => new Response(JSON.stringify({ nominatimEndpoint: 'https://geo.example.test/custom/' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  assert.equal(config.nominatimEndpoint, 'https://geo.example.test/custom')
})

test('runtime config falls back to the deliberate public endpoint only when config is unavailable', async () => {
  const config = await loadRuntimeConfig('https://app.test/runtime-config.json', async () => new Response('', { status: 404 }))
  assert.equal(config.nominatimEndpoint, DEFAULT_NOMINATIM_ENDPOINT)
})

test('runtime Nominatim endpoint rejects unsafe protocol', async () => {
  await assert.rejects(() => loadRuntimeConfig('https://app.test/runtime-config.json', async () => new Response(JSON.stringify({ nominatimEndpoint: 'http://geo.example.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } })), /HTTPS/)
})

test('Nominatim discovery resolves its endpoint lazily for each network search path', async () => {
  const originalFetch = globalThis.fetch
  let requested = ''
  globalThis.fetch = (async (input: RequestInfo | URL) => { requested = String(input); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }) }) as typeof globalThis.fetch
  try {
    const discovery = createNominatimPlaceDiscovery(async () => 'https://geo.example.test/nominatim')
    await discovery.search('Roma')
    assert.match(requested, /^https:\/\/geo\.example\.test\/nominatim\/search\?/)
  } finally { globalThis.fetch = originalFetch }
})
