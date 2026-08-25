import type { Block, Day, Media, Place, Trip } from '../../domain/entities'

export interface DayMediaCreateInput {
  tripId?: string
  dayId?: string
  blockId?: string
  placeId?: string
  itineraryId?: string
  reservationId?: string
  position?: number
  kind: Media['kind']
  mimeType?: string
  originalName?: string
  caption?: string
}

export interface DayMediaMetadataUpdate {
  caption?: string
  placeId?: string
  itineraryId?: string
  reservationId?: string
}

export interface DayMediaRepositoryPort {
  listForDay(tripId: string, dayId: string): Promise<Media[]>
  get(id: string): Promise<Media | undefined>
  getFile(id: string): Promise<File>
  create(input: DayMediaCreateInput, source: Blob): Promise<Media>
  updateDayMetadata(id: string, input: DayMediaMetadataUpdate): Promise<Media>
  setDayOrder(tripId: string, dayId: string, orderedIds: string[]): Promise<void>
  softDelete(id: string): Promise<unknown>
  purge(id: string): Promise<unknown>
}

export interface DayMediaBlockPort {
  listByDay(dayId: string): Promise<Block[]>
}

export interface DayMediaPlacePort {
  getMany(ids: string[]): Promise<Place[]>
  get(id: string): Promise<Place | undefined>
}

export interface DayMediaTripPort {
  get(id: string): Promise<Trip | undefined>
}

export interface DayMediaDayPort {
  get(id: string): Promise<Day | undefined>
}

export interface DayMediaItinerarySourceItem {
  itinerary: {
    id: string
    title: string
    placeId?: string
    reservationId?: string
  }
  place?: { name: string }
}

export interface DayMediaItineraryQueryPort {
  listDayItems(tripId: string, dayId: string): Promise<DayMediaItinerarySourceItem[]>
}

export interface DayMediaApplicationDependencies {
  media: DayMediaRepositoryPort
  blocks: DayMediaBlockPort
  places: DayMediaPlacePort
  trips: DayMediaTripPort
  days: DayMediaDayPort
  itinerary: DayMediaItineraryQueryPort
}
