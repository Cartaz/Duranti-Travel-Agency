import type { Block, Itinerary, Media, Reservation } from '../../domain/entities'
import { db } from '../db/dtagency-db'

function readReservationId(block: Block): string | undefined {
  const value = block.content.reservationId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il riferimento alla prenotazione non è valido.')
  return value
}

function expectedReservationType(block: Block): Reservation['type'] | undefined {
  if (block.type === 'transport') return 'transport'
  if (block.type === 'accommodation') return 'accommodation'
  if (block.type === 'restaurant') return 'restaurant'
  if (block.type === 'activity') return 'activity'
  return undefined
}

function itineraryTypeForReservation(type: Reservation['type']): Itinerary['type'] {
  switch (type) {
    case 'transport': return 'transport'
    case 'restaurant': return 'meal'
    case 'activity': return 'activity'
    case 'accommodation': return 'reservation'
    default: return 'reservation'
  }
}

function itineraryStatusForReservation(status: Reservation['status']): Itinerary['status'] {
  switch (status) {
    case 'booked': return 'booked'
    case 'completed': return 'done'
    case 'cancelled': return 'cancelled'
    case 'planned':
    default:
      return 'planned'
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

export class ReservationBlockRepository {
  async saveReservationForBlock(
    blockId: string,
    tripId: string,
    dayId: string,
    reservation: Reservation,
  ): Promise<void> {
    await db.transaction('rw', db.blocks, db.reservations, db.itineraries, async () => {
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt) throw new Error('Il blocco prenotazione non esiste più.')
      if (block.tripId !== tripId || block.dayId !== dayId) {
        throw new Error('Il blocco non appartiene a questa giornata.')
      }

      const expectedType = expectedReservationType(block)
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

  async setReservationAttachment(
    blockId: string,
    tripId: string,
    dayId: string,
    reservationId: string,
    mediaId?: string,
  ): Promise<Reservation> {
    return db.transaction('rw', db.blocks, db.reservations, db.media, async () => {
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt || block.tripId !== tripId || block.dayId !== dayId) {
        throw new Error('Il blocco prenotazione non appartiene a questa giornata.')
      }

      const expectedType = expectedReservationType(block)
      if (!expectedType || readReservationId(block) !== reservationId) {
        throw new Error('La prenotazione non è collegata a questo blocco.')
      }

      const reservation = await db.reservations.get(reservationId)
      if (!reservation || reservation.deletedAt) throw new Error('La prenotazione non esiste più.')
      assertReservationContext(reservation, tripId, dayId, expectedType)

      if (mediaId) {
        const media = await db.media.get(mediaId)
        if (!media || media.deletedAt) throw new Error('Il nuovo allegato non esiste più.')
        assertMediaContext(media, tripId, dayId, blockId)
      }

      const now = new Date().toISOString()
      const previousMediaId = reservation.attachmentMediaId
      if (previousMediaId && previousMediaId !== mediaId) {
        const previous = await db.media.get(previousMediaId)
        if (previous && !previous.deletedAt) {
          assertMediaContext(previous, tripId, dayId, blockId)
          await db.media.put({ ...previous, deletedAt: now, updatedAt: now })
        }
      }

      const updated: Reservation = {
        ...reservation,
        attachmentMediaId: mediaId,
        updatedAt: now,
      }
      await db.reservations.put(updated)
      return updated
    })
  }

  async softDeleteReservationBlock(blockId: string, tripId: string, dayId: string): Promise<void> {
    await db.transaction('rw', db.blocks, db.reservations, db.itineraries, db.media, async () => {
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt) return
      if (block.tripId !== tripId || block.dayId !== dayId) {
        throw new Error('Il blocco prenotazione non appartiene a questa giornata.')
      }

      const expectedType = expectedReservationType(block)
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
    })
  }
}

export const reservationBlockRepository = new ReservationBlockRepository()
