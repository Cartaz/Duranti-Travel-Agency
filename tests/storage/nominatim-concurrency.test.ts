import test from 'node:test'
import assert from 'node:assert/strict'
import { createNominatimPlaceDiscovery } from '../../src/data/external/nominatim-place-discovery.ts'

test('Nominatim discovery reserves concurrent request slots and deduplicates identical searches', async () => {
  const originalNow = Date.now
  const originalFetch = globalThis.fetch
  const originalSetTimeout = globalThis.setTimeout
  let now = 100_000
  const waits: number[] = []
  const requestedQueries: string[] = []

  Date.now = () => now
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    requestedQueries.push(url.searchParams.get('q') ?? '')
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof globalThis.fetch
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number) => {
    waits.push(Number(delay ?? 0))
    queueMicrotask(callback)
    return 0 as unknown as ReturnType<typeof setTimeout>
  }) as typeof globalThis.setTimeout

  try {
    const discovery = createNominatimPlaceDiscovery('https://example.test')
    await discovery.search('prima')

    now += 500
    await Promise.all([
      discovery.search('seconda'),
      discovery.search('terza'),
    ])

    assert.deepEqual(waits, [500, 1_500])
    assert.deepEqual(requestedQueries, ['prima', 'seconda', 'terza'])

    const deduplicated = createNominatimPlaceDiscovery('https://example.test')
    await Promise.all([
      deduplicated.search('stesso luogo'),
      deduplicated.search('  stesso luogo  '),
    ])
    assert.equal(requestedQueries.filter((query) => query === 'stesso luogo').length, 1)
  } finally {
    Date.now = originalNow
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
  }
})
