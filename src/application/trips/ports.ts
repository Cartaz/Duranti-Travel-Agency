import type { Day, Trip } from '../../domain/entities'

export interface TripRepositoryPort {
  listBookTrips(): Promise<Trip[]>
  listArchivedTrips(): Promise<Trip[]>
  get(id: string): Promise<Trip | undefined>
  put(value: Trip): Promise<unknown>
}

export interface DayRepositoryPort {
  listByTrip(tripId: string): Promise<Day[]>
}

export interface TripApplicationDependencies {
  trips: TripRepositoryPort
  days: DayRepositoryPort
  now(): string
  newId(): string
}
