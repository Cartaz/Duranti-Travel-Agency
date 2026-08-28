import type { Block, Day, Itinerary, Media, Reservation, Trip } from '../../src/domain/entities'
import { createDayMediaApplication } from '../../src/application/media/day-media-application'
import { createReservationApplication } from '../../src/application/reservations/reservation-application'
import { createItineraryApplication } from '../../src/application/itinerary/itinerary-application'

export interface MediaHistoricalPlaceContractResult {
  name: string
  ok: boolean
  error?: string
}

export async function runMediaHistoricalPlaceContract(): Promise<MediaHistoricalPlaceContractResult> {
  const name = 'Historical place references remain editable without accepting new missing places'
  try {
    const timestamp = '2026-08-25T12:00:00.000Z'
    const trip: Trip = { id: 'trip-1', title: 'Historical places trip', status: 'planned', createdAt: timestamp, updatedAt: timestamp }
    const day: Day = { id: 'day-1', tripId: trip.id, sequence: 1, date: '2026-09-01', createdAt: timestamp, updatedAt: timestamp }

    let media: Media = {
      id: 'media-1', tripId: trip.id, dayId: day.id, kind: 'image', placeId: 'place-deleted', caption: 'Prima',
      createdAt: timestamp, updatedAt: timestamp,
    }
    const mediaPlaceLookups: string[] = []
    const mediaApplication = createDayMediaApplication({
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
        softDeleteForDay: async () => undefined,
        purge: async () => undefined,
      },
      blocks: { listByDay: async () => [] },
      places: {
        getMany: async () => [],
        get: async (id) => { mediaPlaceLookups.push(id); return undefined },
      },
      trips: { get: async (id) => id === trip.id ? trip : undefined },
      days: { get: async (id) => id === day.id ? day : undefined },
      itinerary: { listDayItems: async () => [] },
    })

    const updatedMedia = await mediaApplication.updateDayMediaCaption(trip.id, day.id, media.id, 'Dopo')
    if (updatedMedia.caption !== 'Dopo' || updatedMedia.placeId !== 'place-deleted') throw new Error('Media historical place reference was not preserved.')
    if (mediaPlaceLookups.length !== 0) throw new Error('Media revalidated an unchanged historical place.')
    let mediaRejected = false
    try {
      await mediaApplication.updateDayMediaDetails(trip.id, day.id, media.id, { caption: 'Dopo', placeId: 'place-new' })
    } catch (error) {
      mediaRejected = error instanceof Error && error.message.includes('non esiste più')
    }
    if (!mediaRejected || mediaPlaceLookups.join(',') !== 'place-new') throw new Error('Media accepted a new unavailable place reference.')

    const reservationBlock: Block = {
      id: 'block-reservation', tripId: trip.id, dayId: day.id, type: 'activity', position: 1,
      content: { reservationId: 'reservation-1' }, createdAt: timestamp, updatedAt: timestamp,
    }
    let reservation: Reservation = {
      id: 'reservation-1', tripId: trip.id, dayId: day.id, type: 'activity', title: 'Museo', status: 'planned',
      placeId: 'place-deleted', createdAt: timestamp, updatedAt: timestamp,
    }
    const reservationPlaceLookups: string[] = []
    const reservationApplication = createReservationApplication({
      blocks: { get: async (id) => id === reservationBlock.id ? reservationBlock : undefined },
      reservations: { get: async (id) => id === reservation.id ? reservation : undefined },
      places: {
        get: async (id) => { reservationPlaceLookups.push(id); return undefined },
        list: async () => [],
      },
      media: {
        get: async () => undefined,
        getFile: async () => new File([], 'unused'),
        create: async () => { throw new Error('Unexpected media create') },
        softDelete: async () => undefined,
        purge: async () => undefined,
      },
      transactions: {
        saveReservationForBlock: async (_blockId, _tripId, _dayId, value) => { reservation = value },
        setReservationAttachment: async () => reservation,
        softDeleteReservationBlock: async () => undefined,
      },
      trips: { get: async (id) => id === trip.id ? trip : undefined },
      days: { get: async (id) => id === day.id ? day : undefined },
      now: () => timestamp,
      newId: () => 'reservation-new',
    })

    const updatedReservation = await reservationApplication.savePlannerReservation(trip.id, day.id, reservationBlock.id, {
      title: 'Museo aggiornato', status: 'planned', placeId: 'place-deleted',
    })
    if (updatedReservation.placeId !== 'place-deleted' || updatedReservation.title !== 'Museo aggiornato') throw new Error('Reservation historical place reference was not preserved.')
    if (reservationPlaceLookups.length !== 0) throw new Error('Reservation revalidated an unchanged historical place.')
    let reservationRejected = false
    try {
      await reservationApplication.savePlannerReservation(trip.id, day.id, reservationBlock.id, {
        title: 'Museo aggiornato', status: 'planned', placeId: 'place-new',
      })
    } catch (error) {
      reservationRejected = error instanceof Error && error.message.includes('non esiste più')
    }
    if (!reservationRejected || reservationPlaceLookups.join(',') !== 'place-new') throw new Error('Reservation accepted a new unavailable place reference.')

    let itinerary: Itinerary = {
      id: 'itinerary-1', tripId: trip.id, dayId: day.id, title: 'Passeggiata', type: 'custom', status: 'planned',
      placeId: 'place-deleted', position: 1, createdAt: timestamp, updatedAt: timestamp,
    }
    const itineraryPlaceLookups: string[] = []
    const itineraryApplication = createItineraryApplication({
      trips: { get: async (id) => id === trip.id ? trip : undefined },
      days: {
        get: async (id) => id === day.id ? day : undefined,
        listByTrip: async () => [day],
      },
      blocks: {
        get: async () => undefined,
        listByDay: async () => [],
        listByTrip: async () => [],
      },
      itineraries: {
        get: async (id) => id === itinerary.id ? itinerary : undefined,
        listByDay: async () => [itinerary],
        listByTrip: async () => [itinerary],
        saveManual: async (value) => { itinerary = value; return itinerary },
        softDeleteManual: async () => 'deleted',
        resolveOrphan: async () => undefined,
        moveManualUntimed: async () => false,
      },
      places: {
        get: async (id) => { itineraryPlaceLookups.push(id); return undefined },
        getMany: async () => [],
        list: async () => [],
      },
      reservations: {
        get: async () => undefined,
        listByDay: async () => [],
        listByTrip: async () => [],
      },
      reservationSync: { saveReservationForBlock: async () => undefined },
      now: () => timestamp,
      newId: () => 'itinerary-new',
    })

    const updatedItinerary = await itineraryApplication.saveManualItineraryItem(trip.id, day.id, itinerary.id, {
      title: 'Passeggiata aggiornata', type: 'custom', status: 'planned', placeId: 'place-deleted',
    })
    if (updatedItinerary.placeId !== 'place-deleted' || updatedItinerary.title !== 'Passeggiata aggiornata') throw new Error('Itinerary historical place reference was not preserved.')
    if (itineraryPlaceLookups.length !== 0) throw new Error('Itinerary revalidated an unchanged historical place.')
    let itineraryRejected = false
    try {
      await itineraryApplication.saveManualItineraryItem(trip.id, day.id, itinerary.id, {
        title: 'Passeggiata aggiornata', type: 'custom', status: 'planned', placeId: 'place-new',
      })
    } catch (error) {
      itineraryRejected = error instanceof Error && error.message.includes('non esiste più')
    }
    if (!itineraryRejected || itineraryPlaceLookups.join(',') !== 'place-new') throw new Error('Itinerary accepted a new unavailable place reference.')

    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  }
}
