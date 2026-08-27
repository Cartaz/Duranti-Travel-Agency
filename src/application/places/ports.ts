import type { Block, Day, Place, Trip } from '../../domain/entities'

export interface PlaceReferenceCounts {
  blocks: number
  reservations: number
  itineraries: number
  media: number
}

export type SafeDeletePlaceResult =
  | { status: 'not-found' }
  | { status: 'in-use'; references: PlaceReferenceCounts }
  | { status: 'deleted' }

export interface PlaceTripPort { get(id: string): Promise<Trip | undefined> }
export interface PlaceDayPort { get(id: string): Promise<Day | undefined> }
export interface PlaceBlockPort { get(id: string): Promise<Block | undefined> }
export interface PlaceRepositoryPort {
  get(id: string): Promise<Place | undefined>
  list(): Promise<Place[]>
  put(place: Place): Promise<string>
  safeDelete(id: string): Promise<SafeDeletePlaceResult>
}
export interface PlaceBlockTransactionPort {
  savePlaceForBlock(blockId: string, tripId: string, dayId: string, place: Place): Promise<void>
}

export interface PlaceApplicationDependencies {
  trips: PlaceTripPort
  days: PlaceDayPort
  blocks: PlaceBlockPort
  places: PlaceRepositoryPort
  blockTransactions: PlaceBlockTransactionPort
  now(): string
  newId(): string
}
