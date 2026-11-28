const { defineConfig } = require('@playwright/test')

// Runs against `vite preview` of the production build (CSP, service worker,
// lazy chunks), which the dev-server suites cannot observe.
module.exports = defineConfig({
  testDir: './tests/browser-production',
  testMatch: '**/*.spec.cjs',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173/Duranti-Travel-Agency/',
    browserName: 'chromium',
    headless: true,
  },
})
