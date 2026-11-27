import type { Trip } from '../../domain/entities'

export interface TripRepositoryPort {
  listBookTrips(): Promise<Trip[]>
  listArchivedTrips(): Promise<Trip[]>
  get(id: string): Promise<Trip | undefined>
  put(value: Trip): Promise<unknown>
  updateEditable(value: Trip): Promise<Trip>
}

export interface TripDeletionPort {
  softDeleteArchivedTripWithContent(tripId: string): Promise<{ mediaIds: string[] }>
}

export interface TripMediaPurgePort {
  purge(id: string): Promise<unknown>
}

export interface TripApplicationDependencies {
  trips: TripRepositoryPort
  deletion: TripDeletionPort
  media: TripMediaPurgePort
  now(): string
  newId(): string
}
