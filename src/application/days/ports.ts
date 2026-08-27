import type { Day, Trip } from '../../domain/entities'

export interface DayRepositoryPort {
  listByTrip(tripId: string): Promise<Day[]>
  get(id: string): Promise<Day | undefined>
  put(value: Day): Promise<unknown>
  appendToTrip(value: Omit<Day, 'sequence'>): Promise<Day>
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
