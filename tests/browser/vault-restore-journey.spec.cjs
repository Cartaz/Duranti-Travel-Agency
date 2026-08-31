const { test, expect } = require('@playwright/test')

async function downloadToBuffer(download) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

test('real app restores a downloaded Vault snapshot and reloads the restored data', async ({ page }) => {
  const password = 'vault-ui-journey-2026'

  await page.goto('/')
  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await page.getByLabel(/Titolo/).fill('Backup originale')
  await page.getByLabel('Partenza').fill('2026-11-01')
  await page.getByLabel('Ritorno').fill('2026-11-02')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()
  await expect(page.getByRole('heading', { name: 'Backup originale' })).toBeVisible()

  await page.getByRole('link', { name: 'Backup', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Backup e ripristino' })).toBeVisible()
  const protectCard = page.locator('.vault-card').first()
  await protectCard.getByLabel('Password del backup').fill(password)
  await protectCard.getByLabel('Ripeti la password').fill(password)
  await protectCard.getByRole('button', { name: 'Prepara backup' }).click()
  await expect(page.getByText('Backup cifrato pronto. Salvalo fuori da questo browser.')).toBeVisible({ timeout: 120_000 })

  const downloadPromise = page.waitForEvent('download')
  await protectCard.getByRole('button', { name: 'Scarica file' }).click()
  const download = await downloadPromise
  const backupBuffer = await downloadToBuffer(download)
  const backupName = download.suggestedFilename()
  expect(backupName.endsWith('.dtagency')).toBe(true)
  expect(backupBuffer.length).toBeGreaterThan(0)

  await page.getByRole('link', { name: 'Viaggi', exact: true }).click()
  await page.getByRole('link', { name: 'Backup originale' }).click()
  await page.getByRole('link', { name: 'Modifica' }).click()
  await page.getByLabel('Titolo *').fill('Dati da sostituire')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await expect(page.getByRole('heading', { name: 'Dati da sostituire' })).toBeVisible()

  await page.getByRole('link', { name: 'Backup', exact: true }).click()
  const restoreCard = page.locator('.vault-restore-card')
  await restoreCard.getByLabel('File DTAgency').setInputFiles({
    name: backupName,
    mimeType: 'application/x-dtagency-vault',
    buffer: backupBuffer,
  })
  await restoreCard.getByLabel('Password del backup').fill(password)
  await restoreCard.getByRole('button', { name: 'Verifica backup' }).click()
  await expect(restoreCard.getByText('Backup verificato', { exact: true })).toBeVisible({ timeout: 120_000 })

  await restoreCard.getByRole('button', { name: 'Ripristina questo backup' }).click()
  const restoreConfirm = restoreCard.getByRole('button', { name: 'Sostituisci e ripristina' })
  await expect(restoreConfirm).toBeVisible()
  const reloadPromise = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame(), { timeout: 120_000 })
  await restoreConfirm.click()
  await reloadPromise

  await expect(page.getByRole('heading', { name: 'Backup e ripristino' })).toBeVisible()
  await page.getByRole('link', { name: 'Viaggi', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Il nostro libro dei viaggi' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Backup originale' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dati da sostituire' })).toHaveCount(0)
})
