import type { Block, Place, Reservation } from '../../domain/entities'
import { reservationBlockRepository } from '../../data/repositories/reservation-block-repository'
import { blockRepository, placeRepository, reservationRepository } from '../../data/repositories/repositories'
import { getTripDay } from '../days/day-service'
import { assertPlannerDayContext } from '../planner/block-service'
import { getTrip } from '../trips/trip-service'

export type PlannerReservationType = Extract<Reservation['type'], 'transport' | 'accommodation'>
export type PlannerReservationStatus = NonNullable<Reservation['status']>

export interface ReservationDraft {
  title: string
  provider?: string
  confirmationCode?: string
  startsAt?: string
  endsAt?: string
  timezone?: string
  placeId?: string
  url?: string
  notes?: string
  status: PlannerReservationStatus
}

export const EMPTY_RESERVATION_DRAFT: ReservationDraft = {
  title: '',
  status: 'planned',
}

const statuses = new Set<PlannerReservationStatus>(['planned', 'booked', 'completed', 'cancelled'])

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

function validateOptionalText(value: string | undefined, label: string, maxLength: number): string | undefined {
  const cleaned = cleanOptional(value)
  if (cleaned && cleaned.length > maxLength) throw new Error(`${label}: valore troppo lungo.`)
  return cleaned
}

function validateLocalDateTime(value: string | undefined, label: string): string | undefined {
  const cleaned = cleanOptional(value)
  if (!cleaned) return undefined
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cleaned)) {
    throw new Error(`${label}: data e ora non valide.`)
  }

  const [date, time] = cleaned.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59
  ) {
    throw new Error(`${label}: data e ora non esistono nel calendario.`)
  }

  return cleaned
}

function validateTimezone(value: string | undefined): string | undefined {
  const cleaned = validateOptionalText(value, 'Fuso orario', 100)
  if (!cleaned) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: cleaned }).format(new Date())
  } catch {
    throw new Error('Il fuso orario non è valido. Usa un nome IANA, ad esempio Europe/Paris.')
  }
  return cleaned
}

function validateUrl(value: string | undefined): string | undefined {
  const cleaned = cleanOptional(value)
  if (!cleaned) return undefined
  if (cleaned.length > 2048) throw new Error('Il link della prenotazione è troppo lungo.')
  let parsed: URL
  try {
    parsed = new URL(cleaned)
  } catch {
    throw new Error('Il link della prenotazione non è un URL valido.')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Il link della prenotazione deve usare http o https.')
  }
  return parsed.toString()
}

function reservationTypeFromBlock(block: Block): PlannerReservationType | undefined {
  if (block.type === 'transport') return 'transport'
  if (block.type === 'accommodation') return 'accommodation'
  return undefined
}

function reservationIdFromBlock(block: Block): string | undefined {
  const value = block.content.reservationId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il riferimento alla prenotazione del blocco non è valido.')
  return value
}

function assertReservationContext(
  reservation: Reservation,
  tripId: string,
  dayId: string,
  type: PlannerReservationType,
): void {
  if (
    reservation.tripId !== tripId ||
    reservation.dayId !== dayId ||
    reservation.type !== type
  ) {
    throw new Error('La prenotazione collegata non appartiene a questo blocco.')
  }
}

async function getReservationBlock(tripId: string, dayId: string, blockId: string): Promise<Block> {
  const block = await blockRepository.get(blockId)
  if (!block || block.tripId !== tripId || block.dayId !== dayId || !reservationTypeFromBlock(block)) {
    throw new Error('Il blocco prenotazione non appartiene a questa giornata.')
  }
  return block
}

async function normalizeDraft(
  tripId: string,
  dayId: string,
  input: ReservationDraft,
): Promise<ReservationDraft> {
  const trip = await getTrip(tripId)
  const day = await getTripDay(tripId, dayId)
  if (!trip || !day) throw new Error('Viaggio o giornata non disponibili.')

  const title = input.title.trim()
  if (!title) throw new Error('Il titolo della prenotazione è obbligatorio.')
  if (title.length > 200) throw new Error('Il titolo della prenotazione è troppo lungo.')
  if (!statuses.has(input.status)) throw new Error('Lo stato della prenotazione non è valido.')

  const startsAt = validateLocalDateTime(input.startsAt, 'Inizio')
  const endsAt = validateLocalDateTime(input.endsAt, 'Fine')
  if (endsAt && !startsAt) throw new Error('Inserisci l’inizio prima della fine.')
  if (startsAt && startsAt.slice(0, 10) !== day.date) {
    throw new Error('L’inizio della prenotazione deve cadere nella giornata a cui è collegata.')
  }
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new Error('La fine non può precedere l’inizio.')
  }
  if (endsAt && trip.endDate && endsAt.slice(0, 10) > trip.endDate) {
    throw new Error('La fine della prenotazione non può superare la data di ritorno del viaggio.')
  }

  const placeId = cleanOptional(input.placeId)
  if (placeId && !(await placeRepository.get(placeId))) {
    throw new Error('Il luogo associato non esiste più.')
  }

  return {
    title,
    provider: validateOptionalText(input.provider, 'Fornitore', 200),
    confirmationCode: validateOptionalText(input.confirmationCode, 'Codice prenotazione', 200),
    startsAt,
    endsAt,
    timezone: validateTimezone(input.timezone),
    placeId,
    url: validateUrl(input.url),
    notes: validateOptionalText(input.notes, 'Note', 4000),
    status: input.status,
  }
}

export function reservationToDraft(reservation: Reservation): ReservationDraft {
  return {
    title: reservation.title,
    provider: reservation.provider,
    confirmationCode: reservation.confirmationCode,
    startsAt: reservation.startsAt,
    endsAt: reservation.endsAt,
    timezone: reservation.timezone,
    placeId: reservation.placeId,
    url: reservation.url,
    notes: reservation.notes,
    status: reservation.status ?? 'planned',
  }
}

export async function listSavedPlaces(): Promise<Place[]> {
  return (await placeRepository.list())
    .sort((left, right) => left.name.localeCompare(right.name, 'it'))
}

export async function getPlannerReservation(
  tripId: string,
  dayId: string,
  blockId: string,
): Promise<Reservation | undefined> {
  await assertPlannerDayContext(tripId, dayId, false)
  const block = await getReservationBlock(tripId, dayId, blockId)
  const type = reservationTypeFromBlock(block)
  if (!type) throw new Error('Tipo di prenotazione non supportato.')

  const reservationId = reservationIdFromBlock(block)
  if (!reservationId) return undefined
  const reservation = await reservationRepository.get(reservationId)
  if (!reservation) return undefined
  assertReservationContext(reservation, tripId, dayId, type)
  return reservation
}

export async function savePlannerReservation(
  tripId: string,
  dayId: string,
  blockId: string,
  input: ReservationDraft,
): Promise<Reservation> {
  await assertPlannerDayContext(tripId, dayId, true)
  const block = await getReservationBlock(tripId, dayId, blockId)
  const reservationType = reservationTypeFromBlock(block)
  if (!reservationType) throw new Error('Tipo di prenotazione non supportato.')

  const reservationId = reservationIdFromBlock(block)
  const current = reservationId ? await reservationRepository.get(reservationId) : undefined
  if (current) assertReservationContext(current, tripId, dayId, reservationType)

  const draft = await normalizeDraft(tripId, dayId, input)
  const now = new Date().toISOString()

  const reservation: Reservation = current
    ? {
        ...current,
        ...draft,
        type: reservationType,
        tripId,
        dayId,
        updatedAt: now,
      }
    : {
        id: crypto.randomUUID(),
        ...draft,
        type: reservationType,
        tripId,
        dayId,
        createdAt: now,
        updatedAt: now,
      }

  await reservationBlockRepository.saveReservationForBlock(blockId, tripId, dayId, reservation)
  return reservation
}

export async function deletePlannerReservationBlock(
  tripId: string,
  dayId: string,
  blockId: string,
): Promise<void> {
  await assertPlannerDayContext(tripId, dayId, true)
  await reservationBlockRepository.softDeleteReservationBlock(blockId, tripId, dayId)
}
