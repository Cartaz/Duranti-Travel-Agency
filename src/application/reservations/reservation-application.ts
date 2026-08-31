import type { Block, Media, Place, Reservation } from '../../domain/entities'
import { reservationTypeForBlockType } from '../../domain/reservation-itinerary-mapping'
import { assertTripDayContext, requireTripDay } from '../shared/trip-day-context'
import type { ReservationApplicationDependencies } from './ports'

export type PlannerReservationType = Extract<Reservation['type'], 'transport' | 'accommodation' | 'restaurant' | 'activity'>
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

export interface ReservationAttachmentResult {
  reservation: Reservation
  media: Media
}

export const EMPTY_RESERVATION_DRAFT: ReservationDraft = { title: '', status: 'planned' }
export const MAX_RESERVATION_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const RESERVATION_ATTACHMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/gif'

const statuses = new Set<PlannerReservationStatus>(['planned', 'booked', 'completed', 'cancelled'])
const allowedAttachmentMimeTypes = new Set(RESERVATION_ATTACHMENT_ACCEPT.split(','))
const attachmentMimeByExtension: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
}

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
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cleaned)) throw new Error(`${label}: data e ora non valide.`)
  const [date, time] = cleaned.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`${label}: data e ora non esistono nel calendario.`)
  }
  return cleaned
}

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}

function formatDisplayDateTime(value: string): string {
  const [date, time] = value.split('T')
  return `${formatDisplayDate(date)}, ${time}`
}

function timingLabels(type: PlannerReservationType): { start: string; end: string; subject: string } {
  switch (type) {
    case 'transport': return { start: 'partenza', end: 'arrivo', subject: 'trasporto' }
    case 'accommodation': return { start: 'check-in', end: 'check-out', subject: 'alloggio' }
    case 'restaurant': return { start: 'inizio', end: 'fine', subject: 'ristorante' }
    default: return { start: 'inizio', end: 'fine', subject: 'attività' }
  }
}

function validateTimezone(value: string | undefined): string | undefined {
  const cleaned = validateOptionalText(value, 'Fuso orario', 100)
  if (!cleaned) return undefined
  try { new Intl.DateTimeFormat('en-US', { timeZone: cleaned }).format(new Date()) } catch {
    throw new Error('Il fuso orario non è valido. Usa un nome IANA, ad esempio Europe/Paris.')
  }
  return cleaned
}

function validateUrl(value: string | undefined): string | undefined {
  const cleaned = cleanOptional(value)
  if (!cleaned) return undefined
  if (cleaned.length > 2048) throw new Error('Il link della prenotazione è troppo lungo.')
  let parsed: URL
  try { parsed = new URL(cleaned) } catch { throw new Error('Il link della prenotazione non è un URL valido.') }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Il link della prenotazione deve usare http o https.')
  return parsed.toString()
}

function reservationIdFromBlock(block: Block): string | undefined {
  const value = block.content.reservationId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il riferimento alla prenotazione del blocco non è valido.')
  return value
}

function assertReservationContext(reservation: Reservation, tripId: string, dayId: string, type: PlannerReservationType): void {
  if (reservation.tripId !== tripId || reservation.dayId !== dayId || reservation.type !== type) {
    throw new Error('La prenotazione collegata non appartiene a questo blocco.')
  }
}

function assertAttachmentContext(media: Media, tripId: string, dayId: string, blockId: string): void {
  if (media.tripId !== tripId || media.dayId !== dayId || media.blockId !== blockId) throw new Error('L’allegato non appartiene a questa prenotazione.')
  if (media.kind !== 'image' && media.kind !== 'document') throw new Error('Il media collegato non è un allegato supportato.')
}

function attachmentDescriptor(file: File): { mimeType: string; kind: Extract<Media['kind'], 'image' | 'document'>; originalName: string } {
  if (file.size <= 0) throw new Error('Il file selezionato è vuoto.')
  if (file.size > MAX_RESERVATION_ATTACHMENT_BYTES) throw new Error('L’allegato supera il limite di 25 MiB.')
  const originalName = file.name.trim()
  if (!originalName) throw new Error('Il file deve avere un nome.')
  if (originalName.length > 255) throw new Error('Il nome del file è troppo lungo.')
  const declaredMime = file.type.trim().toLowerCase().split(';')[0]
  const extension = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : ''
  const extensionMime = attachmentMimeByExtension[extension]
  const mimeType = declaredMime || extensionMime
  if (!mimeType || !allowedAttachmentMimeTypes.has(mimeType)) throw new Error('Formato non supportato. Usa PDF, JPEG, PNG, WebP o GIF.')
  if (declaredMime && extensionMime && declaredMime !== extensionMime) throw new Error('Il tipo del file non corrisponde alla sua estensione.')
  return { mimeType, kind: mimeType.startsWith('image/') ? 'image' : 'document', originalName }
}

export interface ReservationApplication {
  reservationToDraft(reservation: Reservation): ReservationDraft
  listSavedPlaces(): Promise<Place[]>
  getPlannerReservation(tripId: string, dayId: string, blockId: string): Promise<Reservation | undefined>
  getPlannerReservationAttachment(tripId: string, dayId: string, blockId: string, reservation: Reservation): Promise<Media | undefined>
  readPlannerReservationAttachment(media: Media): Promise<File>
  attachPlannerReservationFile(tripId: string, dayId: string, blockId: string, file: File): Promise<ReservationAttachmentResult>
  removePlannerReservationAttachment(tripId: string, dayId: string, blockId: string): Promise<Reservation>
  savePlannerReservation(tripId: string, dayId: string, blockId: string, input: ReservationDraft): Promise<Reservation>
  deletePlannerReservationBlock(tripId: string, dayId: string, blockId: string): Promise<void>
}

export function createReservationApplication(deps: ReservationApplicationDependencies): ReservationApplication {
  const contextDependencies = { trips: deps.trips, days: deps.days }

  async function getReservationBlock(tripId: string, dayId: string, blockId: string): Promise<Block> {
    const block = await deps.blocks.get(blockId)
    if (!block || block.tripId !== tripId || block.dayId !== dayId || !reservationTypeForBlockType(block.type)) {
      throw new Error('Il blocco prenotazione non appartiene a questa giornata.')
    }
    return block
  }

  async function assertReservationDayContext(tripId: string, dayId: string, editable: boolean): Promise<void> {
    await assertTripDayContext(contextDependencies, tripId, dayId, editable, 'Ripristina il viaggio prima di modificare le prenotazioni.')
  }

  async function normalizeDraft(
    tripId: string,
    dayId: string,
    reservationType: PlannerReservationType,
    input: ReservationDraft,
    currentPlaceId?: string,
  ): Promise<ReservationDraft> {
    const { trip, day } = await requireTripDay(contextDependencies, tripId, dayId)
    const title = input.title.trim()
    if (!title) throw new Error('Il titolo della prenotazione è obbligatorio.')
    if (title.length > 200) throw new Error('Il titolo della prenotazione è troppo lungo.')
    if (!statuses.has(input.status)) throw new Error('Lo stato della prenotazione non è valido.')
    const labels = timingLabels(reservationType)
    const startsAt = validateLocalDateTime(input.startsAt, `Ora di ${labels.start}`)
    const endsAt = validateLocalDateTime(input.endsAt, `Ora/data di ${labels.end}`)
    if (endsAt && !startsAt) throw new Error(`Inserisci prima l’ora di ${labels.start}: senza un inizio non è possibile impostare ${labels.end}.`)
    if (startsAt && startsAt.slice(0, 10) !== day.date) {
      throw new Error(`Data di ${labels.start} non valida: questo blocco ${labels.subject} appartiene alla giornata del ${formatDisplayDate(day.date)}. La ${labels.start} deve iniziare il ${formatDisplayDate(day.date)}.`)
    }
    if (startsAt && endsAt && endsAt < startsAt) {
      throw new Error(`${labels.end[0].toUpperCase()}${labels.end.slice(1)} non valid${labels.end === 'arrivo' ? 'o' : 'a'}: ${formatDisplayDateTime(endsAt)} precede ${labels.start} (${formatDisplayDateTime(startsAt)}).`)
    }
    if (endsAt && trip.endDate && endsAt.slice(0, 10) > trip.endDate) {
      throw new Error(`Data di ${labels.end} non valida: ${formatDisplayDate(endsAt.slice(0, 10))} supera il ritorno del viaggio, fissato al ${formatDisplayDate(trip.endDate)}.`)
    }
    const placeId = cleanOptional(input.placeId)
    if (placeId && placeId !== currentPlaceId && !(await deps.places.get(placeId))) throw new Error('Il luogo associato non esiste più.')
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

  function reservationToDraft(reservation: Reservation): ReservationDraft {
    return {
      title: reservation.title, provider: reservation.provider, confirmationCode: reservation.confirmationCode,
      startsAt: reservation.startsAt, endsAt: reservation.endsAt, timezone: reservation.timezone,
      placeId: reservation.placeId, url: reservation.url, notes: reservation.notes, status: reservation.status ?? 'planned',
    }
  }

  async function listSavedPlaces(): Promise<Place[]> {
    return (await deps.places.list()).sort((left, right) => left.name.localeCompare(right.name, 'it'))
  }

  async function getPlannerReservation(tripId: string, dayId: string, blockId: string): Promise<Reservation | undefined> {
    await assertReservationDayContext(tripId, dayId, false)
    const block = await getReservationBlock(tripId, dayId, blockId)
    const type = reservationTypeForBlockType(block.type)
    if (!type) throw new Error('Tipo di prenotazione non supportato.')
    const reservationId = reservationIdFromBlock(block)
    if (!reservationId) return undefined
    const reservation = await deps.reservations.get(reservationId)
    if (!reservation) return undefined
    assertReservationContext(reservation, tripId, dayId, type)
    return reservation
  }

  async function getPlannerReservationAttachment(tripId: string, dayId: string, blockId: string, reservation: Reservation): Promise<Media | undefined> {
    if (!reservation.attachmentMediaId) return undefined
    assertReservationContext(reservation, tripId, dayId, reservation.type as PlannerReservationType)
    const media = await deps.media.get(reservation.attachmentMediaId)
    if (!media) throw new Error('I metadati dell’allegato non sono più disponibili.')
    assertAttachmentContext(media, tripId, dayId, blockId)
    return media
  }

  async function readPlannerReservationAttachment(media: Media): Promise<File> {
    return deps.media.getFile(media.id)
  }

  async function attachPlannerReservationFile(tripId: string, dayId: string, blockId: string, file: File): Promise<ReservationAttachmentResult> {
    await assertReservationDayContext(tripId, dayId, true)
    const reservation = await getPlannerReservation(tripId, dayId, blockId)
    if (!reservation) throw new Error('Salva prima la prenotazione, poi aggiungi l’allegato.')
    const descriptor = attachmentDescriptor(file)
    const previousMediaId = reservation.attachmentMediaId
    const result = await deps.transactions.attachReservationFile(blockId, tripId, dayId, reservation.id, descriptor, file)
    if (previousMediaId && previousMediaId !== result.media.id) {
      try { await deps.media.purge(previousMediaId) } catch { /* tombstone remains authoritative */ }
    }
    return result
  }

  async function removePlannerReservationAttachment(tripId: string, dayId: string, blockId: string): Promise<Reservation> {
    await assertReservationDayContext(tripId, dayId, true)
    const reservation = await getPlannerReservation(tripId, dayId, blockId)
    if (!reservation) throw new Error('La prenotazione non esiste ancora.')
    if (!reservation.attachmentMediaId) return reservation
    const previousMediaId = reservation.attachmentMediaId
    const updated = await deps.transactions.removeReservationAttachment(blockId, tripId, dayId, reservation.id)
    try { await deps.media.purge(previousMediaId) } catch { /* metadata tombstone is authoritative */ }
    return updated
  }

  async function savePlannerReservation(tripId: string, dayId: string, blockId: string, input: ReservationDraft): Promise<Reservation> {
    await assertReservationDayContext(tripId, dayId, true)
    const block = await getReservationBlock(tripId, dayId, blockId)
    const reservationType = reservationTypeForBlockType(block.type)
    if (!reservationType) throw new Error('Tipo di prenotazione non supportato.')
    const reservationId = reservationIdFromBlock(block)
    const current = reservationId ? await deps.reservations.get(reservationId) : undefined
    if (current) assertReservationContext(current, tripId, dayId, reservationType)
    const draft = await normalizeDraft(tripId, dayId, reservationType, input, current?.placeId)
    const now = deps.now()
    const reservation: Reservation = current
      ? { ...current, ...draft, type: reservationType, tripId, dayId, updatedAt: now }
      : { id: deps.newId(), ...draft, type: reservationType, tripId, dayId, createdAt: now, updatedAt: now }
    await deps.transactions.saveReservationForBlock(blockId, tripId, dayId, reservation)
    return reservation
  }

  async function deletePlannerReservationBlock(tripId: string, dayId: string, blockId: string): Promise<void> {
    await assertReservationDayContext(tripId, dayId, true)
    await deps.transactions.softDeleteReservationBlock(blockId, tripId, dayId)
  }

  return {
    reservationToDraft, listSavedPlaces, getPlannerReservation, getPlannerReservationAttachment,
    readPlannerReservationAttachment, attachPlannerReservationFile, removePlannerReservationAttachment,
    savePlannerReservation, deletePlannerReservationBlock,
  }
}
