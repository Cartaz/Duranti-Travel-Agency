import type { Day } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export class DayRepository extends Repository<Day> {
  constructor() {
    super(db.days)
  }

  async listByTrip(tripId: string): Promise<Day[]> {
    return (await db.days.where('tripId').equals(tripId).toArray())
      .filter((day) => !day.deletedAt)
  }

  async appendToTrip(value: Omit<Day, 'sequence'>): Promise<Day> {
    return db.transaction('rw', db.trips, db.days, async () => {
      const trip = await db.trips.get(value.tripId)
      if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare le sue giornate.')
      if (await db.days.get(value.id)) throw new Error('Esiste già una giornata con questo identificatore.')

      const siblings = (await db.days.where('tripId').equals(value.tripId).toArray())
        .filter((day) => !day.deletedAt)
      const sequence = siblings.reduce((maximum, day) => Math.max(maximum, day.sequence), 0) + 1
      const day: Day = { ...value, sequence }
      await db.days.add(day)
      return day
    })
  }
}

export const dayRepository = new DayRepository()
