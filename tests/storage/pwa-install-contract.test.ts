import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../support/source.ts'

async function source(path: string): Promise<string> {
  return readSource(new URL(path, import.meta.url))
}

test('PWA manifest declares install icons with maskable purpose', async () => {
  const config = await source('../../vite.config.ts')
  const icon192 = await source('../../public/icon-192.svg')
  const icon512 = await source('../../public/icon-512.svg')

  assert.match(config, /src: 'icon-192\.svg', sizes: '192x192', type: 'image\/svg\+xml', purpose: 'any maskable'/)
  assert.match(config, /src: 'icon-512\.svg', sizes: '512x512', type: 'image\/svg\+xml', purpose: 'any maskable'/)
  assert.match(icon192, /viewBox="0 0 192 192"/)
  assert.match(icon512, /viewBox="0 0 512 512"/)
})
