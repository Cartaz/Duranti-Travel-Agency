import type {
  AppMeta,
  AuditEntry,
  Block,
  Day,
  Expense,
  Itinerary,
  Link,
  Media,
  Place,
  Reservation,
  Template,
  Traveler,
  TravelerDocument,
  Trip,
  TripTraveler,
} from '../../domain/entities'

export type PersistedEntity =
  | Trip
  | Traveler
  | TravelerDocument
  | TripTraveler
  | Day
  | Block
  | Place
  | Media
  | Link
  | Itinerary
  | Template
  | Expense
  | Reservation
  | AuditEntry

export type DatabaseTables = {
  appMeta: AppMeta
  trips: Trip
  travelers: Traveler
  travelerDocuments: TravelerDocument
  tripTravelers: TripTraveler
  days: Day
  blocks: Block
  places: Place
  media: Media
  links: Link
  itineraries: Itinerary
  templates: Template
  expenses: Expense
  reservations: Reservation
  auditLog: AuditEntry
}
