import type { Block, Day } from '../../domain/entities'

export interface DayRepositoryPort {
  listByTrip(tripId: string): Promise<Day[]>
  get(id: string): Promise<Day | undefined>
  createForTrip(value: Omit<Day, 'sequence'>, initialBlocks?: Block[]): Promise<Day>
  updateForTrip(value: Day): Promise<Day>
}

export interface DayApplicationDependencies {
  days: DayRepositoryPort
  now(): string
  newId(): string
}
