import { placeIdForBlock, withPlaceId } from '../../domain/block-content'
import type { Place } from '../../domain/entities'
import { db } from '../db/dtagency-db'

export class PlaceBlockRepository {
  async savePlaceForBlock(
    blockId: string,
    tripId: string,
    dayId: string,
    place: Place,
  ): Promise<void> {
    await db.transaction('rw', db.blocks, db.places, async () => {
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt) throw new Error('Il blocco luogo non esiste più.')
      if (block.tripId !== tripId || block.dayId !== dayId || block.type !== 'place') {
        throw new Error('Il blocco non è un luogo di questa giornata.')
      }

      const currentPlaceId = placeIdForBlock(block)
      const currentPlace = currentPlaceId ? await db.places.get(currentPlaceId) : undefined
      const currentPlaceIsActive = Boolean(currentPlace && !currentPlace.deletedAt)

      if (currentPlaceIsActive && currentPlaceId !== place.id) {
        throw new Error('Il blocco è già collegato a un altro luogo attivo.')
      }

      const targetPlace = await db.places.get(place.id)
      if (targetPlace?.deletedAt && !place.deletedAt) {
        throw new Error('Il luogo è stato eliminato e non può essere riattivato implicitamente.')
      }
      if (!currentPlaceIsActive && targetPlace) {
        throw new Error('Esiste già un altro luogo con questo identificatore.')
      }

      if (currentPlaceIsActive) await db.places.put(place)
      else await db.places.add(place)

      await db.blocks.put({
        ...block,
        content: withPlaceId(block.content, place.id),
        updatedAt: new Date().toISOString(),
      })
    })
  }
}

export const placeBlockRepository = new PlaceBlockRepository()
