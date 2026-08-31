import Dexie, { type Table } from 'dexie'
import type { DatabaseTables } from './schema'

export const DB_NAME = 'dtagency'
export const DB_VERSION = 2

const STORES_V1 = {
  appMeta: 'key',
  trips: 'id, status, startDate, endDate, updatedAt',
  travelers: 'id, displayName, lastName, updatedAt',
  travelerDocuments: 'id, travelerId, type, updatedAt',
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

const STORES_V2 = {
  ...STORES_V1,
  blocks: 'id, tripId, dayId, parentBlockId, content.placeId, [dayId+position], updatedAt',
  media: 'id, tripId, dayId, blockId, placeId, kind, sha256, updatedAt',
} as const

export class DTAgencyDatabase extends Dexie {
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
    this.version(1).stores(STORES_V1)
    this.version(DB_VERSION).stores(STORES_V2)
  }
}

export const db = new DTAgencyDatabase()
