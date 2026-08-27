import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const main = await readFile(new URL('../../src/main.tsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8')
const shell = await readFile(new URL('../../src/ui/layout/AppShell.tsx', import.meta.url), 'utf8')

test('bootstrap durability and restore recovery reach presentation as readiness notices', () => {
  assert.match(main, /const bootstrap = await bootstrapApplication\(\)/)
  assert.match(main, /readinessNoticesFrom\(bootstrap\)/)
  assert.match(main, /state\.storagePersistence === 'best-effort'/)
  assert.match(main, /state\.restoreRecovery === 'rolled-back'/)
  assert.match(main, /state\.restoreRecovery === 'finalized-committed'/)
  assert.match(app, /<AppShell readinessNotices=\{readinessNotices\}/)
  assert.match(shell, /aria-label="Stato archivio locale"/)
  assert.match(shell, /to="\/backup"/)
})
