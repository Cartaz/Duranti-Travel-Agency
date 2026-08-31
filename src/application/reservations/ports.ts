import type { Block, Day, Media, Place, Reservation, Trip } from '../../domain/entities'

export interface ReservationBlockReaderPort {
  get(id: string): Promise<Block | undefined>
}

export interface ReservationReaderPort {
  get(id: string): Promise<Reservation | undefined>
}

export interface ReservationPlacePort {
  get(id: string): Promise<Place | undefined>
  list(): Promise<Place[]>
}

export interface ReservationMediaPort {
  get(id: string): Promise<Media | undefined>
  getFile(id: string): Promise<File>
  purge(id: string): Promise<unknown>
}

export interface ReservationAttachmentCreateInput {
  kind: Extract<Media['kind'], 'image' | 'document'>
  mimeType: string
  originalName: string
}

export interface ReservationAttachmentWriteResult {
  reservation: Reservation
  media: Media
}

export interface ReservationTransactionPort {
  saveReservationForBlock(blockId: string, tripId: string, dayId: string, reservation: Reservation): Promise<void>
  attachReservationFile(
    blockId: string,
    tripId: string,
    dayId: string,
    reservationId: string,
    input: ReservationAttachmentCreateInput,
    source: Blob,
  ): Promise<ReservationAttachmentWriteResult>
  removeReservationAttachment(blockId: string, tripId: string, dayId: string, reservationId: string): Promise<Reservation>
  softDeleteReservationBlock(blockId: string, tripId: string, dayId: string): Promise<void>
}

export interface ReservationTripPort {
  get(id: string): Promise<Trip | undefined>
}

export interface ReservationDayPort {
  get(id: string): Promise<Day | undefined>
}

export interface ReservationApplicationDependencies {
  blocks: ReservationBlockReaderPort
  reservations: ReservationReaderPort
  places: ReservationPlacePort
  media: ReservationMediaPort
  transactions: ReservationTransactionPort
  trips: ReservationTripPort
  days: ReservationDayPort
  now(): string
  newId(): string
}
