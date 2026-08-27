import type { Block, Day } from '../../domain/entities'
import { db } from '../db/dtagency-db'

export class DayTemplateTransactionRepository {
  async createDayWithBlocks(dayWithoutSequence: Omit<Day, 'sequence'>, blocks: Block[]): Promise<Day> {
    return db.transaction('rw', db.trips, db.days, db.blocks, async () => {
      const trip = await db.trips.get(dayWithoutSequence.tripId)
      if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di creare una giornata dal template.')

      if (await db.days.get(dayWithoutSequence.id)) throw new Error('Esiste già una giornata con questo identificatore.')
      if (blocks.some((block) => block.tripId !== dayWithoutSequence.tripId || block.dayId !== dayWithoutSequence.id)) {
        throw new Error('Il template contiene blocchi fuori dal contesto della giornata.')
      }

      const siblings = (await db.days.where('tripId').equals(dayWithoutSequence.tripId).toArray())
        .filter((day) => !day.deletedAt)
      const sequence = siblings.reduce((maximum, day) => Math.max(maximum, day.sequence), 0) + 1
      const day: Day = { ...dayWithoutSequence, sequence }

      await db.days.add(day)
      if (blocks.length > 0) await db.blocks.bulkAdd(blocks)
      return day
    })
  }
}

export const dayTemplateTransactionRepository = new DayTemplateTransactionRepository()
