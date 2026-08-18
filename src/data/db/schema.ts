import type { Block, Day, EntityBase, Media, Place, Traveler, Trip } from '../../domain/entities'

export interface Link extends EntityBase {
  tripId?: string
  dayId?: string
  blockId?: string
  url: string
  title?: string
  source?: string
  notes?: string
}

export interface TravelerDocument extends EntityBase {
  travelerId: string
  type: 'passport' | 'identityCard' | 'drivingLicense' | 'visa' | 'other'
  documentNumber?: string
  issuingCountryCode?: string
  issueDate?: string
  expiryDate?: string
  mediaId?: string
  notes?: string
}

export interface TripTraveler extends EntityBase {
  tripId: string
  travelerId: string
  role?: 'owner' | 'companion' | 'child' | 'other'
}

export interface Itinerary extends EntityBase {
  tripId: string
  dayId?: string
  placeId?: string
  blockId?: string
  startsAt?: string
  endsAt?: string
  timezone?: string
  title: string
  notes?: string
  status?: 'planned' | 'booked' | 'done' | 'cancelled'
}

export interface Template extends EntityBase {
  name: string
  description?: string
  category: string
  blocks: Array<Pick<Block, 'type' | 'content' | 'position'>>
}

export interface Expense extends EntityBase {
  tripId: string
  dayId?: string
  amount: number
  currency: string
  category?: string
  description?: string
  paidByTravelerId?: string
}

export interface Reservation extends EntityBase {
  tripId: string
  dayId?: string
  type: 'accommodation' | 'transport' | 'restaurant' | 'activity' | 'other'
  title: string
  confirmationCode?: string
  provider?: string
  startsAt?: string
  endsAt?: string
  notes?: string
  linkId?: string
}

export interface AuditEntry extends EntityBase {
  entityType: string
  entityId: string
  action: 'create' | 'update' | 'delete' | 'restore' | 'import' | 'export'
  timestamp: string
  metadata?: Record<string, unknown>
}

export type PersistedEntity = Trip | Traveler | TravelerDocument | TripTraveler | Day | Block | Place | Media | Link | Itinerary | Template | Expense | Reservation | AuditEntry

export type DatabaseTables = {
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
