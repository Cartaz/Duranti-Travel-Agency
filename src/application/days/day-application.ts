import type { Day, Trip } from '../../domain/entities'
import { normalizeDateOnly } from '../../domain/date-only'
import { assertDayDateWithinTripRange } from '../../domain/trip-calendar'
import type { DayApplicationDependencies } from './ports'

export interface DayDraft {
  date: string
  title?: string
  summary?: string
  journalText?: string
}

export type PreparedTripDay = Omit<Day, 'sequence'>

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

function validateDraft(input: DayDraft): DayDraft {
  const title = cleanOptional(input.title)
  if (title && title.length > 120) throw new Error('Il titolo della giornata è troppo lungo.')

  const summary = cleanOptional(input.summary)
  if (summary && summary.length > 2000) throw new Error('Il riepilogo della giornata è troppo lungo.')

  const journalText = cleanOptional(input.journalText)
  if (journalText && journalText.length > 20_000) {
    throw new Error('Il diario della giornata supera il limite di 20.000 caratteri.')
  }

  return {
    date: normalizeDateOnly(input.date, 'La data della giornata'),
    title,
    summary,
    journalText,
  }
}

export function prepareTripDay(
  trip: Trip,
  input: DayDraft,
  now: string,
  newId: () => string,
): PreparedTripDay {
  if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare le sue giornate.')
  const draft = validateDraft(input)
  assertDayDateWithinTripRange(trip, draft.date)
  return {
    id: newId(),
    tripId: trip.id,
    createdAt: now,
    updatedAt: now,
    ...draft,
  }
}

export interface DayApplication {
  listTripDays(tripId: string): Promise<Day[]>
  getTripDay(tripId: string, dayId: string): Promise<Day | undefined>
  createTripDay(tripId: string, input: DayDraft): Promise<Day>
  updateTripDay(tripId: string, dayId: string, input: DayDraft): Promise<Day>
}

export function createDayApplication(deps: DayApplicationDependencies): DayApplication {
  async function getEditableTrip(tripId: string): Promise<Trip> {
    const trip = await deps.trips.getTrip(tripId)
    if (!trip) throw new Error('Il viaggio non esiste o è stato eliminato.')
    if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare le sue giornate.')
    return trip
  }

  async function listTripDays(tripId: string): Promise<Day[]> {
    return (await deps.days.listByTrip(tripId))
      .sort((left, right) => left.sequence - right.sequence || left.date.localeCompare(right.date))
  }

  async function getTripDay(tripId: string, dayId: string): Promise<Day | undefined> {
    const day = await deps.days.get(dayId)
    return day?.tripId === tripId ? day : undefined
  }

  async function createTripDay(tripId: string, input: DayDraft): Promise<Day> {
    const trip = await getEditableTrip(tripId)
    const prepared = prepareTripDay(trip, input, deps.now(), deps.newId)
    return deps.days.appendToTrip(prepared)
  }

  async function updateTripDay(tripId: string, dayId: string, input: DayDraft): Promise<Day> {
    const trip = await getEditableTrip(tripId)
    const existing = await getTripDay(tripId, dayId)
    if (!existing) throw new Error('La giornata non esiste in questo viaggio.')

    const draft = validateDraft(input)
    assertDayDateWithinTripRange(trip, draft.date)

    const updated: Day = {
      ...existing,
      ...draft,
      updatedAt: deps.now(),
    }

    await deps.days.put(updated)
    return updated
  }

  return { listTripDays, getTripDay, createTripDay, updateTripDay }
}
