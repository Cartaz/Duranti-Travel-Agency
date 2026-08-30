const { test, expect } = require('@playwright/test')

test('real app keeps traveler document secrets locked across reload and session lock', async ({ page }) => {
  const passphrase = 'traveler-vault-ui-2026'
  const documentNumber = 'YA1234567'
  const attachmentName = 'passaporto-ui.pdf'

  await page.goto('/')
  await page.getByRole('link', { name: 'Viaggiatori' }).click()
  await expect(page.getByRole('heading', { name: 'Viaggiatori' })).toBeVisible()
  await page.getByRole('link', { name: 'Nuovo profilo' }).click()
  await page.getByLabel('Nome *').fill('Ada')
  await page.getByLabel('Cognome *').fill('Viaggiatrice')
  await page.getByRole('button', { name: 'Crea profilo' }).click()

  const travelerCard = page.locator('.traveler-card').filter({ hasText: 'Ada Viaggiatrice' })
  await expect(travelerCard).toBeVisible()
  await travelerCard.getByRole('link', { name: 'Documenti' }).click()
  await expect(page.getByRole('heading', { name: 'Documenti di Ada Viaggiatrice' })).toBeVisible()

  const securityForm = page.locator('.traveler-vault-form')
  await securityForm.getByLabel('Passphrase locale').fill(passphrase)
  await securityForm.getByLabel('Ripeti passphrase').fill(passphrase)
  await securityForm.getByRole('button', { name: 'Configura e sblocca' }).click()
  await expect(page.getByText('Archivio cifrato configurato e sbloccato.')).toBeVisible()

  const documentForm = page.locator('.traveler-document-form').first()
  await documentForm.getByLabel('Numero documento').fill(documentNumber)
  await documentForm.getByLabel('Paese emittente').fill('IT')
  await documentForm.getByLabel('Data emissione').fill('2026-01-10')
  await documentForm.getByLabel('Scadenza').fill('2036-01-09')
  await documentForm.getByLabel('Note private').fill('Documento creato dal journey UI cifrato.')
  await documentForm.getByLabel('Scansione / file').setInputFiles({
    name: attachmentName,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nDTAgency encrypted traveler document journey\n'),
  })
  await documentForm.getByRole('button', { name: 'Salva documento cifrato' }).click()
  await expect(page.getByText('Documento cifrato salvato sul dispositivo.')).toBeVisible()

  const documentCard = page.locator('.traveler-document-card')
  await expect(documentCard.getByText('Passaporto', { exact: true })).toBeVisible()
  await expect(documentCard.getByText(documentNumber, { exact: true })).toBeVisible()
  await expect(documentCard.getByText(new RegExp(attachmentName))).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sblocca i documenti' })).toBeVisible()
  await expect(page.getByText('1 documento protetto presente. I dettagli restano nascosti finché la cassaforte è bloccata.')).toBeVisible()
  await expect(page.getByText(documentNumber, { exact: true })).toHaveCount(0)
  await expect(page.getByText(new RegExp(attachmentName))).toHaveCount(0)

  const unlockForm = page.locator('.traveler-vault-form')
  await unlockForm.getByLabel('Passphrase locale').fill(passphrase)
  await unlockForm.getByRole('button', { name: 'Sblocca' }).click()
  await expect(page.getByText('Archivio documenti sbloccato per questa sessione.')).toBeVisible()
  await expect(page.getByText(documentNumber, { exact: true })).toBeVisible()
  await expect(page.getByText(new RegExp(attachmentName))).toBeVisible()

  await page.getByRole('button', { name: 'Blocca cassaforte' }).click()
  await expect(page.getByText('Archivio documenti bloccato. La chiave è stata rimossa dalla sessione.')).toBeVisible()
  await expect(page.getByText('1 documento protetto presente. I dettagli restano nascosti finché la cassaforte è bloccata.')).toBeVisible()
  await expect(page.getByText(documentNumber, { exact: true })).toHaveCount(0)
  await expect(page.getByText(new RegExp(attachmentName))).toHaveCount(0)
})
