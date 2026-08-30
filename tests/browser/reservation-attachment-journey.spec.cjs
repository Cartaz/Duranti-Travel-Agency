const { test, expect } = require('@playwright/test')

test('real app persists reservation changes and attachment removal across reloads', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await page.getByLabel(/Titolo/).fill('Viaggio prenotazione UI')
  await page.getByLabel('Partenza').fill('2026-10-01')
  await page.getByLabel('Ritorno').fill('2026-10-02')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()

  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await page.getByRole('button', { name: /Museo o attività/ }).click()
  await page.getByLabel('Titolo della giornata').fill('Museo e quartiere')
  await page.getByRole('button', { name: 'Crea e apri giornata' }).click()

  const activity = page.locator('.reservation-block-activity')
  await expect(activity).toBeVisible()
  const title = activity.getByLabel('Titolo *')
  await title.fill('Museo Archeologico')
  await activity.getByRole('button', { name: 'Crea prenotazione' }).click()
  await expect(activity.getByRole('button', { name: 'Salva prenotazione' })).toBeVisible()

  const attachmentDetails = activity.locator('details.reservation-attachment-details')
  await attachmentDetails.locator('summary').click()
  await attachmentDetails.locator('input[type="file"]').setInputFiles({
    name: 'biglietto-museo.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nDTAgency reservation UI journey\n'),
  })
  await expect(attachmentDetails.getByText('biglietto-museo.pdf', { exact: true })).toBeVisible()

  const dayUrl = page.url()
  await page.reload()
  await expect(page).toHaveURL(dayUrl)

  const reloadedActivity = page.locator('.reservation-block-activity')
  await expect(reloadedActivity.getByLabel('Titolo *')).toHaveValue('Museo Archeologico')
  const reloadedAttachment = reloadedActivity.locator('details.reservation-attachment-details')
  await reloadedAttachment.locator('summary').click()
  await expect(reloadedAttachment.getByText('biglietto-museo.pdf', { exact: true })).toBeVisible()

  await reloadedActivity.getByLabel('Titolo *').fill('Museo Archeologico aggiornato')
  await reloadedActivity.getByRole('button', { name: 'Salva prenotazione' }).click()
  await expect(reloadedActivity.getByLabel('Titolo *')).toHaveValue('Museo Archeologico aggiornato')

  await page.reload()
  const updatedActivity = page.locator('.reservation-block-activity')
  await expect(updatedActivity.getByLabel('Titolo *')).toHaveValue('Museo Archeologico aggiornato')

  const updatedAttachment = updatedActivity.locator('details.reservation-attachment-details')
  await updatedAttachment.locator('summary').click()
  await expect(updatedAttachment.getByText('biglietto-museo.pdf', { exact: true })).toBeVisible()
  await updatedAttachment.getByRole('button', { name: 'Rimuovi' }).click()
  await updatedAttachment.getByRole('button', { name: 'Rimuovi allegato' }).click()
  await expect(updatedAttachment.getByText('Nessun allegato collegato.')).toBeVisible()

  await page.reload()
  const finalAttachment = page.locator('.reservation-block-activity details.reservation-attachment-details')
  await finalAttachment.locator('summary').click()
  await expect(finalAttachment.getByText('Nessun allegato collegato.')).toBeVisible()
  await expect(finalAttachment.getByText('biglietto-museo.pdf', { exact: true })).toHaveCount(0)
})
