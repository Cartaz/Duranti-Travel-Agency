export type TripStatus = 'idea' | 'planned' | 'ongoing' | 'completed'

export type BlockType =
  | 'text'
  | 'checklist'
  | 'photo'
  | 'gallery'
  | 'video'
  | 'audio'
  | 'document'
  | 'link'
  | 'place'
  | 'event'
  | 'reservation'
  | 'expense'
  | 'transport'
  | 'accommodation'
  | 'person'
  | 'map'
  | 'note'

export interface TravelerProfile {
  id: string
  firstName: string
  lastName: string
  birthDate?: string
  birthPlace?: string
  nationality?: string
  taxCode?: string
  document?: TravelerDocument
  createdAt: string
  updatedAt: string
}

export interface TravelerDocument {
  type: string
  number: string
  issuer?: string
  issuedAt?: string
  expiresAt?: string
  encryptedFileId?: string
}

export interface Trip {
  id: string
  title: string
  description?: string
  coverMediaId?: string
  status: TripStatus
  startDate?: string
  endDate?: string
  travelerIds: string[]
  createdAt: string
  updatedAt: string
}

export interface TripDay {
  id: string
  tripId: string
  date: string
  title?: string
  templateId?: string
  blockIds: string[]
  createdAt: string
  updatedAt: string
}

export interface ContentBlock {
  id: string
  tripId?: string
  dayId?: string
  type: BlockType
  position: number
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Place {
  id: string
  name: string
  address?: string
  latitude?: number
  longitude?: number
  googleMapsUrl?: string
  websiteUrl?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface InboxItem {
  id: string
  kind: 'link' | 'text' | 'image' | 'video' | 'location' | 'note'
  title?: string
  url?: string
  text?: string
  mediaId?: string
  assignedTripId?: string
  createdAt: string
}

export interface MediaAsset {
  id: string
  kind: 'image' | 'video' | 'audio' | 'document'
  mimeType: string
  fileName: string
  size: number
  encrypted: boolean
  storageKey: string
  createdAt: string
}

export interface Expense {
  id: string
  tripId: string
  amount: number
  currency: string
  category: string
  planned: boolean
  date?: string
  note?: string
}

export interface Reservation {
  id: string
  tripId: string
  type: 'transport' | 'accommodation' | 'activity' | 'restaurant' | 'other'
  title: string
  startAt?: string
  endAt?: string
  confirmationCode?: string
  websiteUrl?: string
  documentMediaId?: string
}
