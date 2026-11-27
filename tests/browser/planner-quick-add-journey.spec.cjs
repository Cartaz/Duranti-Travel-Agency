const { test, expect } = require('@playwright/test')

test('quick add appends a block without discarding unsaved edits in other blocks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await page.getByLabel(/Titolo/).fill('Viaggio quick add')
  await page.getByLabel('Partenza').fill('2026-10-05')
  await page.getByLabel('Ritorno').fill('2026-10-06')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()

  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await page.getByRole('button', { name: /Pagina vuota/ }).click()
  await page.getByLabel('Titolo della giornata').fill('Giornata quick add')
  await page.getByRole('button', { name: 'Crea giornata' }).click()
  await page
    .getByRole('link', { name: /Giornata quick add/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Giornata quick add' })).toBeVisible()

  // The built-in toolbar is not rendered at all in the guided page (no CSS-hidden duplicate).
  await expect(page.locator('.planner-toolbar')).toHaveCount(0)

  const quickAdd = page.locator('details.planner-quick-add')
  await quickAdd.locator('summary', { hasText: 'Aggiungi alla giornata' }).click()
  await quickAdd.locator('summary', { hasText: 'Altre opzioni' }).click()
  await quickAdd.getByRole('button', { name: /Appunti/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Appunti aggiunto' })).toBeVisible()
  await expect(quickAdd).not.toHaveAttribute('open', '')

  const notes = page.getByPlaceholder('Scrivi appunti, idee, dettagli della giornata…')
  await expect(notes).toHaveCount(1)
  await notes.fill('Bozza non ancora salvata')

  await quickAdd.locator('summary', { hasText: 'Aggiungi alla giornata' }).click()
  await quickAdd.getByRole('button', { name: /Attività/ }).click()
  const activity = page.locator('.reservation-block-activity')
  await expect(activity).toBeVisible()
  await expect(activity).toBeInViewport()

  // A forced remount used to reset every editor; the unsaved draft must survive.
  await expect(notes).toHaveValue('Bozza non ancora salvata')
})
