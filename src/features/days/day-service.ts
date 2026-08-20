import type { Day, Trip } from '../../domain/entities'
import { assertDayDateWithinTripRange } from '../../domain/trip-calendar'
import { dayRepository } from '../../data/repositories/repositories'
import { getTrip } from '../trips/trip-service'

export interface DayDraft {
  date: string
  title?: string
  summary?: string
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

  return {
    date: validateDate(input.date),
    title,
    summary,
  }
}

async function getEditableTrip(tripId: string): Promise<Trip> {
  const trip = await getTrip(tripId)
  if (!trip) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di modificare le sue giornate.')
  return trip
}

export async function listTripDays(tripId: string): Promise<Day[]> {
  const days = await dayRepository.list()
  return days
    .filter((day) => day.tripId === tripId)
    .sort((left, right) => left.sequence - right.sequence || left.date.localeCompare(right.date))
}

export async function getTripDay(tripId: string, dayId: string): Promise<Day | undefined> {
  const day = await dayRepository.get(dayId)
  return day?.tripId === tripId ? day : undefined
}

export async function createTripDay(tripId: string, input: DayDraft): Promise<Day> {
  const trip = await getEditableTrip(tripId)
  const draft = validateDraft(input)
  assertDayDateWithinTripRange(trip, draft.date)

  const days = await listTripDays(tripId)
  const now = new Date().toISOString()
  const nextSequence = days.reduce((maximum, day) => Math.max(maximum, day.sequence), 0) + 1

  const entity: Day = {
    id: crypto.randomUUID(),
    tripId,
    sequence: nextSequence,
    createdAt: now,
    updatedAt: now,
    ...draft,
  }

  await dayRepository.put(entity)
  return entity
}

export async function updateTripDay(tripId: string, dayId: string, input: DayDraft): Promise<Day> {
  const trip = await getEditableTrip(tripId)
  const existing = await getTripDay(tripId, dayId)
  if (!existing) throw new Error('La giornata non esiste in questo viaggio.')

  const draft = validateDraft(input)
  assertDayDateWithinTripRange(trip, draft.date)

  const updated: Day = {
    ...existing,
    ...draft,
    updatedAt: new Date().toISOString(),
  }

  await dayRepository.put(updated)
  return updated
}
