import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const adapter = await readFile(new URL('../../src/data/external/nominatim-place-discovery.ts', import.meta.url), 'utf8')
const architecture = await readFile(new URL('../../docs/architecture/place-import-openstreetmap.md', import.meta.url), 'utf8')

test('Nominatim discovery serializes in-process requests and rechecks cache inside the queue', () => {
  assert.match(adapter, /let requestQueue: Promise<void> = Promise\.resolve\(\)/)
  assert.match(adapter, /function serializeRequest<T>/)
  assert.match(adapter, /requestQueue = scheduled\.then\(\(\) => undefined, \(\) => undefined\)/)
  assert.match(adapter, /return serializeRequest\(async \(\) => \{/)
  assert.match(adapter, /const refreshedCache = readCache\(query\)/)
  assert.match(adapter, /await waitForRequestSlot\(\)/)
  assert.match(architecture, /Separate tabs have independent module state/)
})
