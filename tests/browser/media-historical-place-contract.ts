import type { Day, Media, Trip } from '../../src/domain/entities'
import { createDayMediaApplication } from '../../src/application/media/day-media-application'

export interface MediaHistoricalPlaceContractResult {
  name: string
  ok: boolean
  error?: string
}

export async function runMediaHistoricalPlaceContract(): Promise<MediaHistoricalPlaceContractResult> {
  const name = 'Media caption preserves an unavailable historical place reference'
  try {
    const timestamp = '2026-08-25T12:00:00.000Z'
    const trip: Trip = { id: 'trip-1', title: 'Media trip', status: 'planned', createdAt: timestamp, updatedAt: timestamp }
    const day: Day = { id: 'day-1', tripId: trip.id, sequence: 1, date: '2026-09-01', createdAt: timestamp, updatedAt: timestamp }
    let media: Media = {
      id: 'media-1', tripId: trip.id, dayId: day.id, kind: 'image', placeId: 'place-deleted', caption: 'Prima',
      createdAt: timestamp, updatedAt: timestamp,
    }
    const requestedPlaceIds: string[] = []

    const application = createDayMediaApplication({
      media: {
        listForDay: async () => [media],
        get: async (id) => id === media.id ? media : undefined,
        getFile: async () => new File([], 'photo.jpg', { type: 'image/jpeg' }),
        create: async () => media,
        updateDayMetadata: async (id, input) => {
          if (id !== media.id) throw new Error('Unexpected media id')
          media = { ...media, ...input, updatedAt: timestamp }
          return media
        },
        setDayOrder: async () => undefined,
        softDelete: async () => undefined,
        purge: async () => undefined,
      },
      blocks: { listByDay: async () => [] },
      places: {
        getMany: async () => [],
        get: async (id) => { requestedPlaceIds.push(id); return undefined },
      },
      trips: { get: async (id) => id === trip.id ? trip : undefined },
      days: { get: async (id) => id === day.id ? day : undefined },
      itinerary: { listDayItems: async () => [] },
    })

    const updated = await application.updateDayMediaCaption(trip.id, day.id, media.id, 'Dopo')
    if (updated.caption !== 'Dopo') throw new Error('Caption was not updated.')
    if (updated.placeId !== 'place-deleted') throw new Error('Historical place reference was not preserved.')
    if (requestedPlaceIds.length !== 0) throw new Error('Unchanged historical place was unnecessarily revalidated.')

    let rejected = false
    try {
      await application.updateDayMediaDetails(trip.id, day.id, media.id, { caption: 'Dopo', placeId: 'place-new' })
    } catch (error) {
      rejected = error instanceof Error && error.message.includes('non esiste più')
    }
    if (!rejected) throw new Error('A new unavailable place reference was accepted.')
    if (requestedPlaceIds.join(',') !== 'place-new') throw new Error('New place reference was not validated exactly once.')

    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  }
}
