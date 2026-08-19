import Dexie, { type Table } from 'dexie'
import type { DatabaseTables } from './schema'

export const DB_NAME = 'duranti'
export const DB_VERSION = 1

export class DurantiDatabase extends Dexie {
  trips!: Table<DatabaseTables['trips'], string>
  travelers!: Table<DatabaseTables['travelers'], string>
  travelerDocuments!: Table<DatabaseTables['travelerDocuments'], string>
  tripTravelers!: Table<DatabaseTables['tripTravelers'], string>
  days!: Table<DatabaseTables['days'], string>
  blocks!: Table<DatabaseTables['blocks'], string>
  places!: Table<DatabaseTables['places'], string>
  media!: Table<DatabaseTables['media'], string>
  links!: Table<DatabaseTables['links'], string>
  itineraries!: Table<DatabaseTables['itineraries'], string>
  templates!: Table<DatabaseTables['templates'], string>
  expenses!: Table<DatabaseTables['expenses'], string>
  reservations!: Table<DatabaseTables['reservations'], string>
  auditLog!: Table<DatabaseTables['auditLog'], string>

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
