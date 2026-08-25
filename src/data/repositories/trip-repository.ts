import type { Trip, TripStatus } from '../../domain/entities'
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
}

export const tripRepository = new TripRepository()
