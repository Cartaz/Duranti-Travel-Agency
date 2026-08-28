import type { Itinerary } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export type ItineraryMoveDirection = 'up' | 'down'

function compareManualUntimed(left: Itinerary, right: Itinerary): number {
  return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
}

async function requireEditableDay(tripId: string, dayId: string): Promise<void> {
  const trip = await db.trips.get(tripId)
  if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare l’itinerario.')
  const day = await db.days.get(dayId)
  if (!day || day.deletedAt || day.tripId !== tripId) throw new Error('La giornata non appartiene a questo viaggio.')
}

export class ItineraryRepository extends Repository<Itinerary> {
  constructor() {
    super(db.itineraries)
  }

  async listByDay(dayId: string): Promise<Itinerary[]> {
    return (await db.itineraries.where('dayId').equals(dayId).toArray())
      .filter((item) => !item.deletedAt)
  }

  async listByTrip(tripId: string): Promise<Itinerary[]> {
    return (await db.itineraries.where('tripId').equals(tripId).toArray())
      .filter((item) => !item.deletedAt)
  }

  async saveManual(value: Itinerary): Promise<Itinerary> {
    return db.transaction('rw', db.trips, db.days, db.itineraries, async () => {
      if (!value.dayId) throw new Error('La tappa manuale deve appartenere a una giornata.')
      await requireEditableDay(value.tripId, value.dayId)
      if (value.reservationId || value.blockId) throw new Error('Una tappa manuale non può possedere riferimenti di prenotazione.')

      const existing = await db.itineraries.get(value.id)
      if (existing?.deletedAt) throw new Error('La tappa è stata eliminata e non può essere riattivata implicitamente.')
      if (existing && (existing.tripId !== value.tripId || existing.dayId !== value.dayId || existing.reservationId || existing.blockId)) {
        throw new Error('La tappa non appartiene a questa giornata.')
      }

      let position = existing?.position
      if (!existing) {
        const siblings = (await db.itineraries.where('dayId').equals(value.dayId).toArray())
          .filter((item) => !item.deletedAt && item.tripId === value.tripId)
        position = siblings.reduce((maximum, item) => Math.max(maximum, item.position ?? 0), 0) + 1
      }

      const persisted: Itinerary = {
        ...value,
        position,
        ...(existing ? { createdAt: existing.createdAt } : {}),
        deletedAt: undefined,
      }
      if (existing) await db.itineraries.put(persisted)
      else await db.itineraries.add(persisted)
      return persisted
    })
  }

  async softDeleteManual(tripId: string, dayId: string, itineraryId: string): Promise<'not-found' | 'deleted'> {
    return db.transaction('rw', db.trips, db.days, db.itineraries, async () => {
      await requireEditableDay(tripId, dayId)
      const itinerary = await db.itineraries.get(itineraryId)
      if (!itinerary || itinerary.deletedAt) return 'not-found'
      if (itinerary.tripId !== tripId || itinerary.dayId !== dayId) throw new Error('La tappa non appartiene a questa giornata.')
      if (itinerary.reservationId || itinerary.blockId) throw new Error('Le tappe derivate da prenotazioni si eliminano dal relativo blocco del planner.')
      const now = new Date().toISOString()
      await db.itineraries.put({ ...itinerary, deletedAt: now, updatedAt: now })
      return 'deleted'
    })
  }

  async moveManualUntimed(
    tripId: string,
    dayId: string,
    itineraryId: string,
    direction: ItineraryMoveDirection,
  ): Promise<boolean> {
    return db.transaction('rw', db.trips, db.days, db.itineraries, async () => {
      await requireEditableDay(tripId, dayId)
      const target = await db.itineraries.get(itineraryId)
      if (!target || target.deletedAt) return false
      if (target.tripId !== tripId || target.dayId !== dayId) throw new Error('La tappa non appartiene a questa giornata.')
      if (target.reservationId || target.blockId) throw new Error('Le tappe derivate da prenotazioni seguono l’ordine del planner.')
      if (target.startsAt) throw new Error('Le tappe con orario sono ordinate cronologicamente.')

      const items = (await db.itineraries.where('dayId').equals(dayId).toArray())
        .filter((item) => (
          !item.deletedAt
          && item.tripId === tripId
          && !item.reservationId
          && !item.blockId
          && !item.startsAt
        ))
        .sort(compareManualUntimed)

      const currentIndex = items.findIndex((item) => item.id === itineraryId)
      if (currentIndex < 0) return false
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (nextIndex < 0 || nextIndex >= items.length) return false

      const reordered = [...items]
      const [moved] = reordered.splice(currentIndex, 1)
      reordered.splice(nextIndex, 0, moved)

      const now = new Date().toISOString()
      const updates = reordered.flatMap((item, index) => {
        const position = index + 1
        return item.position === position ? [] : [{ ...item, position, updatedAt: now }]
      })
      if (updates.length > 0) await db.itineraries.bulkPut(updates)
      return true
    })
  }
}

export const itineraryRepository = new ItineraryRepository()
