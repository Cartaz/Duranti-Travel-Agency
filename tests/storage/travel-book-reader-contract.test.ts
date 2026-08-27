import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pagePath = new URL('../../src/features/travel-book/TravelBookPage.tsx', import.meta.url)
const cssPath = new URL('../../src/features/travel-book/travel-book.css', import.meta.url)

test('travel book reader keeps accessible navigation independent from a 3D renderer', async () => {
  const source = await readFile(pagePath, 'utf8')
  assert.ok(source.includes('ArrowLeft'))
  assert.ok(source.includes('ArrowRight'))
  assert.ok(source.includes('role="progressbar"'))
  assert.ok(source.includes('aria-current='))
  assert.equal(source.includes("from 'three'"), false)
})

test('travel book reader supports reduced motion and a narrow-screen spread', async () => {
  const source = await readFile(cssPath, 'utf8')
  assert.ok(source.includes('prefers-reduced-motion: reduce'))
  assert.ok(source.includes('@media (max-width: 760px)'))
  assert.ok(source.includes('.travel-book-spread { display: block; }'))
})
