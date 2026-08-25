const { test, expect } = require('@playwright/test')

test('DTAgency application use-case contracts', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`${error.name}: ${error.message}`))

  const response = await page.goto('/Duranti-Travel-Agency/tests/browser/application.html')
  expect(response, 'Application harness did not return an HTTP response.').not.toBeNull()
  expect(response.status(), `Application harness returned HTTP ${response.status()}.`).toBeLessThan(400)

  await page.waitForFunction(
    () => Array.isArray(window.__DTAGENCY_APPLICATION_RESULTS__) && window.__DTAGENCY_APPLICATION_RESULTS__.length === 2,
    null,
    { timeout: 30_000 },
  )

  const results = await page.evaluate(() => window.__DTAGENCY_APPLICATION_RESULTS__)
  expect(consoleErrors, `Browser console errors:\n${consoleErrors.join('\n')}`).toEqual([])
  expect(results).toHaveLength(2)
  expect(results.filter((result) => !result.ok), `Application contract failures:\n${JSON.stringify(results, null, 2)}`).toEqual([])
})
