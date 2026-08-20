import type {
  EncryptedPayloadV1,
  TravelerDocument,
  TravelerDocumentSecret,
} from '../../domain/entities'
import {
  decryptJson,
  encryptJson,
  isEncryptedPayloadV1,
} from '../../security/local-encryption'
import { db } from '../db/duranti-db'

const ENCRYPTION_PURPOSE = 'traveler-document'

export interface CreateTravelerDocumentInput {
  travelerId: string
  type: TravelerDocument['type']
  secret: TravelerDocumentSecret
}

export type TravelerDocumentView = Omit<TravelerDocument, 'encryptedPayload'> & {
  secret: TravelerDocumentSecret
}

export type TravelerDocumentMetadata = Omit<TravelerDocument, 'encryptedPayload'>

export interface TravelerDocumentReadOptions {
  includeDeleted?: boolean
}

export type TravelerDocumentDeleteResult = 'not-found' | 'already-deleted' | 'tombstoned'
export type TravelerDocumentRestoreResult = 'not-found' | 'already-active' | 'restored'
export type TravelerDocumentPurgeResult = 'not-found' | 'purged'

export class LegacyTravelerDocumentError extends Error {
  constructor(id: string) {
    super(`Traveler document ${id} uses the legacy plaintext format and requires secure migration.`)
    this.name = 'LegacyTravelerDocumentError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function isSecureRecord(value: unknown): value is TravelerDocument {
  const record = asRecord(value)
  return Boolean(
    record &&
    typeof record.id === 'string' &&
    typeof record.travelerId === 'string' &&
    typeof record.type === 'string' &&
    isEncryptedPayloadV1(record.encryptedPayload),
  )
}

function metadataFrom(record: TravelerDocument): TravelerDocumentMetadata {
  return {
    id: record.id,
    travelerId: record.travelerId,
    type: record.type,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.deletedAt ? { deletedAt: record.deletedAt } : {}),
  }
}

async function decryptRecord(record: TravelerDocument): Promise<TravelerDocumentView> {
  const secret = await decryptJson<TravelerDocumentSecret>(
    ENCRYPTION_PURPOSE,
    record.id,
    record.encryptedPayload,
  )
  return { ...metadataFrom(record), secret }
}

export class TravelerDocumentRepository {
  async create(input: CreateTravelerDocumentInput): Promise<TravelerDocumentView> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const encryptedPayload = await encryptJson(
      ENCRYPTION_PURPOSE,
      id,
      input.secret,
    )

    const entity: TravelerDocument = {
      id,
      travelerId: input.travelerId,
      type: input.type,
      encryptedPayload,
      createdAt: now,
      updatedAt: now,
    }

    await db.travelerDocuments.add(entity)
    return { ...metadataFrom(entity), secret: input.secret }
  }

  async get(
    id: string,
    options: TravelerDocumentReadOptions = {},
  ): Promise<TravelerDocumentView | undefined> {
    const raw = await db.travelerDocuments.get(id)
    if (!raw || (!options.includeDeleted && raw.deletedAt)) return undefined
    if (!isSecureRecord(raw)) throw new LegacyTravelerDocumentError(id)
    return decryptRecord(raw)
  }

  async listMetadata(
    options: TravelerDocumentReadOptions = {},
  ): Promise<TravelerDocumentMetadata[]> {
    const records = await db.travelerDocuments.toArray()
    return records
      .filter((record) => options.includeDeleted || !record.deletedAt)
      .map((record) => metadataFrom(record))
  }

  async list(
    options: TravelerDocumentReadOptions = {},
  ): Promise<TravelerDocumentView[]> {
    const records = await db.travelerDocuments.toArray()
    const result: TravelerDocumentView[] = []

    for (const raw of records) {
      if (!options.includeDeleted && raw.deletedAt) continue
      const candidate: unknown = raw
      if (!isSecureRecord(candidate)) throw new LegacyTravelerDocumentError(raw.id)
      result.push(await decryptRecord(candidate))
    }

    return result
  }

  async updateSecret(id: string, secret: TravelerDocumentSecret): Promise<void> {
    const raw = await db.travelerDocuments.get(id)
    if (!raw || raw.deletedAt) throw new Error(`Active traveler document ${id} was not found.`)
    if (!isSecureRecord(raw)) throw new LegacyTravelerDocumentError(id)

    const encryptedPayload: EncryptedPayloadV1 = await encryptJson(
      ENCRYPTION_PURPOSE,
      id,
      secret,
    )
    const updated = await db.travelerDocuments.update(id, {
      encryptedPayload,
      updatedAt: new Date().toISOString(),
    })
    if (updated !== 1) throw new Error(`Traveler document ${id} could not be updated.`)
  }

  async softDelete(id: string): Promise<TravelerDocumentDeleteResult> {
    const record = await db.travelerDocuments.get(id)
    if (!record) return 'not-found'
    if (record.deletedAt) return 'already-deleted'

    const now = new Date().toISOString()
    const updated = await db.travelerDocuments.update(id, {
      deletedAt: now,
      updatedAt: now,
    })
    if (updated !== 1) throw new Error(`Traveler document ${id} could not be tombstoned.`)
    return 'tombstoned'
  }

  async restore(id: string): Promise<TravelerDocumentRestoreResult> {
    const record = await db.travelerDocuments.get(id)
    if (!record) return 'not-found'
    if (!record.deletedAt) return 'already-active'
    if (!isSecureRecord(record)) throw new LegacyTravelerDocumentError(id)

    const updated = await db.travelerDocuments.update(id, {
      deletedAt: undefined,
      updatedAt: new Date().toISOString(),
    })
    if (updated !== 1) throw new Error(`Traveler document ${id} could not be restored.`)
    return 'restored'
  }

  async purge(id: string): Promise<TravelerDocumentPurgeResult> {
    const record = await db.travelerDocuments.get(id)
    if (!record) return 'not-found'
    if (!record.deletedAt) {
      throw new Error(`Traveler document ${id} must be tombstoned before it can be purged.`)
    }

    await db.travelerDocuments.delete(id)
    return 'purged'
  }

  async listLegacyPlaintextIds(): Promise<string[]> {
    const rawRecords = await db.travelerDocuments.toArray()
    return rawRecords
      .filter((record) => {
        const candidate: unknown = record
        return !isSecureRecord(candidate)
      })
      .map((record) => record.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  }
}

export const secureTravelerDocumentRepository = new TravelerDocumentRepository()
