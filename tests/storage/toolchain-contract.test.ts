import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}
const workflow = await readFile(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8')

test('browser test runner is a locked development dependency', () => {
  assert.equal(packageJson.devDependencies?.['@playwright/test'], '1.62.1')
  assert.equal(packageJson.scripts?.['test:browser'], 'playwright test --config=playwright.config.cjs')
  assert.doesNotMatch(workflow, /npm install --no-save/)
  assert.match(workflow, /npm run test:browser/)
})

test('3D dependencies are introduced only with the renderer that owns them', () => {
  assert.equal(packageJson.dependencies?.three, undefined)
  assert.equal(packageJson.devDependencies?.['@types/three'], undefined)
})
