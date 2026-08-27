import type { Block, Day, Trip } from '../../src/domain/entities'
import { db } from '../../src/data/db/dtagency-db'
import { dayTemplateTransactionRepository } from '../../src/data/repositories/day-template-transaction-repository'

export interface DayTemplateTransactionContractResult {
  name: string
  ok: boolean
  error?: string
}

export async function runDayTemplateTransactionContract(): Promise<DayTemplateTransactionContractResult> {
  const name = 'Template day transaction rolls back day and blocks together'
  const timestamp = '2026-08-27T08:00:00.000Z'
  const trip: Trip = { id: 'contract-template-trip', title: 'Atomic template trip', status: 'planned', createdAt: timestamp, updatedAt: timestamp }
  const day: Day = { id: 'contract-template-day', tripId: trip.id, sequence: 1, date: '2026-09-01', templateId: 'builtin-day-city-v1', createdAt: timestamp, updatedAt: timestamp }
  const duplicateBlockId = 'contract-template-block'
  const blocks: Block[] = [
    { id: duplicateBlockId, tripId: trip.id, dayId: day.id, type: 'heading', position: 1, content: { text: 'One' }, createdAt: timestamp, updatedAt: timestamp },
    { id: duplicateBlockId, tripId: trip.id, dayId: day.id, type: 'text', position: 2, content: { text: 'Two' }, createdAt: timestamp, updatedAt: timestamp },
  ]

  try {
    await db.transaction('rw', db.trips, db.days, db.blocks, async () => {
      await db.blocks.where('dayId').equals(day.id).delete()
      await db.days.delete(day.id)
      await db.trips.put(trip)
    })

    let rejected = false
    try { await dayTemplateTransactionRepository.createDayWithBlocks(day, blocks) } catch { rejected = true }
    if (!rejected) throw new Error('Expected the duplicate block batch to be rejected.')

    const [persistedDay, persistedBlocks] = await Promise.all([
      db.days.get(day.id),
      db.blocks.where('dayId').equals(day.id).toArray(),
    ])
    if (persistedDay) throw new Error('The day survived the rolled-back transaction.')
    if (persistedBlocks.length > 0) throw new Error('Blocks survived the rolled-back transaction.')

    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  } finally {
    await db.transaction('rw', db.trips, db.days, db.blocks, async () => {
      await db.blocks.where('dayId').equals(day.id).delete()
      await db.days.delete(day.id)
      await db.trips.delete(trip.id)
    })
  }
}
