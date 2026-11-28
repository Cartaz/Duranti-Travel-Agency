import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../support/source.ts'

async function source(path: string): Promise<string> {
  return readSource(new URL(path, import.meta.url))
}

test('bootstrap durability and recovery state reaches the application shell', async () => {
  const main = await source('../../src/main.tsx')
  const app = await source('../../src/App.tsx')
  const shell = await source('../../src/ui/layout/AppShell.tsx')

  assert.match(main, /const bootstrap = await bootstrapApplication\(\)/)
  assert.match(main, /<App readiness=\{readinessFromBootstrap\(bootstrap\)\} \/>/)
  assert.match(app, /<AppShell readiness=\{readiness\} \/>/)
  assert.match(shell, /<ArchiveStatusProvider>/)
  assert.match(shell, /status\?\.persistence === 'best-effort'/)
  assert.match(shell, /requestPersistence\(\)/)
  assert.match(shell, /recoveryNotice === 'rolled-back'/)
  assert.match(shell, /to="\/backup">Apri backup/)
})

test('bootstrap sweeps stale Vault staging only after recovery and never fails startup on it', async () => {
  const bootstrap = await source('../../src/data/bootstrap.ts')
  const recovery = bootstrap.indexOf('await recoverInterruptedVaultRestore()')
  const sweep = bootstrap.indexOf('await sweepStaleVaultStaging()')
  assert.ok(recovery >= 0 && sweep > recovery)
  assert.match(bootstrap, /try \{ await sweepStaleVaultStaging\(\) \} catch/)
})

test('bootstrap failure renders an actionable recovery screen', async () => {
  const main = await source('../../src/main.tsx')
  assert.match(main, /<BootstrapFailure/)
  assert.match(main, /onAbandonRestore=/)
  assert.match(main, /onVaultRestoredElsewhere\(/)
})
