import type {
  EncryptedPayloadV1,
  TravelerDocument,
  TravelerDocumentAttachment,
  TravelerDocumentPrivateData,
  TravelerDocumentSecret,
} from '../../domain/entities'
import {
  decryptJson,
  encryptJson,
  isEncryptedPayloadV1,
} from '../../security/local-encryption'
import { db } from '../db/dtagency-db'
import {
  deleteEncryptedDocumentAttachment,
  deleteEncryptedDocumentDirectory,
  encryptedDocumentAttachmentExists,
  readEncryptedDocumentAttachment,
  writeEncryptedDocumentAttachment,
} from '../opfs/private-document-store'

const ENCRYPTION_PURPOSE = 'traveler-document'

export interface CreateTravelerDocumentInput {
  travelerId: string
  type: TravelerDocument['type']
  secret: TravelerDocumentSecret
}

export type TravelerDocumentMetadata = Omit<TravelerDocument, 'encryptedPayload'>
export type TravelerDocumentView = TravelerDocumentMetadata & {
  secret: TravelerDocumentSecret
  attachment?: TravelerDocumentAttachment
}

export interface TravelerDocumentReadOptions {
  includeDeleted?: boolean
}

export type TravelerDocumentDeleteResult = 'not-found' | 'already-deleted' | 'tombstoned'
export type TravelerDocumentRestoreResult = 'not-found' | 'already-active' | 'restored'
export type TravelerDocumentPurgeResult = 'not-found' | 'purged'
export type TravelerDocumentAttachmentRemoveResult = 'not-found' | 'no-attachment' | 'removed'

function isSecureRecord(value: unknown): value is TravelerDocument {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.travelerId === 'string' &&
    typeof record.type === 'string' &&
    isEncryptedPayloadV1(record.encryptedPayload)
  )
}

function requireSecureRecord(value: unknown, id: string): TravelerDocument {
  if (!isSecureRecord(value)) {
    throw new Error(`Traveler document ${id} does not match the DTAgency v1 encrypted format.`)
  }
  return value
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

async function decryptPrivateData(record: TravelerDocument): Promise<TravelerDocumentPrivateData> {
  return decryptJson<TravelerDocumentPrivateData>(ENCRYPTION_PURPOSE, record.id, record.encryptedPayload)
}

function viewFrom(
  record: TravelerDocument,
  privateData: TravelerDocumentPrivateData,
): TravelerDocumentView {
  const { attachment, ...secret } = privateData
  return {
    ...metadataFrom(record),
    secret,
    ...(attachment ? { attachment } : {}),
  }
}

async function decryptRecord(record: TravelerDocument): Promise<TravelerDocumentView> {
  return viewFrom(record, await decryptPrivateData(record))
}

async function deleteAttachmentBestEffort(documentId: string, attachmentId: string): Promise<void> {
  try {
    await deleteEncryptedDocumentAttachment(documentId, attachmentId)
  } catch {
    // A later private-file integrity pass can remove an orphan left by interrupted cleanup.
  }
}

export class TravelerDocumentRepository {
  async create(input: CreateTravelerDocumentInput): Promise<TravelerDocumentView> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const privateData: TravelerDocumentPrivateData = { ...input.secret }
    const encryptedPayload = await encryptJson(ENCRYPTION_PURPOSE, id, privateData)

    const entity: TravelerDocument = {
      id,
      travelerId: input.travelerId,
      type: input.type,
      encryptedPayload,
      createdAt: now,
      updatedAt: now,
    }

    await db.travelerDocuments.add(entity)
    return viewFrom(entity, privateData)
  }

  async get(
    id: string,
    options: TravelerDocumentReadOptions = {},
  ): Promise<TravelerDocumentView | undefined> {
    const raw = await db.travelerDocuments.get(id)
    if (!raw || (!options.includeDeleted && raw.deletedAt)) return undefined
    return decryptRecord(requireSecureRecord(raw, id))
  }

  async listMetadata(
    options: TravelerDocumentReadOptions = {},
  ): Promise<TravelerDocumentMetadata[]> {
    const records = await db.travelerDocuments.toArray()
    return records
      .filter((record) => options.includeDeleted || !record.deletedAt)
      .map((record) => metadataFrom(requireSecureRecord(record, record.id)))
  }

  async list(
    options: TravelerDocumentReadOptions = {},
  ): Promise<TravelerDocumentView[]> {
    const records = await db.travelerDocuments.toArray()
    const result: TravelerDocumentView[] = []
    for (const raw of records) {
      if (!options.includeDeleted && raw.deletedAt) continue
      result.push(await decryptRecord(requireSecureRecord(raw, raw.id)))
    }
    return result
  }

  async updateSecret(id: string, secret: TravelerDocumentSecret): Promise<void> {
    const raw = await db.travelerDocuments.get(id)
    if (!raw || raw.deletedAt) throw new Error(`Active traveler document ${id} was not found.`)
    const record = requireSecureRecord(raw, id)
    const current = await decryptPrivateData(record)
    const privateData: TravelerDocumentPrivateData = {
      ...secret,
      ...(current.attachment ? { attachment: current.attachment } : {}),
    }
    const encryptedPayload: EncryptedPayloadV1 = await encryptJson(ENCRYPTION_PURPOSE, id, privateData)
    const updated = await db.travelerDocuments.update(id, {
      encryptedPayload,
      updatedAt: new Date().toISOString(),
    })
    if (updated !== 1) throw new Error(`Traveler document ${id} could not be updated.`)
  }

  async attachFile(id: string, source: File): Promise<TravelerDocumentAttachment> {
    const raw = await db.travelerDocuments.get(id)
    if (!raw || raw.deletedAt) throw new Error(`Active traveler document ${id} was not found.`)
    const record = requireSecureRecord(raw, id)
    const current = await decryptPrivateData(record)
    const attachmentId = crypto.randomUUID()
    const opfsPath = await writeEncryptedDocumentAttachment(id, attachmentId, source)
    const attachment: TravelerDocumentAttachment = {
      id: attachmentId,
      opfsPath,
      mimeType: source.type || 'application/octet-stream',
      ...(source.name ? { originalName: source.name } : {}),
      sizeBytes: source.size,
    }

    try {
      const encryptedPayload = await encryptJson<TravelerDocumentPrivateData>(
        ENCRYPTION_PURPOSE,
        id,
        { ...current, attachment },
      )
      const updated = await db.travelerDocuments.update(id, {
        encryptedPayload,
        updatedAt: new Date().toISOString(),
      })
      if (updated !== 1) throw new Error(`Traveler document ${id} attachment could not be linked.`)
    } catch (error) {
      await deleteAttachmentBestEffort(id, attachmentId)
      throw error
    }

    if (current.attachment) await deleteAttachmentBestEffort(id, current.attachment.id)
    return attachment
  }

  async getAttachment(id: string): Promise<File | undefined> {
    const raw = await db.travelerDocuments.get(id)
    if (!raw || raw.deletedAt) return undefined
    const privateData = await decryptPrivateData(requireSecureRecord(raw, id))
    const attachment = privateData.attachment
    if (!attachment) return undefined

    const plaintext = await readEncryptedDocumentAttachment(id, attachment.id)
    try {
      return new File(
        [plaintext],
        attachment.originalName || `traveler-document-${id}`,
        { type: attachment.mimeType },
      )
    } finally {
      plaintext.fill(0)
    }
  }

  async removeAttachment(id: string): Promise<TravelerDocumentAttachmentRemoveResult> {
    const raw = await db.travelerDocuments.get(id)
    if (!raw || raw.deletedAt) return 'not-found'
    const privateData = await decryptPrivateData(requireSecureRecord(raw, id))
    if (!privateData.attachment) return 'no-attachment'

    const attachment = privateData.attachment
    const { attachment: _removed, ...withoutAttachment } = privateData
    const encryptedPayload = await encryptJson<TravelerDocumentPrivateData>(
      ENCRYPTION_PURPOSE,
      id,
      withoutAttachment,
    )
    const updated = await db.travelerDocuments.update(id, {
      encryptedPayload,
      updatedAt: new Date().toISOString(),
    })
    if (updated !== 1) throw new Error(`Traveler document ${id} attachment could not be unlinked.`)

    await deleteAttachmentBestEffort(id, attachment.id)
    return 'removed'
  }

  async softDelete(id: string): Promise<TravelerDocumentDeleteResult> {
    const record = await db.travelerDocuments.get(id)
    if (!record) return 'not-found'
    if (record.deletedAt) return 'already-deleted'

    const now = new Date().toISOString()
    const updated = await db.travelerDocuments.update(id, { deletedAt: now, updatedAt: now })
    if (updated !== 1) throw new Error(`Traveler document ${id} could not be tombstoned.`)
    return 'tombstoned'
  }

  async restore(id: string): Promise<TravelerDocumentRestoreResult> {
    const raw = await db.travelerDocuments.get(id)
    if (!raw) return 'not-found'
    if (!raw.deletedAt) return 'already-active'
    const record = requireSecureRecord(raw, id)

    const privateData = await decryptPrivateData(record)
    if (
      privateData.attachment &&
      !(await encryptedDocumentAttachmentExists(id, privateData.attachment.id))
    ) {
      throw new Error(`Traveler document ${id} cannot be restored because its encrypted attachment is missing.`)
    }

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

    try {
      await deleteEncryptedDocumentDirectory(id)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
    }

    await db.travelerDocuments.delete(id)
    return 'purged'
  }
}

export const secureTravelerDocumentRepository = new TravelerDocumentRepository()
