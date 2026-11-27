const { test, expect } = require('@playwright/test')

test('production build runs under its CSP and reopens offline from the service worker', async ({ page, context }) => {
  const violations = []
  page.on('console', (message) => {
    if (message.type() === 'error') violations.push(message.text())
  })
  page.on('pageerror', (error) => violations.push(error.message))

  await page.goto('./')
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("script-src 'self'")

  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await page.getByLabel(/Titolo/).fill('Viaggio produzione')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()
  await expect(page.getByRole('heading', { name: 'Viaggio produzione' })).toBeVisible()
  for (const name of ['Luoghi', 'Backup', 'Viaggi']) {
    await page.getByRole('link', { name, exact: true }).click()
    await expect(page.locator('main.app-content')).not.toBeEmpty()
  }
  await expect(page.getByRole('link', { name: 'Viaggio produzione' })).toBeVisible()

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    if (!registration.active) throw new Error('Service worker did not activate.')
  })
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Viaggio produzione' })).toBeVisible()
  await page.getByRole('link', { name: 'Backup', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Backup e ripristino' })).toBeVisible()
  await context.setOffline(false)

  expect(violations, `Console errors (CSP violations included):\n${violations.join('\n')}`).toEqual([])
})

test('the storage lab is not reachable in production', async ({ page }) => {
  await page.goto('./#/lab')
  await expect(page).toHaveURL(/#\/$/)
})
