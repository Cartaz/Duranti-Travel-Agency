import type { Block, Reservation } from '../../domain/entities'
import { db } from '../db/duranti-db'

function readReservationId(block: Block): string | undefined {
  const value = block.content.reservationId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il riferimento alla prenotazione non è valido.')
  return value
}

function expectedReservationType(block: Block): Reservation['type'] | undefined {
  if (block.type === 'transport') return 'transport'
  if (block.type === 'accommodation') return 'accommodation'
  return undefined
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

export class ReservationBlockRepository {
  async saveReservationForBlock(
    blockId: string,
    tripId: string,
    dayId: string,
    reservation: Reservation,
  ): Promise<void> {
    await db.transaction('rw', db.blocks, db.reservations, async () => {
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

      if (target) await db.reservations.put(reservation)
      else await db.reservations.add(reservation)

      await db.blocks.put({
        ...block,
        content: {
          ...block.content,
          reservationId: reservation.id,
        },
        updatedAt: new Date().toISOString(),
      })
    })
  }

  async softDeleteReservationBlock(blockId: string, tripId: string, dayId: string): Promise<void> {
    await db.transaction('rw', db.blocks, db.reservations, async () => {
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
          await db.reservations.put({
            ...reservation,
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
