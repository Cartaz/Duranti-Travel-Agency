import type { Block, Day, Itinerary, Place, Reservation, Trip } from '../../domain/entities'

export interface ItineraryTripPort { get(id: string): Promise<Trip | undefined> }
export interface ItineraryDayPort {
  get(id: string): Promise<Day | undefined>
  list(): Promise<Day[]>
  listByTrip(tripId: string): Promise<Day[]>
}
export interface ItineraryBlockPort {
  get(id: string): Promise<Block | undefined>
  list(): Promise<Block[]>
  listByDay(dayId: string): Promise<Block[]>
  listByTrip(tripId: string): Promise<Block[]>
}
export interface ItineraryPlacePort { get(id: string): Promise<Place | undefined>; list(): Promise<Place[]> }
export interface ItineraryReservationPort {
  get(id: string): Promise<Reservation | undefined>
  list(): Promise<Reservation[]>
  listByDay(dayId: string): Promise<Reservation[]>
  listByTrip(tripId: string): Promise<Reservation[]>
}
export interface ItineraryRepositoryPort {
  get(id: string): Promise<Itinerary | undefined>
  list(): Promise<Itinerary[]>
  listByDay(dayId: string): Promise<Itinerary[]>
  listByTrip(tripId: string): Promise<Itinerary[]>
  put(value: Itinerary): Promise<unknown>
  softDelete(id: string): Promise<unknown>
  moveManualUntimed(tripId: string, dayId: string, itineraryId: string, direction: 'up' | 'down'): Promise<boolean>
}
export interface ItineraryReservationSyncPort {
  saveReservationForBlock(blockId: string, tripId: string, dayId: string, reservation: Reservation): Promise<void>
}

export interface ItineraryApplicationDependencies {
  trips: ItineraryTripPort
  days: ItineraryDayPort
  blocks: ItineraryBlockPort
  itineraries: ItineraryRepositoryPort
  places: ItineraryPlacePort
  reservations: ItineraryReservationPort
  reservationSync: ItineraryReservationSyncPort
  now(): string
  newId(): string
}
