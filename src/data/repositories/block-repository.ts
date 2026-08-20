import type { Block } from '../../domain/entities'
import { db } from '../db/duranti-db'
import { Repository } from './base-repository'

export type BlockMoveDirection = 'up' | 'down'
export type BlockMoveResult = 'moved' | 'boundary' | 'not-found' | 'invalid-context'

export class BlockRepository extends Repository<Block> {
  constructor() {
    super(db.blocks)
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
