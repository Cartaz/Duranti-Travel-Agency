import type { Block, Day, Trip } from '../../domain/entities'

export type BlockMoveDirection = 'up' | 'down'
export type BlockMoveResult = 'moved' | 'boundary' | 'not-found' | 'invalid-context'

export interface PlannerBlockRepositoryPort {
  listByDay(dayId: string): Promise<Block[]>
  get(id: string): Promise<Block | undefined>
  createAtEnd(value: Omit<Block, 'position'>): Promise<Block>
  putInEditableDay(value: Block): Promise<void>
  softDeleteWithinDay(blockId: string, tripId: string, dayId: string): Promise<'not-found' | 'tombstoned'>
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
