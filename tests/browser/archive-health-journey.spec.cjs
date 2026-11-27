const { test, expect } = require('@playwright/test')

async function writeCorruptRestoreJournal(page) {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const app = await root.getDirectoryHandle('dtagency', { create: true })
    const state = await app.getDirectoryHandle('vault-restore-state', { create: true })
    const writable = await (await state.getFileHandle('current.json', { create: true })).createWritable()
    await writable.write('{"version":1,"phase":"not-a-phase"}')
    await writable.close()
  })
}

test('backup reminder, persistence request and passphrase policy are live in the shell', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await page.getByLabel(/Titolo/).fill('Viaggio da proteggere')
  await page.getByLabel('Partenza').fill('2026-12-01')
  await page.getByLabel('Ritorno').fill('2026-12-03')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()
  await expect(page.getByRole('heading', { name: 'Viaggio da proteggere' })).toBeVisible()

  await page.reload()
  const notice = page.getByRole('status', { name: 'Stato archivio locale' })
  await expect(notice.getByText('Non hai ancora salvato un backup .dtagency')).toBeVisible()

  const protect = notice.getByRole('button', { name: 'Proteggi l’archivio' })
  if (await protect.isVisible()) {
    await protect.click()
    await expect(protect).toBeEnabled()
  }

  await page.getByRole('link', { name: 'Backup', exact: true }).click()
  const protectCard = page.locator('.vault-card').first()
  await protectCard.getByLabel('Password del backup').fill('short-11chr')
  await protectCard.getByLabel('Ripeti la password').fill('short-11chr')
  await protectCard.getByRole('button', { name: 'Prepara backup' }).click()
  await expect(page.getByRole('alert').filter({ hasText: /troppo corto|almeno 12 caratteri/ })).toBeVisible()

  await protectCard.getByLabel('Password del backup').fill('archive-health-2026')
  await protectCard.getByLabel('Ripeti la password').fill('archive-health-2026')
  await protectCard.getByRole('button', { name: 'Prepara backup' }).click()
  await expect(page.getByText('Backup cifrato pronto. Salvalo fuori da questo browser.')).toBeVisible({
    timeout: 120_000,
  })
  const downloadPromise = page.waitForEvent('download')
  await protectCard.getByRole('button', { name: 'Scarica file' }).click()
  await downloadPromise

  await expect(page.getByText('Non hai ancora salvato un backup .dtagency')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Backup e ripristino' })).toBeVisible()
  await expect(page.getByText('Non hai ancora salvato un backup .dtagency')).toHaveCount(0)
})

test('an unrecoverable restore journal shows an actionable recovery screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Nuovo viaggio' })).toBeVisible()
  await writeCorruptRestoreJournal(page)

  await page.reload()
  const failure = page.locator('main.bootstrap-failure')
  await expect(failure.getByText('Impossibile inizializzare l’archivio locale su questo dispositivo.')).toBeVisible()
  await expect(failure.getByText('Dettaglio:')).toBeVisible()
  await expect(failure.getByRole('heading', { name: 'Ripristino da backup interrotto' })).toBeVisible()
  await expect(failure.getByRole('button', { name: 'Riprova' })).toBeVisible()

  await failure.getByRole('button', { name: 'Abbandona il ripristino interrotto' }).click()
  await failure.getByRole('button', { name: 'Conferma e avvia DTAgency' }).click()
  await expect(page.getByRole('link', { name: 'Nuovo viaggio' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('link', { name: 'Nuovo viaggio' })).toBeVisible()
})

test('restore verification warnings stay on screen instead of being hidden by a reload', async ({ page }) => {
  const password = 'restore-report-2026'
  await page.goto('/')
  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await page.getByLabel(/Titolo/).fill('Viaggio con avvisi')
  await page.getByLabel('Partenza').fill('2026-12-10')
  await page.getByLabel('Ritorno').fill('2026-12-11')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()
  await expect(page.getByRole('heading', { name: 'Viaggio con avvisi' })).toBeVisible()

  await page.getByRole('link', { name: 'Backup', exact: true }).click()
  const protectCard = page.locator('.vault-card').first()
  await protectCard.getByLabel('Password del backup').fill(password)
  await protectCard.getByLabel('Ripeti la password').fill(password)
  await protectCard.getByRole('button', { name: 'Prepara backup' }).click()
  await expect(page.getByText('Backup cifrato pronto. Salvalo fuori da questo browser.')).toBeVisible({
    timeout: 120_000,
  })
  const downloadPromise = page.waitForEvent('download')
  await protectCard.getByRole('button', { name: 'Scarica file' }).click()
  const download = await downloadPromise
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)

  const restoreCard = page.locator('.vault-restore-card')
  await restoreCard.getByLabel('File DTAgency').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/x-dtagency-vault',
    buffer: Buffer.concat(chunks),
  })
  await restoreCard.getByLabel('Password del backup').fill(password)
  await restoreCard.getByRole('button', { name: 'Verifica backup' }).click()
  await expect(restoreCard.getByText('Backup verificato', { exact: true })).toBeVisible({ timeout: 120_000 })

  // Force the post-commit fingerprint check to disagree with the target fingerprint.
  await page.evaluate(() => {
    const subtle = crypto.subtle
    const digest = subtle.digest.bind(subtle)
    subtle.digest = (algorithm, data) =>
      algorithm === 'SHA-256'
        ? Promise.resolve(crypto.getRandomValues(new Uint8Array(32)).buffer)
        : digest(algorithm, data)
  })

  let navigated = false
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigated = true
  })
  await restoreCard.getByRole('button', { name: 'Ripristina questo backup' }).click()
  await restoreCard.getByRole('button', { name: 'Sostituisci e ripristina' }).click()

  const report = restoreCard.locator('.vault-restore-report')
  await expect(report.getByText('Ripristino completato con avvisi di verifica')).toBeVisible({ timeout: 120_000 })
  await expect(report.getByText('L’impronta del database ripristinato non corrisponde al backup.')).toBeVisible()
  await page.waitForTimeout(1_500)
  expect(navigated, 'The page reloaded and hid the verification report.').toBe(false)

  await report.getByRole('button', { name: 'Ricarica l’app' }).click()
  await page.getByRole('link', { name: 'Viaggi', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Viaggio con avvisi' })).toBeVisible()
})
