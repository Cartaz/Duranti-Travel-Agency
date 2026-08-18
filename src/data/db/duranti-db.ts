import Dexie, { type EntityTable } from 'dexie'
import type { DatabaseTables } from './schema'

export const DB_NAME = 'duranti'
export const DB_VERSION = 1

export class DurantiDatabase extends Dexie {
  trips!: EntityTable<DatabaseTables['trips'], 'id'>
  travelers!: EntityTable<DatabaseTables['travelers'], 'id'>
  travelerDocuments!: EntityTable<DatabaseTables['travelerDocuments'], 'id'>
  tripTravelers!: EntityTable<DatabaseTables['tripTravelers'], 'id'>
  days!: EntityTable<DatabaseTables['days'], 'id'>
  blocks!: EntityTable<DatabaseTables['blocks'], 'id'>
  places!: EntityTable<DatabaseTables['places'], 'id'>
  media!: EntityTable<DatabaseTables['media'], 'id'>
  links!: EntityTable<DatabaseTables['links'], 'id'>
  itineraries!: EntityTable<DatabaseTables['itineraries'], 'id'>
  templates!: EntityTable<DatabaseTables['templates'], 'id'>
  expenses!: EntityTable<DatabaseTables['expenses'], 'id'>
  reservations!: EntityTable<DatabaseTables['reservations'], 'id'>
  auditLog!: EntityTable<DatabaseTables['auditLog'], 'id'>

  constructor() {
    super(DB_NAME)
    this.version(DB_VERSION).stores({
      trips: 'id, status, startDate, endDate, updatedAt',
      travelers: 'id, displayName, lastName, updatedAt',
      travelerDocuments: 'id, travelerId, type, expiryDate, updatedAt',
      tripTravelers: 'id, tripId, travelerId, [tripId+travelerId], updatedAt',
      days: 'id, tripId, date, [tripId+date], sequence, updatedAt',
      blocks: 'id, tripId, dayId, parentBlockId, [dayId+position], [tripId+position], updatedAt',
      places: 'id, name, provider, providerPlaceId, city, countryCode, updatedAt',
      media: 'id, tripId, dayId, blockId, kind, sha256, updatedAt',
      links: 'id, tripId, dayId, blockId, source, updatedAt',
      itineraries: 'id, tripId, dayId, placeId, startsAt, status, updatedAt',
      templates: 'id, category, name, updatedAt',
      expenses: 'id, tripId, dayId, paidByTravelerId, category, updatedAt',
      reservations: 'id, tripId, dayId, type, startsAt, status, updatedAt',
      auditLog: 'id, entityType, entityId, action, timestamp',
    })
  }
}

export const db = new DurantiDatabase()
