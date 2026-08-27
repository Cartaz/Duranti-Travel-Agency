import type { Block, Itinerary } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export type BlockMoveDirection = 'up' | 'down'
export type BlockMoveResult = 'moved' | 'boundary' | 'not-found' | 'invalid-context'

function compareBlocksForRepair(left: Block, right: Block): number {
  return left.position - right.position
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
}

export class BlockRepository extends Repository<Block> {
  constructor() {
    super(db.blocks)
  }

  async listByDay(dayId: string): Promise<Block[]> {
    return (await db.blocks.where('dayId').equals(dayId).toArray())
      .filter((block) => !block.deletedAt)
  }

  async listByTrip(tripId: string): Promise<Block[]> {
    return (await db.blocks.where('tripId').equals(tripId).toArray())
      .filter((block) => !block.deletedAt)
  }

  async appendToDay(value: Omit<Block, 'position'>): Promise<Block> {
    return db.transaction('rw', db.trips, db.days, db.blocks, db.itineraries, async () => {
      const trip = await db.trips.get(value.tripId)
      if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare il planner.')
      if (!value.dayId) throw new Error('Il nuovo blocco deve appartenere a una giornata.')

      const day = await db.days.get(value.dayId)
      if (!day || day.deletedAt || day.tripId !== value.tripId) {
        throw new Error('La giornata non appartiene a questo viaggio.')
      }
      if (await db.blocks.get(value.id)) throw new Error('Esiste già un blocco con questo identificatore.')

      const siblings = (await db.blocks.where('dayId').equals(value.dayId).toArray())
        .filter((block) => !block.deletedAt && block.tripId === value.tripId)
        .sort(compareBlocksForRepair)
      const hasDuplicatePosition = siblings.some((block, index) => index > 0 && block.position === siblings[index - 1].position)

      if (hasDuplicatePosition) {
        const repairedAt = new Date().toISOString()
        const repairs = siblings
          .map((block, index) => block.position === index + 1 ? undefined : { ...block, position: index + 1, updatedAt: repairedAt })
          .filter((block): block is Block => block !== undefined)

        if (repairs.length > 0) {
          await db.blocks.bulkPut(repairs)
          const repairedPositionByBlockId = new Map(repairs.map((block) => [block.id, block.position]))
          const linkedItineraries = (await db.itineraries.where('dayId').equals(value.dayId).toArray())
            .filter((item) => !item.deletedAt && item.tripId === value.tripId && item.blockId && repairedPositionByBlockId.has(item.blockId))
          const itineraryRepairs: Itinerary[] = linkedItineraries.map((item) => ({
            ...item,
            position: repairedPositionByBlockId.get(item.blockId as string),
            updatedAt: repairedAt,
          }))
          if (itineraryRepairs.length > 0) await db.itineraries.bulkPut(itineraryRepairs)
        }
      }

      const position = hasDuplicatePosition
        ? siblings.length + 1
        : siblings.reduce((maximum, block) => Math.max(maximum, block.position), 0) + 1
      const block: Block = { ...value, position }
      await db.blocks.add(block)
      return block
    })
  }

  async moveWithinDay(
    blockId: string,
    tripId: string,
    dayId: string,
    direction: BlockMoveDirection,
  ): Promise<BlockMoveResult> {
    return db.transaction('rw', db.blocks, async () => {
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt) return 'not-found'
      if (block.tripId !== tripId || block.dayId !== dayId) return 'invalid-context'

      const siblings = (await db.blocks.where('dayId').equals(dayId).toArray())
        .filter((candidate) => !candidate.deletedAt && candidate.tripId === tripId)
        .sort((left, right) => (
          left.position - right.position ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id)
        ))

      const currentIndex = siblings.findIndex((candidate) => candidate.id === blockId)
      if (currentIndex < 0) return 'not-found'

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= siblings.length) return 'boundary'

      const [moving] = siblings.splice(currentIndex, 1)
      siblings.splice(targetIndex, 0, moving)

      const now = new Date().toISOString()
      const updates = siblings
        .map((candidate, index) => {
          const position = index + 1
          if (candidate.position === position) return undefined
          return {
            ...candidate,
            position,
            updatedAt: now,
          }
        })
        .filter((candidate): candidate is Block => candidate !== undefined)

      if (updates.length > 0) {
        await db.blocks.bulkPut(updates)
      }

      return 'moved'
    })
  }
}

export const plannerBlockRepository = new BlockRepository()
