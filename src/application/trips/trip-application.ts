import type { Trip, TripStatus } from '../../domain/entities'
import { isDayDateWithinTripRange } from '../../domain/trip-calendar'
import { normalizeCurrencyCode } from '../../lib/currency'
import type { TripApplicationDependencies } from './ports'

export type EditableTripStatus = Exclude<TripStatus, 'archived'>

export interface TripDraft {
  title: string
  subtitle?: string
  status: EditableTripStatus
  startDate?: string
  endDate?: string
  summary?: string
  currency?: string
  budgetMinor?: number
}

export interface TripApplication {
  listBookTrips(): Promise<Trip[]>
  listArchivedTrips(): Promise<Trip[]>
  getTrip(tripId: string): Promise<Trip | undefined>
  createTrip(input: TripDraft): Promise<Trip>
  updateTrip(tripId: string, input: TripDraft): Promise<Trip>
  archiveTrip(tripId: string): Promise<Trip>
  restoreArchivedTrip(tripId: string): Promise<Trip>
}

const editableStatuses = new Set<TripStatus>(['planned', 'ongoing', 'completed'])

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function validateDraft(input: TripDraft): TripDraft {
  const title = input.title.trim()
  if (!title) throw new Error('Il titolo del viaggio è obbligatorio.')
  if (title.length > 120) throw new Error('Il titolo del viaggio è troppo lungo.')
  if (!editableStatuses.has(input.status)) throw new Error('Lo stato del viaggio non è valido.')

  const startDate = cleanOptional(input.startDate)
  const endDate = cleanOptional(input.endDate)
  if (startDate && endDate && endDate < startDate) {
    throw new Error(
      `Date del viaggio non valide: il ritorno (${formatDisplayDate(endDate)}) precede la partenza (${formatDisplayDate(startDate)}).`,
    )
  }

  const currency = cleanOptional(input.currency)?.toUpperCase()
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('La valuta deve essere un codice ISO di tre lettere, ad esempio EUR.')
  }

  const budgetMinor = input.budgetMinor
  if (budgetMinor !== undefined) {
    if (!currency) throw new Error('Imposta una valuta prima di definire il budget.')
    normalizeCurrencyCode(currency)
    if (!Number.isSafeInteger(budgetMinor) || budgetMinor <= 0) {
      throw new Error('Il budget deve essere un importo valido maggiore di zero.')
    }
  }

  return {
    title,
    subtitle: cleanOptional(input.subtitle),
    status: input.status,
    startDate,
    endDate,
    summary: cleanOptional(input.summary),
    currency,
    budgetMinor,
  }
}

function tripSortValue(trip: Trip): string {
  return trip.startDate ?? trip.createdAt
}

function describeRange(range: Pick<Trip, 'startDate' | 'endDate'>): string {
  if (range.startDate && range.endDate) {
    return `dal ${formatDisplayDate(range.startDate)} al ${formatDisplayDate(range.endDate)}`
  }
  if (range.startDate) return `a partire dal ${formatDisplayDate(range.startDate)}`
  if (range.endDate) return `fino al ${formatDisplayDate(range.endDate)}`
  return 'senza limiti di data'
}

export function createTripApplication(dependencies: TripApplicationDependencies): TripApplication {
  const { trips, days, now, newId } = dependencies

  async function assertExistingDaysFitRange(
    tripId: string,
    range: Pick<Trip, 'startDate' | 'endDate'>,
  ): Promise<void> {
    const invalidDays = (await days.list())
      .filter((day) => day.tripId === tripId && !isDayDateWithinTripRange(range, day.date))
      .sort((left, right) => left.date.localeCompare(right.date))

    if (invalidDays.length === 0) return

    const first = invalidDays[0]
    const extra = invalidDays.length > 1 ? ` Ci sono anche altre ${invalidDays.length - 1} giornate fuori intervallo.` : ''
    throw new Error(
      `Non posso salvare queste date: la giornata del ${formatDisplayDate(first.date)} resterebbe fuori dal nuovo intervallo ${describeRange(range)}.`
        + `${extra} Modifica prima le giornate interessate oppure amplia l’intervallo del viaggio.`,
    )
  }

  return {
    async listBookTrips(): Promise<Trip[]> {
      return (await trips.list())
        .filter((trip) => trip.status !== 'archived')
        .sort((left, right) => tripSortValue(left).localeCompare(tripSortValue(right)))
    },

    async listArchivedTrips(): Promise<Trip[]> {
      return (await trips.list())
        .filter((trip) => trip.status === 'archived')
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    },

    getTrip(tripId: string): Promise<Trip | undefined> {
      return trips.get(tripId)
    },

    async createTrip(input: TripDraft): Promise<Trip> {
      const draft = validateDraft(input)
      const timestamp = now()
      const trip: Trip = {
        id: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        ...draft,
      }
      await trips.put(trip)
      return trip
    },

    async updateTrip(tripId: string, input: TripDraft): Promise<Trip> {
      const existing = await trips.get(tripId)
      if (!existing) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (existing.status === 'archived') {
        throw new Error('Ripristina il viaggio dall’archivio prima di modificarlo.')
      }

      const draft = validateDraft(input)
      const dateRangeChanged = draft.startDate !== existing.startDate || draft.endDate !== existing.endDate
      if (dateRangeChanged) await assertExistingDaysFitRange(tripId, draft)

      const updated: Trip = {
        ...existing,
        ...draft,
        archivedFromStatus: undefined,
        updatedAt: now(),
      }
      await trips.put(updated)
      return updated
    },

    async archiveTrip(tripId: string): Promise<Trip> {
      const existing = await trips.get(tripId)
      if (!existing) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (existing.status === 'archived') return existing

      const archived: Trip = {
        ...existing,
        status: 'archived',
        archivedFromStatus: existing.status,
        updatedAt: now(),
      }
      await trips.put(archived)
      return archived
    },

    async restoreArchivedTrip(tripId: string): Promise<Trip> {
      const existing = await trips.get(tripId)
      if (!existing) throw new Error('Il viaggio non esiste o è stato eliminato.')
      if (existing.status !== 'archived') return existing

      const restoredStatus = existing.archivedFromStatus ?? 'planned'
      const { archivedFromStatus: _archivedFromStatus, ...rest } = existing
      const restored: Trip = {
        ...rest,
        status: restoredStatus,
        updatedAt: now(),
      }
      await trips.put(restored)
      return restored
    },
  }
}
