import type { Table } from 'dexie'
import type { EntityBase } from '../../domain/entities'
import { db } from '../db/dtagency-db'

export interface DeletedContent {
  /** Tombstoned media whose bytes the caller may purge once nothing references them. */
  mediaIds: string[]
}

export interface DeletedTraveler {
  /** Tombstoned encrypted documents whose bytes the caller may purge. */
  documentIds: string[]
}

/**
 * Tombstones every active row of `table` whose indexed `field` equals `value`.
 * Rows are soft-deleted rather than removed so the Vault snapshot keeps every
 * reference resolvable (see database-v1-validator).
 */
async function tombstoneWhere<T extends EntityBase>(
  table: Table<T, string>,
  field: string,
  value: string,
  now: string,
  transform: (row: T) => T = (row) => row,
): Promise<T[]> {
  const rows = (await table.where(field).equals(value).toArray()).filter((row) => !row.deletedAt)
  const tombstoned = rows.map((row) => ({ ...transform(row), deletedAt: now, updatedAt: now }))
  if (tombstoned.length > 0) await table.bulkPut(tombstoned)
  return tombstoned
}

// Attachments are unlinked from deleted reservations so storage reclamation can
// purge them; a tombstoned reference to a purged row would break Vault import.
const withoutAttachment = <T extends { attachmentMediaId?: string }>(row: T): T => ({
  ...row,
  attachmentMediaId: undefined,
})

async function tombstoneDayContent(field: 'dayId' | 'tripId', value: string, now: string): Promise<DeletedContent> {
  await tombstoneWhere(db.blocks, field, value, now)
  await tombstoneWhere(db.reservations, field, value, now, withoutAttachment)
  await tombstoneWhere(db.itineraries, field, value, now)
  await tombstoneWhere(db.expenses, field, value, now)
  await tombstoneWhere(db.links, field, value, now)
  const media = await tombstoneWhere(db.media, field, value, now)
  return { mediaIds: media.map((item) => item.id) }
}

const dayContentTables = [
  db.trips,
  db.days,
  db.blocks,
  db.reservations,
  db.itineraries,
  db.expenses,
  db.links,
  db.media,
  db.tripTravelers,
]

export const contentDeletionRepository = {
  /** Deletes one day of an editable trip together with everything planned on it. */
  async softDeleteDayWithContent(tripId: string, dayId: string): Promise<DeletedContent> {
    return db.transaction('rw', dayContentTables, async () => {
      const trip = await db.trips.get(tripId)
      if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di eliminare una giornata.')
      const day = await db.days.get(dayId)
      if (!day || day.deletedAt || day.tripId !== tripId)
        throw new Error('La giornata non appartiene a questo viaggio.')
      const now = new Date().toISOString()
      const content = await tombstoneDayContent('dayId', dayId, now)
      await db.days.put({ ...day, deletedAt: now, updatedAt: now })
      return content
    })
  },

  /** Deletes an archived trip with all its days, content and memberships. */
  async softDeleteArchivedTripWithContent(tripId: string): Promise<DeletedContent> {
    return db.transaction('rw', dayContentTables, async () => {
      const trip = await db.trips.get(tripId)
      if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (trip.status !== 'archived') throw new Error('Archivia il viaggio prima di eliminarlo definitivamente.')
      const now = new Date().toISOString()
      const content = await tombstoneDayContent('tripId', tripId, now)
      await tombstoneWhere(db.days, 'tripId', tripId, now)
      await tombstoneWhere(db.tripTravelers, 'tripId', tripId, now)
      await db.trips.put({ ...trip, coverMediaId: undefined, deletedAt: now, updatedAt: now })
      return content
    })
  },

  /**
   * Deletes a traveler, their trip memberships and their encrypted documents.
   * Expenses keep their payer reference to the tombstoned traveler so trip
   * history and Vault references stay intact.
   */
  async softDeleteTravelerWithLinks(travelerId: string): Promise<DeletedTraveler> {
    return db.transaction('rw', db.travelers, db.tripTravelers, db.travelerDocuments, async () => {
      const traveler = await db.travelers.get(travelerId)
      if (!traveler || traveler.deletedAt) throw new Error('Il viaggiatore non esiste o è stato eliminato.')
      const now = new Date().toISOString()
      await tombstoneWhere(db.tripTravelers, 'travelerId', travelerId, now)
      const documents = await tombstoneWhere(db.travelerDocuments, 'travelerId', travelerId, now)
      await db.travelers.put({ ...traveler, deletedAt: now, updatedAt: now })
      return { documentIds: documents.map((document) => document.id) }
    })
  },
}
