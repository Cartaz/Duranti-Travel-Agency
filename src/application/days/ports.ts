import type { Day, Trip } from '../../domain/entities'

export interface DayRepositoryPort {
  list(): Promise<Day[]>
  get(id: string): Promise<Day | undefined>
  put(value: Day): Promise<void>
}

export interface TripReaderPort {
  getTrip(tripId: string): Promise<Trip | undefined>
}

export interface DayApplicationDependencies {
  days: DayRepositoryPort
  trips: TripReaderPort
  now(): string
  newId(): string
}
