import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../support/source.ts'

const pageUrl = new URL('../../src/features/travelers/TravelerDocumentsPage.tsx', import.meta.url)
const appUrl = new URL('../../src/App.tsx', import.meta.url)

test('traveler document UI stays behind the application boundary', async () => {
  const page = await readSource(pageUrl)
  assert.match(page, /useApplicationServices/)
  assert.match(page, /travelerDocuments/)
  assert.doesNotMatch(page, /from\s+['"][^'"]*\/data(?:\/|['"])/)
  assert.doesNotMatch(page, /from\s+['"][^'"]*\/security(?:\/|['"])/)
})

test('traveler document route and encrypted attachment limit remain product contracts', async () => {
  const [page, app] = await Promise.all([readSource(pageUrl), readSource(appUrl)])
  assert.match(app, /travelers\/:travelerId\/documents/)
  assert.match(page, /MAX_ATTACHMENT_BYTES = 20 \* 1024 \* 1024/)
  assert.match(page, /travelerDocuments\.configure/)
  assert.match(page, /travelerDocuments\.unlock/)
  assert.match(page, /travelerDocuments\.lock/)
})
