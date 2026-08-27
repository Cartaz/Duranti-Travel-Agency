import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const placeRepository = await readFile(new URL('../../src/data/repositories/place-repository.ts', import.meta.url), 'utf8')
const baseRepository = await readFile(new URL('../../src/data/repositories/base-repository.ts', import.meta.url), 'utf8')
const viteConfig = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8')
const pwaIcon = await readFile(new URL('../../public/pwa-icon.svg', import.meta.url), 'utf8')

test('safe place deletion scans unindexed v1 references without materializing whole tables', () => {
  assert.match(placeRepository, /db\.blocks\s*\.filter\(/)
  assert.match(placeRepository, /db\.media\s*\.filter\(/)
  assert.doesNotMatch(placeRepository, /db\.blocks\.toArray\(\)/)
  assert.doesNotMatch(placeRepository, /db\.media\.toArray\(\)/)
})

test('base repository does not expose a generic active count that loads all entities', () => {
  assert.doesNotMatch(baseRepository, /async count\s*\(/)
  assert.doesNotMatch(baseRepository, /\(await this\.list\(\)\)\.length/)
})

test('PWA manifest declares a local install icon with maskable support', () => {
  assert.match(viteConfig, /src: 'pwa-icon\.svg'/)
  assert.match(viteConfig, /sizes: 'any'/)
  assert.match(viteConfig, /purpose: 'any maskable'/)
  assert.match(pwaIcon, /<svg[\s\S]*viewBox="0 0 512 512"/)
})
