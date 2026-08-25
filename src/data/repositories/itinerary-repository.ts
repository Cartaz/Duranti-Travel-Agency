import type { Itinerary } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export type ItineraryMoveDirection = 'up' | 'down'

function compareManualUntimed(left: Itinerary, right: Itinerary): number {
  return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
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

  async moveManualUntimed(
    tripId: string,
    dayId: string,
    itineraryId: string,
    direction: ItineraryMoveDirection,
  ): Promise<boolean> {
    return db.transaction('rw', db.itineraries, async () => {
      const target = await db.itineraries.get(itineraryId)
      if (!target || target.deletedAt) return false
      if (target.tripId !== tripId || target.dayId !== dayId) {
        throw new Error('La tappa non appartiene a questa giornata.')
      }
      if (target.reservationId || target.blockId) {
        throw new Error('Le tappe derivate da prenotazioni seguono l’ordine del planner.')
      }
      if (target.startsAt) {
        throw new Error('Le tappe con orario sono ordinate cronologicamente.')
      }

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
      for (let index = 0; index < reordered.length; index += 1) {
        const item = reordered[index]
        const position = index + 1
        if (item.position === position) continue
        await db.itineraries.put({
          ...item,
          position,
          updatedAt: now,
        })
      }

      return true
    })
  }
}

export const itineraryRepository = new ItineraryRepository()
