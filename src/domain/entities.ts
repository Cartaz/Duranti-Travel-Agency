export type TripStatus = 'planned' | 'ongoing' | 'completed' | 'archived'

export interface EntityBase {
  id: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface AppMeta {
  key: string
  value: unknown
}

export interface EncryptedPayloadV1 {
  version: 1
  algorithm: 'AES-GCM'
  tagLength: 128
  ivB64: string
  ciphertextB64: string
}

export interface Trip extends EntityBase {
  title: string
  subtitle?: string
  status: TripStatus
  archivedFromStatus?: Exclude<TripStatus, 'archived'>
  startDate?: string
  endDate?: string
  coverMediaId?: string
  summary?: string
  currency?: string
  budgetMinor?: number
  homeLocation?: {
    name?: string
    latitude?: number
    longitude?: number
  }
}

export interface Traveler extends EntityBase {
  firstName: string
  lastName: string
  displayName: string
  birthDate?: string
  birthPlace?: string
  nationality?: string
  gender?: string
  email?: string
  phone?: string
  address?: {
    line1?: string
    line2?: string
    postalCode?: string
    city?: string
    region?: string
    countryCode?: string
  }
  notes?: string
}

export interface TravelerDocumentSecret {
  documentNumber?: string
  issuingCountryCode?: string
  issueDate?: string
  expiryDate?: string
  holderName?: string
  notes?: string
}

export interface TravelerDocumentAttachment {
  id: string
  opfsPath: string
  mimeType: string
  originalName?: string
  sizeBytes: number
}

export interface TravelerDocumentPrivateData extends TravelerDocumentSecret {
  attachment?: TravelerDocumentAttachment
}

export interface TravelerDocument extends EntityBase {
  travelerId: string
  type: 'passport' | 'identityCard' | 'drivingLicense' | 'visa' | 'other'
  encryptedPayload: EncryptedPayloadV1
}

export interface TripTraveler extends EntityBase {
  tripId: string
  travelerId: string
  role?: 'owner' | 'companion' | 'child' | 'other'
}

export interface Day extends EntityBase {
  tripId: string
  date: string
  sequence: number
  title?: string
  summary?: string
  templateId?: string
}

export type BlockType =
  | 'text' | 'heading' | 'checklist' | 'place' | 'map' | 'media'
  | 'link' | 'quote' | 'divider' | 'table' | 'expense'
  | 'transport' | 'accommodation' | 'document' | 'weatherSnapshot'

export interface Block extends EntityBase {
  tripId: string
  dayId?: string
  parentBlockId?: string
  type: BlockType
  position: number
  content: Record<string, unknown>
}

export interface Place extends EntityBase {
  name: string
  formattedAddress?: string
  latitude?: number
  longitude?: number
  provider?: string
  providerPlaceId?: string
  mapsUrl?: string
  countryCode?: string
  city?: string
  category?: string
  notes?: string
}

export interface Itinerary extends EntityBase {
  tripId: string
  dayId?: string
  placeId?: string
  blockId?: string
  type?: 'transport' | 'activity' | 'meal' | 'reservation' | 'free-time' | 'custom'
  startsAt?: string
  endsAt?: string
  timezone?: string
  title: string
  notes?: string
  status?: 'idea' | 'planned' | 'booked' | 'done' | 'cancelled'
  bookingReference?: string
  position?: number
}

export interface Link extends EntityBase {
  tripId?: string
  dayId?: string
  blockId?: string
  url: string
  title?: string
  domain?: string
  source?: string
  description?: string
  thumbnailMediaId?: string
  notes?: string
}

export interface Media extends EntityBase {
  tripId?: string
  dayId?: string
  blockId?: string
  kind: 'image' | 'video' | 'audio' | 'document'
  mimeType: string
  originalName?: string
  sizeBytes: number
  width?: number
  height?: number
  durationMs?: number
  sha256?: string
  opfsPath: string
}

export interface Template extends EntityBase {
  name: string
  description?: string
  category: string
  version: number
  definition: {
    blocks: Array<Pick<Block, 'type' | 'content' | 'position'>>
  }
}

export interface ExpenseFxConversion {
  targetCurrency: string
  rate: string
  convertedAmountMinor: number
}

export interface Expense extends EntityBase {
  tripId: string
  dayId?: string
  amountMinor: number
  currency: string
  category?: string
  description?: string
  paidByTravelerId?: string
  occurredAt?: string
  notes?: string
  fx?: ExpenseFxConversion
}

export interface Reservation extends EntityBase {
  tripId: string
  dayId?: string
  type: 'accommodation' | 'transport' | 'restaurant' | 'activity' | 'other'
  title: string
  provider?: string
  confirmationCode?: string
  startsAt?: string
  endsAt?: string
  timezone?: string
  placeId?: string
  url?: string
  attachmentMediaId?: string
  notes?: string
  status?: 'planned' | 'booked' | 'completed' | 'cancelled'
  linkId?: string
}

export interface AuditEntry extends EntityBase {
  entityType: string
  entityId: string
  action: 'create' | 'update' | 'delete' | 'restore' | 'import' | 'export'
  timestamp: string
  metadata?: Record<string, unknown>
}
