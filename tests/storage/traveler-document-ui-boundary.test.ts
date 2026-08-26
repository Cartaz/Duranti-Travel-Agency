import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageUrl = new URL('../../src/features/travelers/TravelerDocumentsPage.tsx', import.meta.url)
const appUrl = new URL('../../src/App.tsx', import.meta.url)

test('traveler document UI stays behind the application boundary', async () => {
  const page = await readFile(pageUrl, 'utf8')
  assert.match(page, /useApplicationServices/)
  assert.match(page, /travelerDocuments/)
  assert.doesNotMatch(page, /from\s+['"][^'"]*\/data(?:\/|['"])/)
  assert.doesNotMatch(page, /from\s+['"][^'"]*\/security(?:\/|['"])/)
})

test('traveler document route and encrypted attachment limit remain product contracts', async () => {
  const [page, app] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(appUrl, 'utf8')])
  assert.match(app, /travelers\/:travelerId\/documents/)
  assert.match(page, /MAX_ATTACHMENT_BYTES = 20 \* 1024 \* 1024/)
  assert.match(page, /travelerDocuments\.configure/)
  assert.match(page, /travelerDocuments\.unlock/)
  assert.match(page, /travelerDocuments\.lock/)
})
