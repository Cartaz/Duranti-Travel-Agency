import Dexie, { type EntityTable } from 'dexie'
import type {
  ContentBlock,
  Expense,
  InboxItem,
  MediaAsset,
  Place,
  Reservation,
  TravelerProfile,
  Trip,
  TripDay,
} from './domain'

export class DurantiDatabase extends Dexie {
  trips!: EntityTable<Trip, 'id'>
  tripDays!: EntityTable<TripDay, 'id'>
  blocks!: EntityTable<ContentBlock, 'id'>
  travelers!: EntityTable<TravelerProfile, 'id'>
  places!: EntityTable<Place, 'id'>
  inbox!: EntityTable<InboxItem, 'id'>
  media!: EntityTable<MediaAsset, 'id'>
  expenses!: EntityTable<Expense, 'id'>
  reservations!: EntityTable<Reservation, 'id'>

  constructor() {
    super('DurantiTravelAgency')

    this.version(1).stores({
      trips: 'id, status, startDate, endDate, updatedAt',
      tripDays: 'id, tripId, date, updatedAt',
      blocks: 'id, tripId, dayId, type, position, updatedAt',
      travelers: 'id, lastName, updatedAt',
      places: 'id, name, updatedAt',
      inbox: 'id, assignedTripId, kind, createdAt',
      media: 'id, kind, storageKey, createdAt',
      expenses: 'id, tripId, category, planned, date',
      reservations: 'id, tripId, type, startAt, endAt',
    })
  }
}

export const db = new DurantiDatabase()
