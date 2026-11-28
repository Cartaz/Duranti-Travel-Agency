import type { Block, Day } from '../../domain/entities'

export interface DayRepositoryPort {
  listByTrip(tripId: string): Promise<Day[]>
  get(id: string): Promise<Day | undefined>
  createForTrip(value: Omit<Day, 'sequence'>, initialBlocks?: Block[]): Promise<Day>
  updateForTrip(value: Day): Promise<Day>
}

export interface DayDeletionPort {
  softDeleteDayWithContent(tripId: string, dayId: string): Promise<{ mediaIds: string[] }>
}

export interface DayMediaPurgePort {
  purge(id: string): Promise<unknown>
  purgeMany?(ids: string[]): Promise<Map<string, unknown>>
}

export interface DayApplicationDependencies {
  days: DayRepositoryPort
  deletion: DayDeletionPort
  media: DayMediaPurgePort
  now(): string
  newId(): string
}
