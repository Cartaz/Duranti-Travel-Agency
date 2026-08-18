export type TripStatus = 'planned' | 'ongoing' | 'completed' | 'archived'

export interface EntityBase {
  id: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface Trip extends EntityBase {
  title: string
  subtitle?: string
  status: TripStatus
  startDate?: string
  endDate?: string
  coverMediaId?: string
  summary?: string
  currency?: string
}

export interface Traveler extends EntityBase {
  firstName: string
  lastName: string
  displayName: string
  birthDate?: string
  nationality?: string
  email?: string
  phone?: string
  notes?: string
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
