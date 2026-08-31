import type { Block } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export type BlockMoveDirection = 'up' | 'down'
export type BlockMoveResult = 'moved' | 'boundary' | 'not-found' | 'invalid-context'
export type NewPlannerBlock = Omit<Block, 'position'>

function compareDayBlocks(left: Block, right: Block): number {
  return left.position - right.position
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
}

async function normalizeDayBlockPositions(blocks: Block[]): Promise<Block[]> {
  const ordered = [...blocks].sort(compareDayBlocks)
  if (ordered.every((block, index) => block.position === index + 1)) return ordered

  const updatedAt = new Date().toISOString()
  const normalized = ordered.map((block, index) => ({ ...block, position: index + 1, updatedAt }))
  await db.blocks.bulkPut(normalized)
  return normalized
}

async function requireEditableDay(tripId: string, dayId: string): Promise<void> {
  const trip = await db.trips.get(tripId)
  if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare il planner.')
  const day = await db.days.get(dayId)
  if (!day || day.deletedAt || day.tripId !== tripId) throw new Error('La giornata non appartiene a questo viaggio.')
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

  async createAtEnd(block: NewPlannerBlock): Promise<Block> {
    return db.transaction('rw', db.trips, db.days, db.blocks, async () => {
      if (!block.dayId) throw new Error('Il blocco deve appartenere a una giornata.')
      await requireEditableDay(block.tripId, block.dayId)
      if (await db.blocks.get(block.id)) throw new Error('Esiste già un blocco con questo identificatore.')

      const siblings = await normalizeDayBlockPositions(
        (await db.blocks.where('dayId').equals(block.dayId).toArray())
          .filter((candidate) => !candidate.deletedAt && candidate.tripId === block.tripId),
      )
      const entity: Block = { ...block, position: siblings.length + 1 }
      await db.blocks.add(entity)
      return entity
    })
  }

  async putInEditableDay(block: Block): Promise<void> {
    await db.transaction('rw', db.trips, db.days, db.blocks, async () => {
      if (!block.dayId) throw new Error('Il blocco deve appartenere a una giornata.')
      await requireEditableDay(block.tripId, block.dayId)
      const existing = await db.blocks.get(block.id)
      if (!existing || existing.deletedAt || existing.tripId !== block.tripId || existing.dayId !== block.dayId) {
        throw new Error('Il blocco non appartiene a questa giornata.')
      }
      await db.blocks.put({
        ...block,
        position: existing.position,
        createdAt: existing.createdAt,
        deletedAt: undefined,
      })
    })
  }

  async softDeleteWithinDay(blockId: string, tripId: string, dayId: string): Promise<'not-found' | 'tombstoned'> {
    return db.transaction('rw', db.trips, db.days, db.blocks, async () => {
      await requireEditableDay(tripId, dayId)
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt) return 'not-found'
      if (block.tripId !== tripId || block.dayId !== dayId) throw new Error('Il blocco non appartiene a questa giornata.')
      const now = new Date().toISOString()
      await db.blocks.put({ ...block, deletedAt: now, updatedAt: now })
      return 'tombstoned'
    })
  }

  async moveWithinDay(
    blockId: string,
    tripId: string,
    dayId: string,
    direction: BlockMoveDirection,
  ): Promise<BlockMoveResult> {
    return db.transaction('rw', db.trips, db.days, db.blocks, async () => {
      await requireEditableDay(tripId, dayId)
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt) return 'not-found'
      if (block.tripId !== tripId || block.dayId !== dayId) return 'invalid-context'

      const siblings = await normalizeDayBlockPositions(
        (await db.blocks.where('dayId').equals(dayId).toArray())
          .filter((candidate) => !candidate.deletedAt && candidate.tripId === tripId),
      )

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
          return { ...candidate, position, updatedAt: now }
        })
        .filter((candidate): candidate is Block => candidate !== undefined)

      if (updates.length > 0) await db.blocks.bulkPut(updates)
      return 'moved'
    })
  }
}

export const plannerBlockRepository = new BlockRepository()
