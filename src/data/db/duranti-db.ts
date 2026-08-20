import Dexie, { type Table } from 'dexie'
import type { DatabaseTables } from './schema'

export const DB_NAME = 'duranti'
export const DB_VERSION = 2

const V1_STORES = {
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
} as const

const V2_STORES = {
  appMeta: 'key',
  trips: 'id, status, startDate, endDate, updatedAt',
  travelers: 'id, displayName, lastName, updatedAt',
  travelerDocuments: 'id, travelerId, type, expiryDate, updatedAt',
  tripTravelers: 'id, tripId, travelerId, [tripId+travelerId], updatedAt',
  days: 'id, tripId, date, [tripId+date], [tripId+sequence], updatedAt',
  blocks: 'id, tripId, dayId, parentBlockId, [dayId+position], updatedAt',
  places: 'id, providerPlaceId, city, category, updatedAt',
  media: 'id, tripId, dayId, blockId, kind, sha256, updatedAt',
  links: 'id, tripId, dayId, blockId, domain, source, updatedAt',
  itineraries: 'id, tripId, dayId, placeId, [dayId+startsAt], status, updatedAt',
  templates: 'id, category, name, updatedAt',
  expenses: 'id, tripId, dayId, paidByTravelerId, category, occurredAt, updatedAt',
  reservations: 'id, tripId, dayId, type, placeId, startsAt, status, updatedAt',
  auditLog: 'id, entityType, entityId, action, timestamp',
} as const

export class DurantiDatabase extends Dexie {
  appMeta!: Table<DatabaseTables['appMeta'], string>
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

    // V1 is frozen because existing installations may still be on it.
    this.version(1).stores(V1_STORES)

    // V2 changes only stores/indexes. Dexie can apply this schema diff atomically;
    // no row-level upgrade callback is needed because no persisted values are rewritten.
    this.version(DB_VERSION).stores(V2_STORES)
  }
}

export const db = new DurantiDatabase()
