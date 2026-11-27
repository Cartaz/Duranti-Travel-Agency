import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../support/source.ts'

const applicationUrl = new URL('../../src/application/travel-book/travel-book-application.ts', import.meta.url)
const portsUrl = new URL('../../src/application/travel-book/ports.ts', import.meta.url)
const galleryUrl = new URL('../../src/features/travel-book/TravelBookMediaGallery.tsx', import.meta.url)

test('travel book media stays behind application ports', async () => {
  const [application, ports, gallery] = await Promise.all([
    readSource(applicationUrl),
    readSource(portsUrl),
    readSource(galleryUrl),
  ])

  assert.match(ports, /interface TravelBookMediaReader/)
  assert.match(application, /readChapterMedia\(tripId: string, dayId: string, mediaId: string\)/)
  assert.doesNotMatch(application, /data\/|opfs|URL\.createObjectURL/)
  assert.doesNotMatch(gallery, /data\/repositories|opfs/)
})

test('travel book media gallery owns and releases object URLs', async () => {
  const gallery = await readSource(galleryUrl)
  assert.match(gallery, /URL\.createObjectURL\(file\)/)
  assert.match(gallery, /URL\.revokeObjectURL\(url\)/)
  assert.match(gallery, /return \(\) => \{[\s\S]*cancelled = true[\s\S]*revokeObjectURL/)
})
