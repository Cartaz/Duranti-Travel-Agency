import type { Block, Day } from '../../domain/entities'
import { assertDayDateWithinTripRange } from '../../domain/trip-calendar'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export type NewTripDay = Omit<Day, 'sequence'>

function compareTripDays(left: Day, right: Day): number {
  return left.sequence - right.sequence
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
}

async function normalizeTripDaySequences(days: Day[]): Promise<Day[]> {
  const ordered = [...days].sort(compareTripDays)
  if (ordered.every((day, index) => day.sequence === index + 1)) return ordered

  const updatedAt = new Date().toISOString()
  const normalized = ordered.map((day, index) => ({ ...day, sequence: index + 1, updatedAt }))
  await db.days.bulkPut(normalized)
  return normalized
}

async function requireEditableTripDayContext(tripId: string, dayId?: string) {
  const trip = await db.trips.get(tripId)
  if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificarne le giornate.')

  if (!dayId) return { trip }
  const day = await db.days.get(dayId)
  if (!day || day.deletedAt || day.tripId !== tripId) throw new Error('La giornata non esiste in questo viaggio.')
  return { trip, day }
}

export class DayRepository extends Repository<Day> {
  constructor() {
    super(db.days)
  }

  async listByTrip(tripId: string): Promise<Day[]> {
    return (await db.days.where('tripId').equals(tripId).toArray())
      .filter((day) => !day.deletedAt)
  }

  async createForTrip(day: NewTripDay, initialBlocks: Block[] = []): Promise<Day> {
    return db.transaction('rw', db.trips, db.days, db.blocks, async () => {
      const { trip } = await requireEditableTripDayContext(day.tripId)
      assertDayDateWithinTripRange(trip, day.date)

      if (await db.days.get(day.id)) throw new Error('Esiste già una giornata con questo identificatore.')
      const siblings = await normalizeTripDaySequences(
        (await db.days.where('tripId').equals(day.tripId).toArray())
          .filter((candidate) => !candidate.deletedAt),
      )
      const entity: Day = { ...day, sequence: siblings.length + 1 }

      const blocks = initialBlocks.map((block, index) => {
        if (block.tripId !== day.tripId || block.dayId !== day.id || block.deletedAt) {
          throw new Error('Il template contiene un blocco con contesto non valido.')
        }
        return { ...block, position: index + 1 }
      })

      await db.days.add(entity)
      if (blocks.length > 0) await db.blocks.bulkAdd(blocks)
      return entity
    })
  }

  async updateForTrip(day: Day): Promise<Day> {
    return db.transaction('rw', db.trips, db.days, async () => {
      const { trip, day: existing } = await requireEditableTripDayContext(day.tripId, day.id)
      if (!existing) throw new Error('La giornata non esiste in questo viaggio.')
      assertDayDateWithinTripRange(trip, day.date)

      const updated: Day = {
        ...day,
        tripId: existing.tripId,
        sequence: existing.sequence,
        createdAt: existing.createdAt,
        deletedAt: undefined,
      }
      await db.days.put(updated)
      return updated
    })
  }
}

export const dayRepository = new DayRepository()
