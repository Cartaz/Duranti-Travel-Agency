import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8')
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
