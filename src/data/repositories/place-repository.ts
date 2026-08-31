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

export class PlaceRepository extends Repository<Place> {
  constructor() {
    super(db.places)
  }

  async safeDelete(id: string): Promise<SafeDeletePlaceResult> {
    return db.transaction('rw', db.places, db.blocks, db.reservations, db.itineraries, db.media, async () => {
      const place = await db.places.get(id)
      if (!place || place.deletedAt) return { status: 'not-found' }

      const [blocks, reservations, itineraries, media] = await Promise.all([
        db.blocks.where('content.placeId').equals(id).toArray().then((items) => items.filter((item) => !item.deletedAt).length),
        db.reservations.where('placeId').equals(id).toArray().then((items) => items.filter((item) => !item.deletedAt).length),
        db.itineraries.where('placeId').equals(id).toArray().then((items) => items.filter((item) => !item.deletedAt).length),
        db.media.where('placeId').equals(id).toArray().then((items) => items.filter((item) => !item.deletedAt).length),
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
