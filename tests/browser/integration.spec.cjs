const { test, expect } = require('@playwright/test')

test('DTAgency persistence and Vault browser contracts', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`${error.name}: ${error.message}`))

  const response = await page.goto('/Duranti-Travel-Agency/tests/browser/index.html')
  expect(response, 'Browser harness did not return an HTTP response.').not.toBeNull()
  expect(response.status(), `Browser harness returned HTTP ${response.status()}.`).toBeLessThan(400)

  await page.waitForFunction(
    () => Array.isArray(window.__DTAGENCY_BROWSER_RESULTS__) && window.__DTAGENCY_BROWSER_RESULTS__.length === 6,
    null,
    { timeout: 120_000 },
  )

  const results = await page.evaluate(() => window.__DTAGENCY_BROWSER_RESULTS__)
  expect(consoleErrors, `Browser console errors:\n${consoleErrors.join('\n')}`).toEqual([])
  expect(Array.isArray(results)).toBe(true)
  expect(results).toHaveLength(6)

  const failures = results.filter((result) => !result.ok)
  expect(failures, `Browser contract failures:\n${JSON.stringify(failures, null, 2)}`).toEqual([])
})
