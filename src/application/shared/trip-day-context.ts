import type { Day, Trip } from '../../domain/entities'

export interface TripContextReaderPort {
  get(id: string): Promise<Trip | undefined>
}

export interface DayContextReaderPort {
  get(id: string): Promise<Day | undefined>
}

export interface TripDayContextDependencies {
  trips: TripContextReaderPort
  days: DayContextReaderPort
}

export async function readTrip(
  deps: Pick<TripDayContextDependencies, 'trips'>,
  tripId: string,
): Promise<Trip | undefined> {
  return deps.trips.get(tripId)
}

export async function requireTrip(
  deps: Pick<TripDayContextDependencies, 'trips'>,
  tripId: string,
): Promise<Trip> {
  const trip = await readTrip(deps, tripId)
  if (!trip) throw new Error('Il viaggio non esiste o è stato eliminato.')
  return trip
}

export async function readTripDay(
  deps: TripDayContextDependencies,
  tripId: string,
  dayId: string,
): Promise<{ trip: Trip; day: Day } | undefined> {
  const [trip, day] = await Promise.all([deps.trips.get(tripId), deps.days.get(dayId)])
  if (!trip || !day || day.tripId !== tripId) return undefined
  return { trip, day }
}

export async function requireTripDay(
  deps: TripDayContextDependencies,
  tripId: string,
  dayId: string,
): Promise<{ trip: Trip; day: Day }> {
  const context = await readTripDay(deps, tripId, dayId)
  if (!context) throw new Error('Viaggio o giornata non disponibili.')
  return context
}

export async function assertTripDayContext(
  deps: TripDayContextDependencies,
  tripId: string,
  dayId: string,
  editable: boolean,
  archivedMessage = 'Ripristina il viaggio prima di modificare questa giornata.',
): Promise<{ trip: Trip; day: Day }> {
  const context = await requireTripDay(deps, tripId, dayId)
  if (editable && context.trip.status === 'archived') throw new Error(archivedMessage)
  return context
}
