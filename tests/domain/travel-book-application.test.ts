import test from 'node:test'
import assert from 'node:assert/strict'
import { createTravelBookApplication } from '../../src/application/travel-book/travel-book-application.ts'
import type { Day, Media, Trip } from '../../src/domain/entities.ts'

const trip: Trip = {
  id: 'trip-1', title: 'Giappone', subtitle: 'Tokyo e Kyoto', status: 'completed',
  startDate: '2026-04-01', endDate: '2026-04-03', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-04-04T00:00:00.000Z',
}

const days: Day[] = [
  { id: 'day-2', tripId: 'trip-1', sequence: 2, date: '2026-04-02', title: 'Kyoto', journalText: 'Templi e ciliegi.', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'day-1', tripId: 'trip-1', sequence: 1, date: '2026-04-01', title: 'Tokyo', summary: 'Primo giorno', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
]

const tokyoMedia: Media = {
  id: 'media-1', tripId: 'trip-1', dayId: 'day-1', kind: 'image', mimeType: 'image/jpeg',
  originalName: 'tokyo.jpg', caption: 'Tokyo di sera', sizeBytes: 123, opfsPath: 'media/media-1',
  createdAt: '2026-04-01T10:00:00.000Z', updatedAt: '2026-04-01T10:00:00.000Z',
}

function emptyMediaPort() {
  return {
    async listDayMedia() { return [] as Media[] },
    async readMediaFile() { throw new Error('not used') },
  }
}

test('travel book projects trip, days and media into stable ordered chapters', async () => {
  const application = createTravelBookApplication({
    trips: { async getTrip(id) { return id === trip.id ? trip : undefined } },
    days: { async listTripDays() { return days } },
    media: {
      async listDayMedia(_tripId, dayId) { return dayId === 'day-1' ? [tokyoMedia] : [] },
      async readMediaFile() { throw new Error('not used') },
    },
  })

  const book = await application.loadTravelBook('trip-1')

  assert.equal(book.title, 'Giappone')
  assert.equal(book.status, 'completed')
  assert.deepEqual(book.chapters.map((chapter) => chapter.dayId), ['day-1', 'day-2'])
  assert.equal(book.chapters[0].summary, 'Primo giorno')
  assert.deepEqual(book.chapters[0].media, [{ id: 'media-1', kind: 'image', mimeType: 'image/jpeg', originalName: 'tokyo.jpg', caption: 'Tokyo di sera' }])
  assert.deepEqual(book.chapters[1].media, [])
  assert.equal(book.chapters[1].journalText, 'Templi e ciliegi.')
  assert.deepEqual(days.map((day) => day.id), ['day-2', 'day-1'])
})

test('travel book remains readable for archived trips', async () => {
  const archived: Trip = { ...trip, status: 'archived', archivedFromStatus: 'completed' }
  const application = createTravelBookApplication({
    trips: { async getTrip() { return archived } },
    days: { async listTripDays() { return [] } },
    media: emptyMediaPort(),
  })

  const book = await application.loadTravelBook('trip-1')
  assert.equal(book.status, 'archived')
  assert.deepEqual(book.chapters, [])
})

test('travel book fails visibly when the trip no longer exists', async () => {
  let daysRead = false
  let mediaRead = false
  const application = createTravelBookApplication({
    trips: { async getTrip() { return undefined } },
    days: { async listTripDays() { daysRead = true; return [] } },
    media: {
      async listDayMedia() { mediaRead = true; return [] },
      async readMediaFile() { throw new Error('not used') },
    },
  })

  await assert.rejects(application.loadTravelBook('missing'), /Il viaggio non esiste o è stato eliminato/)
  assert.equal(daysRead, false)
  assert.equal(mediaRead, false)
})
