import { isEncryptedPayloadV1 } from '../../security/local-encryption'
import { db } from '../db/dtagency-db'
import {
  TravelerDocumentRepository,
  type TravelerDocumentMetadata,
  type TravelerDocumentView,
} from './traveler-document-repository'

export class ScopedTravelerDocumentRepository extends TravelerDocumentRepository {
  async listMetadataByTraveler(travelerId: string): Promise<TravelerDocumentMetadata[]> {
    const records = await db.travelerDocuments.where('travelerId').equals(travelerId).toArray()
    return records
      .filter((record) => !record.deletedAt)
      .map((record) => {
        if (!isEncryptedPayloadV1(record.encryptedPayload)) {
          throw new Error(`Traveler document ${record.id} does not match the DTAgency v1 encrypted format.`)
        }
        return {
          id: record.id,
          travelerId: record.travelerId,
          type: record.type,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          ...(record.deletedAt ? { deletedAt: record.deletedAt } : {}),
        }
      })
  }

  async listByTraveler(travelerId: string): Promise<TravelerDocumentView[]> {
    const records = await db.travelerDocuments.where('travelerId').equals(travelerId).toArray()
    const result: TravelerDocumentView[] = []
    for (const record of records) {
      if (record.deletedAt) continue
      const view = await this.get(record.id)
      if (view) result.push(view)
    }
    return result
  }
}

export const scopedTravelerDocumentRepository = new ScopedTravelerDocumentRepository()
