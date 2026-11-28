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

test.describe('without the service worker', () => {
  // Requests answered by the service worker bypass Playwright routing.
  test.use({ serviceWorkers: 'block' })

  test('a page chunk that fails to load offers a reload instead of blanking the app', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('link', { name: 'Nuovo viaggio' })).toBeVisible()
    await page.route('**/assets/VaultBackupPage-*.js', (route) => route.abort())
    await page.getByRole('link', { name: 'Backup', exact: true }).click()
    await expect(page.getByText('Impossibile aprire questa pagina.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ricarica l’app' })).toBeVisible()
    // The shell and navigation survive; other pages still open.
    await page.getByRole('link', { name: 'Luoghi', exact: true }).click()
    await expect(page.getByText('Impossibile aprire questa pagina.')).toHaveCount(0)
  })
})
