import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readSource } from '../support/source.ts'

const projectFile = (path: string): URL => new URL(path, import.meta.url)

function pngSize(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

test('PWA manifest declares PNG install icons that iOS can use', async () => {
  const config = await readSource(projectFile('../../vite.config.ts'))
  assert.match(config, /src: 'icon-192\.png', sizes: '192x192', type: 'image\/png', purpose: 'any maskable'/)
  assert.match(config, /src: 'icon-512\.png', sizes: '512x512', type: 'image\/png', purpose: 'any maskable'/)
  for (const size of [180, 192, 512]) {
    assert.deepEqual(pngSize(await readFile(projectFile(`../../public/icon-${size}.png`))), {
      width: size,
      height: size,
    })
  }
})

test('index declares an apple-touch-icon and production builds carry a CSP', async () => {
  const html = await readFile(projectFile('../../index.html'), 'utf8')
  assert.match(html, /<link rel="apple-touch-icon" href="\/icon-180\.png" \/>/)
  const config = await readSource(projectFile('../../vite.config.ts'))
  assert.match(config, /"script-src 'self'"/)
  assert.match(config, /apply: 'build'/)
})
