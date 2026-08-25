import type { Reservation } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export class ReservationRepository extends Repository<Reservation> {
  constructor() {
    super(db.reservations)
  }

  async listByDay(dayId: string): Promise<Reservation[]> {
    return (await db.reservations.where('dayId').equals(dayId).toArray())
      .filter((reservation) => !reservation.deletedAt)
  }

  async listByTrip(tripId: string): Promise<Reservation[]> {
    return (await db.reservations.where('tripId').equals(tripId).toArray())
      .filter((reservation) => !reservation.deletedAt)
  }
}

export const reservationRepository = new ReservationRepository()
