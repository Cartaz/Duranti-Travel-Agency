import type { Trip, TripStatus } from '../../domain/entities'
import { isDayDateWithinTripRange } from '../../domain/trip-calendar'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export class TripRepository extends Repository<Trip> {
  constructor() {
    super(db.trips)
  }

  async listByStatus(status: TripStatus): Promise<Trip[]> {
    return (await db.trips.where('status').equals(status).toArray())
      .filter((trip) => !trip.deletedAt)
  }

  async listBookTrips(): Promise<Trip[]> {
    const statuses: TripStatus[] = ['planned', 'ongoing', 'completed']
    const groups = await Promise.all(statuses.map((status) => this.listByStatus(status)))
    return groups.flat()
  }

  listArchivedTrips(): Promise<Trip[]> {
    return this.listByStatus('archived')
  }

  async updateEditable(value: Trip): Promise<Trip> {
    return db.transaction('rw', db.trips, db.days, async () => {
      const current = await db.trips.get(value.id)
      if (!current || current.deletedAt) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (current.status === 'archived') throw new Error('Ripristina il viaggio dall’archivio prima di modificarlo.')

      const days = (await db.days.where('tripId').equals(value.id).toArray())
        .filter((day) => !day.deletedAt)
      const invalidDays = days
        .filter((day) => !isDayDateWithinTripRange(value, day.date))
        .sort((left, right) => left.date.localeCompare(right.date))
      if (invalidDays.length > 0) {
        const first = invalidDays[0]
        const extra = invalidDays.length > 1 ? ` Ci sono anche altre ${invalidDays.length - 1} giornate fuori intervallo.` : ''
        throw new Error(
          `Non posso salvare queste date: la giornata del ${first.date} resterebbe fuori dal nuovo intervallo.${extra} Modifica prima le giornate interessate oppure amplia l’intervallo del viaggio.`,
        )
      }

      const updated: Trip = {
        ...value,
        createdAt: current.createdAt,
        deletedAt: undefined,
      }
      await db.trips.put(updated)
      return updated
    })
  }
}

export const tripRepository = new TripRepository()
