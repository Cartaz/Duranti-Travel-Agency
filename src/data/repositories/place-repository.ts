import type { Place } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export interface PlaceReferenceCounts {
  blocks: number
  reservations: number
  itineraries: number
  media: number
}

export type SafeDeletePlaceResult =
  | { status: 'not-found' }
  | { status: 'in-use'; references: PlaceReferenceCounts }
  | { status: 'deleted' }

function blockReferencesPlace(content: Record<string, unknown>, placeId: string): boolean {
  return content.placeId === placeId
}

export class PlaceRepository extends Repository<Place> {
  constructor() {
    super(db.places)
  }

  async safeDelete(id: string): Promise<SafeDeletePlaceResult> {
    return db.transaction('rw', db.places, db.blocks, db.reservations, db.itineraries, db.media, async () => {
      const place = await db.places.get(id)
      if (!place || place.deletedAt) return { status: 'not-found' }

      // Block content.placeId and Media.placeId are intentionally unindexed in schema v1.
      // Use cursor-backed counts so the rare destructive check does not materialize either
      // table in memory. Add indexes only as part of a justified schema-v2 migration.
      const [blocks, reservations, itineraries, media] = await Promise.all([
        db.blocks
          .filter((item) => !item.deletedAt && blockReferencesPlace(item.content, id))
          .count(),
        db.reservations.where('placeId').equals(id).filter((item) => !item.deletedAt).count(),
        db.itineraries.where('placeId').equals(id).filter((item) => !item.deletedAt).count(),
        db.media
          .filter((item) => !item.deletedAt && item.placeId === id)
          .count(),
      ])
      const references = { blocks, reservations, itineraries, media }
      if (Object.values(references).some((count) => count > 0)) return { status: 'in-use', references }

      const now = new Date().toISOString()
      await db.places.put({ ...place, deletedAt: now, updatedAt: now })
      return { status: 'deleted' }
    })
  }
}

export const placeRepository = new PlaceRepository()
