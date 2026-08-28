import type { Trip } from '../../domain/entities'

export interface TripRepositoryPort {
  listBookTrips(): Promise<Trip[]>
  listArchivedTrips(): Promise<Trip[]>
  get(id: string): Promise<Trip | undefined>
  put(value: Trip): Promise<unknown>
  updateEditable(value: Trip): Promise<Trip>
}

export interface TripApplicationDependencies {
  trips: TripRepositoryPort
  now(): string
  newId(): string
}
