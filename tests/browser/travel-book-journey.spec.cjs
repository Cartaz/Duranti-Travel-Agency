const { test, expect } = require('@playwright/test')

test('real app reads day media through the travel book and navigates chapters', async ({ page }) => {
  const tripTitle = 'Libro UI con ricordi'
  const firstDayTitle = 'Arrivo in città'
  const secondDayTitle = 'Passeggiata sul mare'
  const mediaName = 'ricordo-ui.png'

  await page.goto('/')
  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await page.getByLabel(/Titolo/).fill(tripTitle)
  await page.getByLabel('Partenza').fill('2026-09-10')
  await page.getByLabel('Ritorno').fill('2026-09-12')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()
  await expect(page.getByRole('heading', { name: tripTitle })).toBeVisible()

  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await page.getByLabel('Titolo della giornata').fill(firstDayTitle)
  await page.getByRole('button', { name: 'Crea giornata' }).click()
  await expect(page.getByRole('heading', { name: tripTitle })).toBeVisible()

  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await page.getByLabel(/^Data della giornata \*/).fill('2026-09-11')
  await page.getByLabel('Titolo della giornata').fill(secondDayTitle)
  await page.getByRole('button', { name: 'Crea giornata' }).click()
  await expect(page.getByRole('heading', { name: tripTitle })).toBeVisible()

  await page.getByRole('link', { name: `Apri ${firstDayTitle}` }).click()
  await expect(page.getByRole('heading', { name: firstDayTitle })).toBeVisible()
  await page.getByLabel('+ Aggiungi ricordi').setInputFiles({
    name: mediaName,
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  })
  await expect(page.getByText(new RegExp(mediaName))).toBeVisible()

  await page.getByRole('link', { name: 'Torna al viaggio' }).click()
  await page.getByRole('link', { name: 'Apri libro' }).click()

  await expect(page.getByRole('heading', { name: tripTitle })).toBeVisible()
  await expect(page.getByText('Capitolo 1 di 2')).toBeVisible()
  await expect(page.getByRole('heading', { name: firstDayTitle })).toBeVisible()
  await expect(page.getByRole('img', { name: mediaName })).toBeVisible()

  await page.getByRole('button', { name: 'Capitolo successivo' }).click()
  await expect(page.getByText('Capitolo 2 di 2')).toBeVisible()
  await expect(page.getByRole('heading', { name: secondDayTitle })).toBeVisible()
  await expect(page.getByRole('img', { name: mediaName })).toHaveCount(0)

  await page.getByRole('button', { name: 'Capitolo precedente' }).click()
  await expect(page.getByText('Capitolo 1 di 2')).toBeVisible()
  await expect(page.getByRole('heading', { name: firstDayTitle })).toBeVisible()
  await expect(page.getByRole('img', { name: mediaName })).toBeVisible()
})
