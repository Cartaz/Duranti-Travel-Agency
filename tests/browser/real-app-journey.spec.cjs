const { test, expect } = require('@playwright/test')

test('real app persists a trip and templated day across reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Il nostro libro dei viaggi' })).toBeVisible()

  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await expect(page.getByRole('heading', { name: 'Crea un viaggio' })).toBeVisible()
  await page.getByLabel(/Titolo/).fill('Viaggio UI persistente')
  await page.getByLabel('Partenza').fill('2026-09-10')
  await page.getByLabel('Ritorno').fill('2026-09-12')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()

  await expect(page.getByRole('heading', { name: 'Viaggio UI persistente' })).toBeVisible()
  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await expect(page.getByRole('heading', { name: 'Nuova giornata' })).toBeVisible()

  await page.getByRole('button', { name: /Visita città/ }).click()
  await page.getByLabel('Titolo della giornata').fill('Centro storico')
  await page.getByRole('button', { name: 'Crea e apri giornata' }).click()

  await expect(page.getByRole('heading', { name: 'Centro storico' })).toBeVisible()
  const sectionHeadings = page.getByPlaceholder('Titolo della sezione')
  await expect(sectionHeadings.nth(0)).toHaveValue('Mattina')
  await expect(sectionHeadings.nth(1)).toHaveValue('Pranzo')

  const dayUrl = page.url()
  await page.reload()

  await expect(page).toHaveURL(dayUrl)
  await expect(page.getByRole('heading', { name: 'Centro storico' })).toBeVisible()
  await expect(sectionHeadings.nth(0)).toHaveValue('Mattina')
  await expect(sectionHeadings.nth(1)).toHaveValue('Pranzo')
})
