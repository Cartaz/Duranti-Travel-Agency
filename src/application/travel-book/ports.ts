import type { Day, Media, Trip } from '../../domain/entities'

export interface TravelBookTripReader {
  getTrip(tripId: string): Promise<Trip | undefined>
}

export interface TravelBookDayReader {
  listTripDays(tripId: string): Promise<Day[]>
}

export interface TravelBookMediaReader {
  listDayMedia(tripId: string, dayId: string): Promise<Media[]>
  readMediaFile(mediaId: string): Promise<File>
}

export interface TravelBookApplicationDependencies {
  trips: TravelBookTripReader
  days: TravelBookDayReader
  media: TravelBookMediaReader
}
