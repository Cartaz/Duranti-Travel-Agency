import type { Traveler, TravelerDocument, TravelerDocumentAttachment, TravelerDocumentSecret } from '../../domain/entities'

export type TravelerDocumentMetadata = Omit<TravelerDocument, 'encryptedPayload'>
export type TravelerDocumentView = TravelerDocumentMetadata & {
  secret: TravelerDocumentSecret
  attachment?: TravelerDocumentAttachment
}

export interface TravelerDocumentRepositoryPort {
  create(input: { travelerId: string; type: TravelerDocument['type']; secret: TravelerDocumentSecret }): Promise<TravelerDocumentView>
  get(id: string): Promise<TravelerDocumentView | undefined>
  listMetadataByTraveler(travelerId: string): Promise<TravelerDocumentMetadata[]>
  listByTraveler(travelerId: string): Promise<TravelerDocumentView[]>
  updateSecret(id: string, secret: TravelerDocumentSecret): Promise<void>
  attachFile(id: string, source: File): Promise<TravelerDocumentAttachment>
  getAttachment(id: string): Promise<File | undefined>
  removeAttachment(id: string): Promise<'not-found' | 'no-attachment' | 'removed'>
  softDelete(id: string): Promise<'not-found' | 'already-deleted' | 'tombstoned'>
}

export interface TravelerReaderPort {
  get(id: string): Promise<Traveler | undefined>
}

export interface LocalSecurityPort {
  isConfigured(): Promise<boolean>
  isUnlocked(): boolean
  configure(passphrase: string): Promise<void>
  unlock(passphrase: string): Promise<void>
  lock(): void
}

export interface TravelerDocumentApplicationDependencies {
  documents: TravelerDocumentRepositoryPort
  travelers: TravelerReaderPort
  security: LocalSecurityPort
}
