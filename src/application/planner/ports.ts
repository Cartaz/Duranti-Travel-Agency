import type { Block, Day, Trip } from '../../domain/entities'

export type BlockMoveDirection = 'up' | 'down'
export type BlockMoveResult = 'moved' | 'boundary' | 'not-found' | 'invalid-context'
export type SoftDeleteResult = 'not-found' | 'already-deleted' | 'tombstoned'

export interface PlannerBlockRepositoryPort {
  list(): Promise<Block[]>
  get(id: string): Promise<Block | undefined>
  put(value: Block): Promise<void>
  softDelete(id: string): Promise<SoftDeleteResult>
  moveWithinDay(blockId: string, tripId: string, dayId: string, direction: BlockMoveDirection): Promise<BlockMoveResult>
}

export interface PlannerTripReaderPort {
  getTrip(tripId: string): Promise<Trip | undefined>
}

export interface PlannerDayReaderPort {
  getTripDay(tripId: string, dayId: string): Promise<Day | undefined>
}

export interface PlannerApplicationDependencies {
  blocks: PlannerBlockRepositoryPort
  trips: PlannerTripReaderPort
  days: PlannerDayReaderPort
  now(): string
  newId(): string
}
