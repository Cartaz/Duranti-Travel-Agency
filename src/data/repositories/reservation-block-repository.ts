import type { Block, Itinerary, Media, Reservation } from '../../domain/entities'
import { itineraryStatusForReservation, itineraryTypeForReservation, reservationTypeForBlockType } from '../../domain/reservation-itinerary-mapping'
import { db } from '../db/dtagency-db'
import { assertEntityBase } from '../db/validate'
import { deleteMediaFile, writeMediaFile } from '../opfs/opfs-store'

function readReservationId(block: Block): string | undefined {
  const value = block.content.reservationId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il riferimento alla prenotazione non è valido.')
  return value
}

async function requireEditableTripDay(tripId: string, dayId: string): Promise<void> {
  const trip = await db.trips.get(tripId)
  if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare le prenotazioni.')

  const day = await db.days.get(dayId)
  if (!day || day.deletedAt || day.tripId !== tripId) {
    throw new Error('La giornata non appartiene a questo viaggio.')
  }
}

function assertReservationContext(
  reservation: Reservation,
  tripId: string,
  dayId: string,
  expectedType: Reservation['type'],
): void {
  if (
    reservation.tripId !== tripId ||
    reservation.dayId !== dayId ||
    reservation.type !== expectedType
  ) {
    throw new Error('La prenotazione collegata non appartiene a questo blocco.')
  }
}

function assertMediaContext(media: Media, tripId: string, dayId: string, blockId: string): void {
  if (media.tripId !== tripId || media.dayId !== dayId || media.blockId !== blockId) {
    throw new Error('L’allegato non appartiene a questa prenotazione.')
  }
  if (media.kind !== 'image' && media.kind !== 'document') {
    throw new Error('Il media collegato non è un allegato supportato.')
  }
}

function assertItineraryContext(
  itinerary: Itinerary,
  tripId: string,
  dayId: string,
  blockId: string,
  reservationId: string,
): void {
  if (
    itinerary.tripId !== tripId ||
    itinerary.dayId !== dayId ||
    itinerary.blockId !== blockId ||
    (itinerary.reservationId !== undefined && itinerary.reservationId !== reservationId)
  ) {
    throw new Error('La voce itinerario collegata non appartiene a questa prenotazione.')
  }
}

async function findOwnedItinerary(
  tripId: string,
  dayId: string,
  blockId: string,
  reservationId: string,
): Promise<Itinerary | undefined> {
  const dayEntries = await db.itineraries.where('dayId').equals(dayId).toArray()
  const candidates = dayEntries.filter((entry) => (
    !entry.deletedAt
    && entry.tripId === tripId
    && (
      entry.reservationId === reservationId
      || (entry.reservationId === undefined && entry.blockId === blockId)
    )
  ))

  if (candidates.length > 1) {
    throw new Error('Esistono più voci itinerario attive per la stessa prenotazione.')
  }

  const itinerary = candidates[0]
  if (itinerary) assertItineraryContext(itinerary, tripId, dayId, blockId, reservationId)
  return itinerary
}

function itineraryFromReservation(
  current: Itinerary | undefined,
  block: Block,
  reservation: Reservation,
  now: string,
): Itinerary {
  return {
    id: current?.id ?? crypto.randomUUID(),
    tripId: reservation.tripId,
    dayId: reservation.dayId,
    placeId: reservation.placeId,
    blockId: block.id,
    reservationId: reservation.id,
    type: itineraryTypeForReservation(reservation.type),
    startsAt: reservation.startsAt,
    endsAt: reservation.endsAt,
    timezone: reservation.timezone,
    title: reservation.title,
    notes: reservation.notes,
    status: itineraryStatusForReservation(reservation.status),
    bookingReference: reservation.confirmationCode,
    position: block.position,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
}

async function requireLinkedReservation(
  blockId: string,
  tripId: string,
  dayId: string,
  reservationId: string,
): Promise<{ block: Block; reservation: Reservation }> {
  await requireEditableTripDay(tripId, dayId)
  const block = await db.blocks.get(blockId)
  if (!block || block.deletedAt || block.tripId !== tripId || block.dayId !== dayId) {
    throw new Error('Il blocco prenotazione non appartiene a questa giornata.')
  }

  const expectedType = reservationTypeForBlockType(block.type)
  if (!expectedType || readReservationId(block) !== reservationId) {
    throw new Error('La prenotazione non è collegata a questo blocco.')
  }

  const reservation = await db.reservations.get(reservationId)
  if (!reservation || reservation.deletedAt) throw new Error('La prenotazione non esiste più.')
  assertReservationContext(reservation, tripId, dayId, expectedType)
  return { block, reservation }
}

export class ReservationBlockRepository {
  async saveReservationForBlock(
    blockId: string,
    tripId: string,
    dayId: string,
    reservation: Reservation,
  ): Promise<void> {
    await db.transaction('rw', db.trips, db.days, db.blocks, db.reservations, db.itineraries, async () => {
      await requireEditableTripDay(tripId, dayId)
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt) throw new Error('Il blocco prenotazione non esiste più.')
      if (block.tripId !== tripId || block.dayId !== dayId) {
        throw new Error('Il blocco non appartiene a questa giornata.')
      }

      const expectedType = reservationTypeForBlockType(block.type)
      if (!expectedType || reservation.type !== expectedType) {
        throw new Error('Il tipo della prenotazione non corrisponde al blocco.')
      }
      assertReservationContext(reservation, tripId, dayId, expectedType)

      const currentReservationId = readReservationId(block)
      const currentReservation = currentReservationId ? await db.reservations.get(currentReservationId) : undefined
      if (currentReservation && !currentReservation.deletedAt) {
        assertReservationContext(currentReservation, tripId, dayId, expectedType)
        if (currentReservation.id !== reservation.id) {
          throw new Error('Il blocco è già collegato a un’altra prenotazione attiva.')
        }
      }

      const target = await db.reservations.get(reservation.id)
      if (target?.deletedAt && !reservation.deletedAt) {
        throw new Error('La prenotazione è stata eliminata e non può essere riattivata implicitamente.')
      }
      if (target && target.id !== currentReservation?.id) {
        throw new Error('Esiste già un’altra prenotazione con questo identificatore.')
      }

      const currentItinerary = await findOwnedItinerary(tripId, dayId, blockId, reservation.id)
      const now = new Date().toISOString()
      const itinerary = itineraryFromReservation(currentItinerary, block, reservation, now)

      if (target) await db.reservations.put(reservation)
      else await db.reservations.add(reservation)
      await db.itineraries.put(itinerary)

      await db.blocks.put({
        ...block,
        content: {
          ...block.content,
          reservationId: reservation.id,
        },
        updatedAt: now,
      })
    })
  }

  async attachReservationFile(
    blockId: string,
    tripId: string,
    dayId: string,
    reservationId: string,
    input: {
      kind: Extract<Media['kind'], 'image' | 'document'>
      mimeType: string
      originalName: string
    },
    source: Blob,
  ): Promise<{ reservation: Reservation; media: Media }> {
    const mediaId = crypto.randomUUID()
    const opfsPath = await writeMediaFile(mediaId, source)
    const now = new Date().toISOString()
    const media: Media = {
      id: mediaId,
      tripId,
      dayId,
      blockId,
      kind: input.kind,
      mimeType: source.type || input.mimeType,
      originalName: input.originalName,
      sizeBytes: source.size,
      opfsPath,
      createdAt: now,
      updatedAt: now,
    }

    try {
      assertEntityBase(media, 'Reservation attachment media')
      return await db.transaction('rw', db.trips, db.days, db.blocks, db.reservations, db.media, async () => {
        const { reservation } = await requireLinkedReservation(blockId, tripId, dayId, reservationId)
        const previousMediaId = reservation.attachmentMediaId
        if (previousMediaId) {
          const previous = await db.media.get(previousMediaId)
          if (previous && !previous.deletedAt) {
            assertMediaContext(previous, tripId, dayId, blockId)
            await db.media.put({ ...previous, deletedAt: now, updatedAt: now })
          }
        }

        await db.media.add(media)
        const updated: Reservation = { ...reservation, attachmentMediaId: media.id, updatedAt: now }
        await db.reservations.put(updated)
        return { reservation: updated, media }
      })
    } catch (error) {
      try { await deleteMediaFile(mediaId) } catch { /* orphan scanner remains the fallback after interrupted cleanup */ }
      throw error
    }
  }

  async removeReservationAttachment(
    blockId: string,
    tripId: string,
    dayId: string,
    reservationId: string,
  ): Promise<Reservation> {
    return db.transaction('rw', db.trips, db.days, db.blocks, db.reservations, db.media, async () => {
      const { reservation } = await requireLinkedReservation(blockId, tripId, dayId, reservationId)
      if (!reservation.attachmentMediaId) return reservation

      const now = new Date().toISOString()
      const previous = await db.media.get(reservation.attachmentMediaId)
      if (previous && !previous.deletedAt) {
        assertMediaContext(previous, tripId, dayId, blockId)
        await db.media.put({ ...previous, deletedAt: now, updatedAt: now })
      }

      const updated: Reservation = { ...reservation, attachmentMediaId: undefined, updatedAt: now }
      await db.reservations.put(updated)
      return updated
    })
  }

  async softDeleteReservationBlock(blockId: string, tripId: string, dayId: string): Promise<void> {
    await db.transaction(
      'rw',
      [db.trips, db.days, db.blocks, db.reservations, db.itineraries, db.media],
      async () => {
        await requireEditableTripDay(tripId, dayId)
        const block = await db.blocks.get(blockId)
        if (!block || block.deletedAt) return
        if (block.tripId !== tripId || block.dayId !== dayId) {
          throw new Error('Il blocco prenotazione non appartiene a questa giornata.')
        }

        const expectedType = reservationTypeForBlockType(block.type)
        if (!expectedType) throw new Error('Il blocco non è una prenotazione supportata.')

        const now = new Date().toISOString()
        const reservationId = readReservationId(block)
        if (reservationId) {
          const reservation = await db.reservations.get(reservationId)
          if (reservation && !reservation.deletedAt) {
            assertReservationContext(reservation, tripId, dayId, expectedType)
            if (reservation.attachmentMediaId) {
              const media = await db.media.get(reservation.attachmentMediaId)
              if (media && !media.deletedAt) {
                assertMediaContext(media, tripId, dayId, blockId)
                await db.media.put({ ...media, deletedAt: now, updatedAt: now })
              }
            }
            await db.reservations.put({
              ...reservation,
              deletedAt: now,
              updatedAt: now,
            })
          }

          const itinerary = await findOwnedItinerary(tripId, dayId, blockId, reservationId)
          if (itinerary) {
            await db.itineraries.put({
              ...itinerary,
              deletedAt: now,
              updatedAt: now,
            })
          }
        }

        await db.blocks.put({
          ...block,
          deletedAt: now,
          updatedAt: now,
        })
      },
    )
  }
}

export const reservationBlockRepository = new ReservationBlockRepository()
