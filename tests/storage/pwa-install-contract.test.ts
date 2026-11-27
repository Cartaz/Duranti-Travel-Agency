import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readSource } from '../support/source.ts'

const projectFile = (path: string): URL => new URL(path, import.meta.url)

test('PWA manifest declares install icons with maskable purpose', async () => {
  const config = await readSource(projectFile('../../vite.config.ts'))
  const icon192 = await readFile(projectFile('../../public/icon-192.svg'), 'utf8')
  const icon512 = await readFile(projectFile('../../public/icon-512.svg'), 'utf8')

  assert.match(config, /src: 'icon-192\.svg', sizes: '192x192', type: 'image\/svg\+xml', purpose: 'any maskable'/)
  assert.match(config, /src: 'icon-512\.svg', sizes: '512x512', type: 'image\/svg\+xml', purpose: 'any maskable'/)
  assert.match(icon192, /viewBox="0 0 192 192"/)
  assert.match(icon512, /viewBox="0 0 512 512"/)
})
