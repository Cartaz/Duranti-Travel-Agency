import type { Trip, TripStatus } from '../../domain/entities'
import { isDayDateWithinTripRange } from '../../domain/trip-calendar'
import { dayRepository, tripRepository } from '../../data/repositories/repositories'

export type EditableTripStatus = Exclude<TripStatus, 'archived'>

export interface TripDraft {
  title: string
  subtitle?: string
  status: EditableTripStatus
  startDate?: string
  endDate?: string
  summary?: string
  currency?: string
}

const editableStatuses = new Set<TripStatus>(['planned', 'ongoing', 'completed'])

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

function validateDraft(input: TripDraft): TripDraft {
  const title = input.title.trim()
  if (!title) throw new Error('Il titolo del viaggio è obbligatorio.')
  if (title.length > 120) throw new Error('Il titolo del viaggio è troppo lungo.')
  if (!editableStatuses.has(input.status)) throw new Error('Lo stato del viaggio non è valido.')

  const startDate = cleanOptional(input.startDate)
  const endDate = cleanOptional(input.endDate)
  if (startDate && endDate && endDate < startDate) {
    throw new Error('La data di fine non può precedere la data di partenza.')
  }

  const currency = cleanOptional(input.currency)?.toUpperCase()
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('La valuta deve essere un codice ISO di tre lettere, ad esempio EUR.')
  }

  return {
    title,
    subtitle: cleanOptional(input.subtitle),
    status: input.status,
    startDate,
    endDate,
    summary: cleanOptional(input.summary),
    currency,
  }
}

function tripSortValue(trip: Trip): string {
  return trip.startDate ?? trip.createdAt
}

async function assertExistingDaysFitRange(tripId: string, range: Pick<Trip, 'startDate' | 'endDate'>): Promise<void> {
  const days = await dayRepository.list()
  const invalidDays = days
    .filter((day) => day.tripId === tripId && !isDayDateWithinTripRange(range, day.date))
    .sort((left, right) => left.date.localeCompare(right.date))

  if (invalidDays.length === 0) return

  const first = invalidDays[0]
  const extra = invalidDays.length > 1 ? ` e altre ${invalidDays.length - 1}` : ''
  throw new Error(
    `Le nuove date del viaggio escluderebbero la giornata ${first.date}${extra}. Modifica prima le giornate oppure amplia l’intervallo del viaggio.`,
  )
}

export async function listBookTrips(): Promise<Trip[]> {
  const trips = await tripRepository.list()
  return trips
    .filter((trip) => trip.status !== 'archived')
    .sort((left, right) => tripSortValue(left).localeCompare(tripSortValue(right)))
}

export async function listArchivedTrips(): Promise<Trip[]> {
  const trips = await tripRepository.list()
  return trips
    .filter((trip) => trip.status === 'archived')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function getTrip(tripId: string): Promise<Trip | undefined> {
  return tripRepository.get(tripId)
}

export async function createTrip(input: TripDraft): Promise<Trip> {
  const draft = validateDraft(input)
  const now = new Date().toISOString()
  const trip: Trip = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...draft,
  }

  await tripRepository.put(trip)
  return trip
}

export async function updateTrip(tripId: string, input: TripDraft): Promise<Trip> {
  const existing = await tripRepository.get(tripId)
  if (!existing) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (existing.status === 'archived') {
    throw new Error('Ripristina il viaggio dall’archivio prima di modificarlo.')
  }

  const draft = validateDraft(input)
  const dateRangeChanged = draft.startDate !== existing.startDate || draft.endDate !== existing.endDate
  if (dateRangeChanged) {
    await assertExistingDaysFitRange(tripId, draft)
  }

  const updated: Trip = {
    ...existing,
    ...draft,
    archivedFromStatus: undefined,
    updatedAt: new Date().toISOString(),
  }

  await tripRepository.put(updated)
  return updated
}

export async function archiveTrip(tripId: string): Promise<Trip> {
  const existing = await tripRepository.get(tripId)
  if (!existing) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (existing.status === 'archived') return existing

  const archived: Trip = {
    ...existing,
    status: 'archived',
    archivedFromStatus: existing.status,
    updatedAt: new Date().toISOString(),
  }

  await tripRepository.put(archived)
  return archived
}

export async function restoreArchivedTrip(tripId: string): Promise<Trip> {
  const existing = await tripRepository.get(tripId)
  if (!existing) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (existing.status !== 'archived') return existing

  const restoredStatus = existing.archivedFromStatus ?? 'planned'
  const { archivedFromStatus: _archivedFromStatus, ...rest } = existing
  const restored: Trip = {
    ...rest,
    status: restoredStatus,
    updatedAt: new Date().toISOString(),
  }

  await tripRepository.put(restored)
  return restored
}
