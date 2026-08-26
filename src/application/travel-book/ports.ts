import type { Day, Trip } from '../../domain/entities'

export interface TravelBookTripReader {
  getTrip(tripId: string): Promise<Trip | undefined>
}

export interface TravelBookDayReader {
  listTripDays(tripId: string): Promise<Day[]>
}

export interface TravelBookApplicationDependencies {
  trips: TravelBookTripReader
  days: TravelBookDayReader
}
