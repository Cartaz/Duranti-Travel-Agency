import type { Itinerary } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export type ItineraryMoveDirection = 'up' | 'down'

function compareManualUntimed(left: Itinerary, right: Itinerary): number {
  return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
}

function compareManualForRepair(left: Itinerary, right: Itinerary): number {
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

  async appendManualToDay(value: Omit<Itinerary, 'position'>): Promise<Itinerary> {
    return db.transaction('rw', db.trips, db.days, db.itineraries, async () => {
      const trip = await db.trips.get(value.tripId)
      if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare l’itinerario.')
      if (!value.dayId) throw new Error('La tappa deve appartenere a una giornata.')

      const day = await db.days.get(value.dayId)
      if (!day || day.deletedAt || day.tripId !== value.tripId) {
        throw new Error('La giornata non appartiene a questo viaggio.')
      }
      if (value.reservationId || value.blockId) {
        throw new Error('Le tappe derivate da prenotazioni non possono essere create dal percorso manuale.')
      }
      if (await db.itineraries.get(value.id)) throw new Error('Esiste già una tappa con questo identificatore.')

      const dayItems = (await db.itineraries.where('dayId').equals(value.dayId).toArray())
        .filter((item) => !item.deletedAt && item.tripId === value.tripId)
      const manualSiblings = dayItems
        .filter((item) => !item.reservationId && !item.blockId)
        .sort(compareManualForRepair)
      const hasDuplicateManualPosition = manualSiblings.some((item, index) => (
        index > 0
        && item.position !== undefined
        && item.position === manualSiblings[index - 1].position
      ))

      if (hasDuplicateManualPosition) {
        const repairedAt = new Date().toISOString()
        const fixedPositions = dayItems
          .filter((item) => item.reservationId || item.blockId)
          .map((item) => item.position ?? 0)
        const basePosition = fixedPositions.reduce((maximum, position) => Math.max(maximum, position), 0)
        const repairs = manualSiblings
          .map((item, index) => {
            const position = basePosition + index + 1
            return item.position === position ? undefined : { ...item, position, updatedAt: repairedAt }
          })
          .filter((item): item is Itinerary => item !== undefined)
        if (repairs.length > 0) await db.itineraries.bulkPut(repairs)
      }

      const position = hasDuplicateManualPosition
        ? dayItems
          .filter((item) => item.reservationId || item.blockId)
          .reduce((maximum, item) => Math.max(maximum, item.position ?? 0), 0) + manualSiblings.length + 1
        : dayItems.reduce((maximum, item) => Math.max(maximum, item.position ?? 0), 0) + 1
      const itinerary: Itinerary = { ...value, position }
      await db.itineraries.add(itinerary)
      return itinerary
    })
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
