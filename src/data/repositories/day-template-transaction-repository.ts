import type { Block, Day } from '../../domain/entities'
import { db } from '../db/dtagency-db'

export class DayTemplateTransactionRepository {
  async createDayWithBlocks(day: Day, blocks: Block[]): Promise<void> {
    await db.transaction('rw', db.trips, db.days, db.blocks, async () => {
      const trip = await db.trips.get(day.tripId)
      if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di creare una giornata dal template.')

      if (await db.days.get(day.id)) throw new Error('Esiste già una giornata con questo identificatore.')
      if (blocks.some((block) => block.tripId !== day.tripId || block.dayId !== day.id)) {
        throw new Error('Il template contiene blocchi fuori dal contesto della giornata.')
      }

      await db.days.add(day)
      if (blocks.length > 0) await db.blocks.bulkAdd(blocks)
    })
  }
}

export const dayTemplateTransactionRepository = new DayTemplateTransactionRepository()
