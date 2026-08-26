import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageUrl = new URL('../../src/features/vault/VaultBackupPage.tsx', import.meta.url)
const appUrl = new URL('../../src/App.tsx', import.meta.url)

test('everyday app exposes the production Vault backup route', async () => {
  const app = await readFile(appUrl, 'utf8')
  assert.match(app, /path="backup"/)
  assert.match(app, /VaultBackupPage/)
})

test('Vault UI preserves the prepare-then-save iPhone flow', async () => {
  const page = await readFile(pageUrl, 'utf8')
  assert.match(page, /prepareVaultExport/)
  assert.match(page, /loadPreparedVaultFile/)
  assert.match(page, /shareVaultFile/)
  assert.match(page, /downloadVaultFile/)
})

test('Vault UI discards replaced export and import staging', async () => {
  const page = await readFile(pageUrl, 'utf8')
  assert.match(page, /if \(prepared\) await discardPreparedVault\(prepared\)/)
  assert.match(page, /if \(staged\) await discardStagedVaultImport\(staged\)/)
})

test('Vault restore stages before explicit replace confirmation', async () => {
  const page = await readFile(pageUrl, 'utf8')
  const stageIndex = page.indexOf('stageVaultImport(')
  const commitIndex = page.indexOf('commitStagedVaultImport(')
  assert.ok(stageIndex >= 0)
  assert.ok(commitIndex > stageIndex)
  assert.match(page, /mode: 'replace'/)
  assert.match(page, /Sostituire tutti i dati correnti\?/)
})
