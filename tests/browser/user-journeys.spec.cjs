const { test, expect } = require('@playwright/test')

async function openApp(page) {
  const response = await page.goto('/Duranti-Travel-Agency/')
  expect(response, 'DTAgency app did not return an HTTP response.').not.toBeNull()
  expect(response.status(), `DTAgency app returned HTTP ${response.status()}.`).toBeLessThan(400)
  await expect(page.getByRole('heading', { name: 'Il nostro libro dei viaggi' })).toBeVisible()
}

async function createTrip(page, title) {
  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await expect(page.getByRole('heading', { name: 'Crea un viaggio' })).toBeVisible()
  await page.getByLabel('Titolo *').fill(title)
  await page.getByLabel('Partenza').fill('2026-09-10')
  await page.getByLabel('Ritorno').fill('2026-09-12')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

test('real UI persists a planner note across reload', async ({ page }) => {
  await openApp(page)
  await createTrip(page, 'Journey UI persistence')

  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await expect(page.getByRole('heading', { name: 'Nuova giornata' })).toBeVisible()
  await page.getByLabel('Titolo della giornata').fill('Prima giornata UI')
  await page.getByRole('button', { name: 'Crea giornata' }).click()

  await expect(page.getByRole('heading', { name: 'Journey UI persistence' })).toBeVisible()
  await page.getByRole('link', { name: 'Apri Prima giornata UI' }).click()
  await expect(page.getByRole('heading', { name: 'Prima giornata UI' })).toBeVisible()

  await page.getByText('+ Aggiungi alla giornata', { exact: true }).click()
  await page.getByText('Altre opzioni', { exact: true }).click()
  await page.getByRole('button', { name: /Appunti/ }).click()
  await expect(page.getByRole('status')).toContainText('Appunti aggiunto')

  const note = page.getByPlaceholder('Scrivi appunti, idee, dettagli della giornata…')
  await note.fill('Nota persistente creata dal journey Playwright.')
  await page.getByRole('button', { name: 'Salva blocco' }).click()
  await expect(note).toHaveValue('Nota persistente creata dal journey Playwright.')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Prima giornata UI' })).toBeVisible()
  await expect(page.getByPlaceholder('Scrivi appunti, idee, dettagli della giornata…')).toHaveValue('Nota persistente creata dal journey Playwright.')
})

test('real UI archives and restores a trip lifecycle', async ({ page }) => {
  await openApp(page)
  await createTrip(page, 'Journey UI lifecycle')

  await page.getByRole('button', { name: 'Archivia', exact: true }).click()
  await expect(page.getByText('Archiviare “Journey UI lifecycle”?')).toBeVisible()
  await page.getByRole('button', { name: 'Archivia viaggio' }).click()

  await expect(page.getByRole('heading', { name: 'Archivio viaggi' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Journey UI lifecycle' })).toBeVisible()
  await page.getByRole('button', { name: 'Ripristina' }).click()
  await expect(page.getByRole('heading', { name: 'Journey UI lifecycle' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Indice' }).click()
  await expect(page.getByRole('link', { name: /Journey UI lifecycle/ })).toBeVisible()
})
