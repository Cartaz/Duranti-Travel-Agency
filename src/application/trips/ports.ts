import type { Day, Trip } from '../../domain/entities'

export interface TripRepositoryPort {
  list(): Promise<Trip[]>
  get(id: string): Promise<Trip | undefined>
  put(value: Trip): Promise<unknown>
}

export interface DayRepositoryPort {
  list(): Promise<Day[]>
}

export interface TripApplicationDependencies {
  trips: TripRepositoryPort
  days: DayRepositoryPort
  now(): string
  newId(): string
}
