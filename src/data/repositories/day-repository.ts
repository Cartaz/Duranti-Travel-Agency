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
}

export const dayRepository = new DayRepository()
