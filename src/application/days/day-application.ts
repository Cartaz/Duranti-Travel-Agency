import type { Day, Trip } from '../../domain/entities'
import { assertDayDateWithinTripRange } from '../../domain/trip-calendar'
import type { DayApplicationDependencies } from './ports'

export interface DayDraft {
  date: string
  title?: string
  summary?: string
  journalText?: string
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

function validateDate(value: string): string {
  const date = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('La data della giornata non è valida.')

  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error('La data della giornata non esiste nel calendario.')
  }

  return date
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
    date: validateDate(input.date),
    title,
    summary,
    journalText,
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
    const draft = validateDraft(input)
    assertDayDateWithinTripRange(trip, draft.date)

    const days = await listTripDays(tripId)
    const now = deps.now()
    const nextSequence = days.reduce((maximum, day) => Math.max(maximum, day.sequence), 0) + 1

    const entity: Day = {
      id: deps.newId(),
      tripId,
      sequence: nextSequence,
      createdAt: now,
      updatedAt: now,
      ...draft,
    }

    await deps.days.put(entity)
    return entity
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
