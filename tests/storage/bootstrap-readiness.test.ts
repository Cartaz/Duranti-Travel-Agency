import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('bootstrap durability and recovery state reaches the application shell', async () => {
  const main = await source('../../src/main.tsx')
  const app = await source('../../src/App.tsx')
  const shell = await source('../../src/ui/layout/AppShell.tsx')

  assert.match(main, /const bootstrap = await bootstrapApplication\(\)/)
  assert.match(main, /<App readiness=\{readinessFromBootstrap\(bootstrap\)\} \/>/)
  assert.match(app, /<AppShell readiness=\{readiness\} \/>/)
  assert.match(shell, /storageWarning === 'best-effort'/)
  assert.match(shell, /recoveryNotice === 'rolled-back'/)
  assert.match(shell, /to="\/backup">Apri backup/)
})
