import type { TripTraveler } from '../../domain/entities'
import { db } from '../db/duranti-db'

export type TripTravelerRole = NonNullable<TripTraveler['role']>

export class TripTravelerRepository {
  async listActiveForTrip(tripId: string): Promise<TripTraveler[]> {
    const memberships = await db.tripTravelers.where('tripId').equals(tripId).toArray()
    return memberships
      .filter((membership) => !membership.deletedAt)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  }

  async setMembership(tripId: string, travelerId: string, role: TripTravelerRole): Promise<TripTraveler> {
    return db.transaction('rw', db.trips, db.travelers, db.tripTravelers, async () => {
      const trip = await db.trips.get(tripId)
      if (!trip || trip.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificarne i partecipanti.')

      const traveler = await db.travelers.get(travelerId)
      if (!traveler || traveler.deletedAt) throw new Error('Il profilo viaggiatore non esiste più.')

      const matches = await db.tripTravelers
        .where('[tripId+travelerId]')
        .equals([tripId, travelerId])
        .toArray()
      const active = matches.filter((membership) => !membership.deletedAt)
      if (active.length > 1) {
        throw new Error('Esistono partecipazioni duplicate per questo viaggiatore. Correggi i dati prima di continuare.')
      }

      const now = new Date().toISOString()
      if (active.length === 1) {
        const updated: TripTraveler = {
          ...active[0],
          role,
          updatedAt: now,
        }
        await db.tripTravelers.put(updated)
        return updated
      }

      const tombstones = matches.filter((membership) => Boolean(membership.deletedAt))
      if (tombstones.length > 1) {
        throw new Error('Esistono vecchie partecipazioni duplicate per questo viaggiatore. È necessaria una riconciliazione prima del ripristino.')
      }

      if (tombstones.length === 1) {
        const restored: TripTraveler = {
          ...tombstones[0],
          role,
          deletedAt: undefined,
          updatedAt: now,
        }
        await db.tripTravelers.put(restored)
        return restored
      }

      const membership: TripTraveler = {
        id: crypto.randomUUID(),
        tripId,
        travelerId,
        role,
        createdAt: now,
        updatedAt: now,
      }
      await db.tripTravelers.add(membership)
      return membership
    })
  }

  async detachMembership(tripId: string, travelerId: string): Promise<'detached' | 'not-found'> {
    return db.transaction('rw', db.tripTravelers, async () => {
      const matches = await db.tripTravelers
        .where('[tripId+travelerId]')
        .equals([tripId, travelerId])
        .toArray()
      const active = matches.filter((membership) => !membership.deletedAt)
      if (active.length > 1) {
        throw new Error('Esistono partecipazioni duplicate per questo viaggiatore. Correggi i dati prima di continuare.')
      }
      if (active.length === 0) return 'not-found'

      const now = new Date().toISOString()
      await db.tripTravelers.put({
        ...active[0],
        deletedAt: now,
        updatedAt: now,
      })
      return 'detached'
    })
  }
}

export const tripTravelerRepository = new TripTravelerRepository()
