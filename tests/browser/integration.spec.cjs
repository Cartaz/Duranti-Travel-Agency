const { test, expect } = require('@playwright/test')

test('DTAgency persistence and Vault browser contracts', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`${error.name}: ${error.message}`))

  await page.goto('tests/browser/index.html')
  await page.waitForFunction(
    () => Array.isArray(window.__DTAGENCY_BROWSER_RESULTS__) && window.__DTAGENCY_BROWSER_RESULTS__.length === 5,
    null,
    { timeout: 120_000 },
  )

  const results = await page.evaluate(() => window.__DTAGENCY_BROWSER_RESULTS__)
  expect(consoleErrors, `Browser console errors:\n${consoleErrors.join('\n')}`).toEqual([])
  expect(Array.isArray(results)).toBe(true)
  expect(results).toHaveLength(5)

  const failures = results.filter((result) => !result.ok)
  expect(failures, `Browser contract failures:\n${JSON.stringify(failures, null, 2)}`).toEqual([])
})
