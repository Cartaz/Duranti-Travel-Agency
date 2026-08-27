import { db } from '../../src/data/db/dtagency-db'
import { dayRepository } from '../../src/data/repositories/day-repository'
import { plannerBlockRepository } from '../../src/data/repositories/block-repository'
import { itineraryRepository } from '../../src/data/repositories/itinerary-repository'
import type { Block, Day, Itinerary, Trip } from '../../src/domain/entities'

export interface OrderingConcurrencyContractResult {
  name: string
  ok: boolean
  error?: string
}

const timestamp = '2026-08-27T12:00:00.000Z'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function resultError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

export async function runOrderingConcurrencyContract(): Promise<OrderingConcurrencyContractResult> {
  const name = 'Transactional ordering repairs duplicates and serializes overlapping appends'
  try {
    await db.transaction('rw', db.trips, db.days, db.blocks, db.itineraries, async () => {
      await Promise.all([db.itineraries.clear(), db.blocks.clear(), db.days.clear(), db.trips.clear()])
    })

    const trip: Trip = {
      id: 'ordering-trip',
      title: 'Ordering contract',
      status: 'planned',
      startDate: '2026-09-01',
      endDate: '2026-09-10',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const duplicateDays: Day[] = [
      { id: 'ordering-day-a', tripId: trip.id, sequence: 1, date: '2026-09-01', createdAt: timestamp, updatedAt: timestamp },
      { id: 'ordering-day-b', tripId: trip.id, sequence: 1, date: '2026-09-02', createdAt: timestamp, updatedAt: timestamp },
    ]
    await db.trips.add(trip)
    await db.days.bulkAdd(duplicateDays)

    await Promise.all([
      dayRepository.appendToTrip({ id: 'ordering-day-c', tripId: trip.id, date: '2026-09-03', createdAt: timestamp, updatedAt: timestamp }),
      dayRepository.appendToTrip({ id: 'ordering-day-d', tripId: trip.id, date: '2026-09-04', createdAt: timestamp, updatedAt: timestamp }),
    ])
    const repairedDays = (await dayRepository.listByTrip(trip.id)).sort((a, b) => a.sequence - b.sequence)
    assert(JSON.stringify(repairedDays.map((day) => day.sequence)) === JSON.stringify([1, 2, 3, 4]), 'Day sequences were not repaired and allocated uniquely.')

    const dayId = 'ordering-day-a'
    const duplicateBlocks: Block[] = [
      { id: 'ordering-block-a', tripId: trip.id, dayId, type: 'text', position: 1, content: { text: 'A' }, createdAt: timestamp, updatedAt: timestamp },
      { id: 'ordering-block-b', tripId: trip.id, dayId, type: 'restaurant', position: 1, content: {}, createdAt: timestamp, updatedAt: timestamp },
    ]
    const linkedItinerary: Itinerary = {
      id: 'ordering-linked-itinerary', tripId: trip.id, dayId, blockId: 'ordering-block-b', reservationId: 'ordering-reservation',
      title: 'Linked', type: 'reservation', status: 'planned', position: 1, createdAt: timestamp, updatedAt: timestamp,
    }
    await db.blocks.bulkAdd(duplicateBlocks)
    await db.itineraries.add(linkedItinerary)

    await Promise.all([
      plannerBlockRepository.appendToDay({ id: 'ordering-block-c', tripId: trip.id, dayId, type: 'text', content: {}, createdAt: timestamp, updatedAt: timestamp }),
      plannerBlockRepository.appendToDay({ id: 'ordering-block-d', tripId: trip.id, dayId, type: 'divider', content: {}, createdAt: timestamp, updatedAt: timestamp }),
    ])
    const repairedBlocks = (await plannerBlockRepository.listByDay(dayId)).sort((a, b) => a.position - b.position)
    assert(JSON.stringify(repairedBlocks.map((block) => block.position)) === JSON.stringify([1, 2, 3, 4]), 'Block positions were not repaired and allocated uniquely.')
    const repairedLinked = await db.itineraries.get(linkedItinerary.id)
    assert(repairedLinked?.position === 2, 'Linked itinerary position did not follow repaired block position.')

    const duplicateManualItems: Itinerary[] = [
      { id: 'ordering-manual-a', tripId: trip.id, dayId, title: 'Manual A', type: 'custom', status: 'planned', position: 5, createdAt: timestamp, updatedAt: timestamp },
      { id: 'ordering-manual-b', tripId: trip.id, dayId, title: 'Manual B', type: 'custom', status: 'planned', position: 5, createdAt: timestamp, updatedAt: timestamp },
    ]
    await db.itineraries.bulkAdd(duplicateManualItems)

    await Promise.all([
      itineraryRepository.appendManualToDay({ id: 'ordering-manual-c', tripId: trip.id, dayId, title: 'Manual C', type: 'custom', status: 'planned', createdAt: timestamp, updatedAt: timestamp }),
      itineraryRepository.appendManualToDay({ id: 'ordering-manual-d', tripId: trip.id, dayId, title: 'Manual D', type: 'custom', status: 'planned', createdAt: timestamp, updatedAt: timestamp }),
    ])
    const manualItems = (await itineraryRepository.listByDay(dayId))
      .filter((item) => !item.reservationId && !item.blockId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const manualPositions = manualItems.map((item) => item.position)
    assert(new Set(manualPositions).size === manualPositions.length, 'Manual itinerary positions are not unique after concurrent append.')
    assert(JSON.stringify(manualPositions) === JSON.stringify([3, 4, 5, 6]), `Unexpected repaired manual positions: ${JSON.stringify(manualPositions)}.`)

    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, error: resultError(error) }
  } finally {
    try {
      await db.transaction('rw', db.trips, db.days, db.blocks, db.itineraries, async () => {
        await Promise.all([db.itineraries.clear(), db.blocks.clear(), db.days.clear(), db.trips.clear()])
      })
    } catch {
      // The contract result already captures the primary failure.
    }
  }
}
