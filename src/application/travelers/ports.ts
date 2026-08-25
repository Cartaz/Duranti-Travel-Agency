import type { Traveler, Trip, TripTraveler } from '../../domain/entities'

export type TravelerRole = 'owner' | 'companion' | 'child' | 'other'

export interface TravelerRepositoryPort {
  list(): Promise<Traveler[]>
  get(id: string): Promise<Traveler | undefined>
  getMany(ids: string[]): Promise<Traveler[]>
  put(value: Traveler): Promise<unknown>
}

export interface TravelerTripPort { get(id: string): Promise<Trip | undefined> }

export interface TripTravelerPort {
  listActiveForTrip(tripId: string): Promise<TripTraveler[]>
  setMembership(tripId: string, travelerId: string, role: TravelerRole): Promise<TripTraveler>
  detachMembership(tripId: string, travelerId: string): Promise<unknown>
}

export interface TravelerApplicationDependencies {
  travelers: TravelerRepositoryPort
  trips: TravelerTripPort
  memberships: TripTravelerPort
  now(): string
  newId(): string
  today(): string
}
