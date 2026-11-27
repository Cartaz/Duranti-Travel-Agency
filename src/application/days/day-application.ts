import type { Day } from '../../domain/entities'
import { normalizeDateOnly } from '../../domain/date-only'
import { purgeDeletedFiles, type DeletionOutcome } from '../shared/purge.ts'
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

export function normalizeDayDraft(input: DayDraft): DayDraft {
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

export interface DayApplication {
  listTripDays(tripId: string): Promise<Day[]>
  getTripDay(tripId: string, dayId: string): Promise<Day | undefined>
  createTripDay(tripId: string, input: DayDraft): Promise<Day>
  updateTripDay(tripId: string, dayId: string, input: DayDraft): Promise<Day>
  /** Deletes the day with its blocks, reservations, itinerary, expenses and media. */
  deleteTripDay(tripId: string, dayId: string): Promise<DeletionOutcome>
}

export function createDayApplication(deps: DayApplicationDependencies): DayApplication {
  async function listTripDays(tripId: string): Promise<Day[]> {
    return (await deps.days.listByTrip(tripId)).sort(
      (left, right) => left.sequence - right.sequence || left.date.localeCompare(right.date),
    )
  }

  async function getTripDay(tripId: string, dayId: string): Promise<Day | undefined> {
    const day = await deps.days.get(dayId)
    return day?.tripId === tripId ? day : undefined
  }

  async function createTripDay(tripId: string, input: DayDraft): Promise<Day> {
    const draft = normalizeDayDraft(input)
    const now = deps.now()
    return deps.days.createForTrip({
      id: deps.newId(),
      tripId,
      createdAt: now,
      updatedAt: now,
      ...draft,
    })
  }

  async function updateTripDay(tripId: string, dayId: string, input: DayDraft): Promise<Day> {
    const existing = await getTripDay(tripId, dayId)
    if (!existing) throw new Error('La giornata non esiste in questo viaggio.')

    const updated: Day = {
      ...existing,
      ...normalizeDayDraft(input),
      updatedAt: deps.now(),
    }
    return deps.days.updateForTrip(updated)
  }

  async function deleteTripDay(tripId: string, dayId: string): Promise<DeletionOutcome> {
    const { mediaIds } = await deps.deletion.softDeleteDayWithContent(tripId, dayId)
    return purgeDeletedFiles(mediaIds, (id) => deps.media.purge(id))
  }

  return { listTripDays, getTripDay, createTripDay, updateTripDay, deleteTripDay }
}
