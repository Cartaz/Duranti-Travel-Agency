import type { Block, Day, Itinerary, Place, Reservation } from '../../domain/entities'
import { assertTripDayContext, requireTrip, requireTripDay } from '../shared/trip-day-context'
import type { ItineraryApplicationDependencies } from './ports'

export type ItinerarySource = 'manual' | 'reservation'
export type ItinerarySyncState = 'manual' | 'synced' | 'needs-sync' | 'orphaned'
export type EditableItineraryType = NonNullable<Itinerary['type']>
export type EditableItineraryStatus = NonNullable<Itinerary['status']>
export type ManualItineraryMoveDirection = 'up' | 'down'
export type OrphanResolutionAction = 'convert-to-manual' | 'delete'

export interface DayItineraryItem { itinerary: Itinerary; place?: Place; source: ItinerarySource; syncState: ItinerarySyncState }
export interface ItineraryDraft {
  title: string
  type: EditableItineraryType
  status: EditableItineraryStatus
  startsAt?: string
  endsAt?: string
  timezone?: string
  placeId?: string
  bookingReference?: string
  notes?: string
}
export interface TripItineraryDay { day: Day; items: DayItineraryItem[] }
export interface TripItineraryOverview { days: TripItineraryDay[]; stopCount: number; warningCount: number }
export const EMPTY_ITINERARY_DRAFT: ItineraryDraft = { title: '', type: 'custom', status: 'planned' }

export interface ItineraryApplication {
  itineraryToDraft(itinerary: Itinerary): ItineraryDraft
  listItineraryPlaces(): Promise<Place[]>
  listDayItineraryItems(tripId: string, dayId: string): Promise<DayItineraryItem[]>
  saveManualItineraryItem(tripId: string, dayId: string, itineraryId: string | undefined, input: ItineraryDraft): Promise<Itinerary>
  deleteManualItineraryItem(tripId: string, dayId: string, itineraryId: string): Promise<void>
  reconcileDayReservationItineraries(tripId: string, dayId: string): Promise<number>
  moveManualUntimedItineraryItem(tripId: string, dayId: string, itineraryId: string, direction: ManualItineraryMoveDirection): Promise<boolean>
  resolveOrphanedItineraryItem(tripId: string, dayId: string, itineraryId: string, action: OrphanResolutionAction): Promise<void>
  listTripItineraryOverview(tripId: string): Promise<TripItineraryOverview>
}

const itineraryTypes = new Set<EditableItineraryType>(['transport', 'activity', 'meal', 'reservation', 'free-time', 'custom'])
const itineraryStatuses = new Set<EditableItineraryStatus>(['idea', 'planned', 'booked', 'done', 'cancelled'])
const reservationBlockTypes = new Set<Block['type']>(['transport', 'accommodation', 'restaurant', 'activity'])

function cleanOptional(value: string | undefined): string | undefined { const cleaned = value?.trim(); return cleaned ? cleaned : undefined }
function validateOptionalText(value: string | undefined, label: string, maxLength: number): string | undefined {
  const cleaned = cleanOptional(value); if (cleaned && cleaned.length > maxLength) throw new Error(`${label}: valore troppo lungo.`); return cleaned
}
function validateLocalDateTime(value: string | undefined, label: string): string | undefined {
  const cleaned = cleanOptional(value); if (!cleaned) return undefined
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cleaned)) throw new Error(`${label}: data e ora non valide.`)
  const [date, time] = cleaned.split('T'); const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day || hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error(`${label}: data e ora non esistono nel calendario.`)
  return cleaned
}
function validateTimezone(value: string | undefined): string | undefined {
  const cleaned = validateOptionalText(value, 'Fuso orario', 100); if (!cleaned) return undefined
  try { new Intl.DateTimeFormat('en-US', { timeZone: cleaned }).format(new Date()) } catch { throw new Error('Il fuso orario non è valido. Usa un nome IANA, ad esempio Europe/Paris.') }
  return cleaned
}
function reservationIdFromBlock(block: Block | undefined): string | undefined {
  if (!block || !reservationBlockTypes.has(block.type)) return undefined
  const value = block.content.reservationId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il planner contiene un riferimento prenotazione non valido.')
  return value
}
function itineraryTypeForReservation(type: Reservation['type']): Itinerary['type'] {
  switch (type) { case 'transport': return 'transport'; case 'restaurant': return 'meal'; case 'activity': return 'activity'; case 'accommodation': return 'reservation'; default: return 'reservation' }
}
function itineraryStatusForReservation(status: Reservation['status']): Itinerary['status'] {
  switch (status) { case 'booked': return 'booked'; case 'completed': return 'done'; case 'cancelled': return 'cancelled'; default: return 'planned' }
}
function legacyItineraryFromReservation(reservation: Reservation, block: Block): Itinerary {
  return { id: `legacy-reservation:${reservation.id}`, tripId: reservation.tripId, dayId: reservation.dayId, placeId: reservation.placeId, blockId: block.id, reservationId: reservation.id, type: itineraryTypeForReservation(reservation.type), startsAt: reservation.startsAt, endsAt: reservation.endsAt, timezone: reservation.timezone, title: reservation.title, notes: reservation.notes, status: itineraryStatusForReservation(reservation.status), bookingReference: reservation.confirmationCode, position: block.position, createdAt: reservation.createdAt, updatedAt: reservation.updatedAt }
}
function sameOptional(left: string | undefined, right: string | undefined): boolean { return (left ?? undefined) === (right ?? undefined) }
function itineraryMatchesReservation(itinerary: Itinerary, reservation: Reservation, block: Block): boolean {
  return itinerary.tripId === reservation.tripId && itinerary.dayId === reservation.dayId && itinerary.blockId === block.id && itinerary.reservationId === reservation.id
    && sameOptional(itinerary.placeId, reservation.placeId) && itinerary.type === itineraryTypeForReservation(reservation.type)
    && sameOptional(itinerary.startsAt, reservation.startsAt) && sameOptional(itinerary.endsAt, reservation.endsAt) && sameOptional(itinerary.timezone, reservation.timezone)
    && itinerary.title === reservation.title && sameOptional(itinerary.notes, reservation.notes) && itinerary.status === itineraryStatusForReservation(reservation.status)
    && sameOptional(itinerary.bookingReference, reservation.confirmationCode) && itinerary.position === block.position
}
function itinerarySortValue(item: Itinerary): string { return item.startsAt ?? '9999-12-31T23:59' }
function buildDayItems(day: Day, itineraries: Itinerary[], places: Place[], reservations: Reservation[], blocks: Block[]): DayItineraryItem[] {
  const dayItineraries = itineraries.filter((item) => item.dayId === day.id)
  const dayReservations = reservations.filter((item) => item.dayId === day.id)
  const dayBlocks = blocks.filter((item) => item.dayId === day.id)
  const placeById = new Map(places.map((place) => [place.id, place]))
  const reservationById = new Map(dayReservations.map((reservation) => [reservation.id, reservation]))
  const blockById = new Map(dayBlocks.map((block) => [block.id, block]))
  const blockByReservationId = new Map<string, Block>()
  for (const block of dayBlocks) {
    const reservationId = reservationIdFromBlock(block); if (!reservationId) continue
    if (blockByReservationId.has(reservationId)) throw new Error(`Giorno ${day.sequence}: più blocchi fanno riferimento alla stessa prenotazione.`)
    blockByReservationId.set(reservationId, block)
  }
  const coveredReservationIds = new Set<string>(); const coveredBlockIds = new Set<string>()
  const persistedItems: DayItineraryItem[] = dayItineraries.map((itinerary) => {
    const linkedBlock = itinerary.blockId ? blockById.get(itinerary.blockId) : undefined
    const referencedReservationId = itinerary.reservationId ?? reservationIdFromBlock(linkedBlock)
    if (!referencedReservationId) return { itinerary, place: itinerary.placeId ? placeById.get(itinerary.placeId) : undefined, source: 'manual', syncState: 'manual' }
    coveredReservationIds.add(referencedReservationId); if (itinerary.blockId) coveredBlockIds.add(itinerary.blockId)
    const reservation = reservationById.get(referencedReservationId); const block = blockByReservationId.get(referencedReservationId)
    const syncState: ItinerarySyncState = reservation && block ? (itineraryMatchesReservation(itinerary, reservation, block) ? 'synced' : 'needs-sync') : 'orphaned'
    return { itinerary, place: itinerary.placeId ? placeById.get(itinerary.placeId) : undefined, source: 'reservation', syncState }
  })
  const legacyItems: DayItineraryItem[] = dayReservations.flatMap((reservation) => {
    const block = blockByReservationId.get(reservation.id)
    if (!block || coveredReservationIds.has(reservation.id) || coveredBlockIds.has(block.id)) return []
    const itinerary = legacyItineraryFromReservation(reservation, block)
    return [{ itinerary, place: itinerary.placeId ? placeById.get(itinerary.placeId) : undefined, source: 'reservation' as const, syncState: 'needs-sync' as const }]
  })
  return [...persistedItems, ...legacyItems].sort((left, right) => {
    const leftPosition = left.itinerary.blockId ? blockById.get(left.itinerary.blockId)?.position : left.itinerary.position
    const rightPosition = right.itinerary.blockId ? blockById.get(right.itinerary.blockId)?.position : right.itinerary.position
    return itinerarySortValue(left.itinerary).localeCompare(itinerarySortValue(right.itinerary)) || (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER) || left.itinerary.createdAt.localeCompare(right.itinerary.createdAt) || left.itinerary.id.localeCompare(right.itinerary.id)
  })
}
function needsAttention(item: DayItineraryItem): boolean {
  if (item.syncState === 'needs-sync' || item.syncState === 'orphaned') return true
  return item.source === 'manual' && Boolean(item.itinerary.reservationId || item.itinerary.blockId)
}

export function createItineraryApplication(deps: ItineraryApplicationDependencies): ItineraryApplication {
  const contextDependencies = { trips: deps.trips, days: deps.days }
  async function assertContext(tripId: string, dayId: string, editable: boolean): Promise<void> {
    await assertTripDayContext(contextDependencies, tripId, dayId, editable, 'Ripristina il viaggio prima di modificare l’itinerario.')
  }
  async function loadReferencedPlaces(itineraries: Itinerary[], reservations: Reservation[]): Promise<Place[]> {
    const ids = new Set<string>()
    for (const itinerary of itineraries) if (itinerary.placeId) ids.add(itinerary.placeId)
    for (const reservation of reservations) if (reservation.placeId) ids.add(reservation.placeId)
    return deps.places.getMany([...ids])
  }
  async function normalizeManualDraft(tripId: string, dayId: string, input: ItineraryDraft): Promise<ItineraryDraft> {
    const { trip, day } = await requireTripDay(contextDependencies, tripId, dayId)
    const title = input.title.trim()
    if (!title) throw new Error('Il titolo della tappa è obbligatorio.')
    if (title.length > 200) throw new Error('Il titolo della tappa è troppo lungo.')
    if (!itineraryTypes.has(input.type)) throw new Error('Il tipo della tappa non è valido.')
    if (!itineraryStatuses.has(input.status)) throw new Error('Lo stato della tappa non è valido.')
    const startsAt = validateLocalDateTime(input.startsAt, 'Inizio'); const endsAt = validateLocalDateTime(input.endsAt, 'Fine')
    if (endsAt && !startsAt) throw new Error('Inserisci l’inizio prima della fine.')
    if (startsAt && startsAt.slice(0, 10) !== day.date) throw new Error('L’inizio della tappa deve cadere nella giornata corrente.')
    if (startsAt && endsAt && endsAt < startsAt) throw new Error('La fine non può precedere l’inizio.')
    if (endsAt && trip.endDate && endsAt.slice(0, 10) > trip.endDate) throw new Error('La fine della tappa non può superare la data di ritorno del viaggio.')
    const placeId = cleanOptional(input.placeId)
    if (placeId && !(await deps.places.get(placeId))) throw new Error('Il luogo associato non esiste più.')
    return { title, type: input.type, status: input.status, startsAt, endsAt, timezone: validateTimezone(input.timezone), placeId, bookingReference: validateOptionalText(input.bookingReference, 'Riferimento', 200), notes: validateOptionalText(input.notes, 'Note', 4000) }
  }
  function itineraryToDraft(itinerary: Itinerary): ItineraryDraft {
    return { title: itinerary.title, type: itinerary.type ?? 'custom', status: itinerary.status ?? 'planned', startsAt: itinerary.startsAt, endsAt: itinerary.endsAt, timezone: itinerary.timezone, placeId: itinerary.placeId, bookingReference: itinerary.bookingReference, notes: itinerary.notes }
  }
  async function listItineraryPlaces(): Promise<Place[]> { return (await deps.places.list()).sort((a, b) => a.name.localeCompare(b.name, 'it')) }
  async function listDayItineraryItems(tripId: string, dayId: string): Promise<DayItineraryItem[]> {
    await assertContext(tripId, dayId, false)
    const day = await deps.days.get(dayId); if (!day || day.tripId !== tripId) throw new Error('La giornata non appartiene a questo viaggio.')
    const [itinerariesByDay, reservationsByDay, blocksByDay] = await Promise.all([
      deps.itineraries.listByDay(dayId),
      deps.reservations.listByDay(dayId),
      deps.blocks.listByDay(dayId),
    ])
    const itineraries = itinerariesByDay.filter((item) => item.tripId === tripId && item.dayId === dayId)
    const reservations = reservationsByDay.filter((item) => item.tripId === tripId && item.dayId === dayId)
    const blocks = blocksByDay.filter((item) => item.tripId === tripId && item.dayId === dayId)
    const places = await loadReferencedPlaces(itineraries, reservations)
    return buildDayItems(day, itineraries, places, reservations, blocks)
  }
  async function saveManualItineraryItem(tripId: string, dayId: string, itineraryId: string | undefined, input: ItineraryDraft): Promise<Itinerary> {
    await assertContext(tripId, dayId, true); const draft = await normalizeManualDraft(tripId, dayId, input)
    const current = itineraryId ? await deps.itineraries.get(itineraryId) : undefined
    if (itineraryId && !current) throw new Error('La tappa non esiste più.')
    if (current && (current.reservationId || current.blockId)) throw new Error('Le tappe derivate da prenotazioni si modificano dal relativo blocco del planner.')
    if (current && (current.tripId !== tripId || current.dayId !== dayId)) throw new Error('La tappa non appartiene a questa giornata.')
    const now = deps.now(); let position = current?.position
    if (!current) {
      const siblings = (await deps.itineraries.listByDay(dayId)).filter((item) => item.tripId === tripId && item.dayId === dayId)
      position = siblings.reduce((maximum, item) => Math.max(maximum, item.position ?? 0), 0) + 1
    }
    const itinerary: Itinerary = current ? { ...current, ...draft, tripId, dayId, position, updatedAt: now } : { id: deps.newId(), ...draft, tripId, dayId, position, createdAt: now, updatedAt: now }
    await deps.itineraries.put(itinerary); return itinerary
  }
  async function deleteManualItineraryItem(tripId: string, dayId: string, itineraryId: string): Promise<void> {
    await assertContext(tripId, dayId, true); const itinerary = await deps.itineraries.get(itineraryId); if (!itinerary) return
    if (itinerary.tripId !== tripId || itinerary.dayId !== dayId) throw new Error('La tappa non appartiene a questa giornata.')
    if (itinerary.reservationId || itinerary.blockId) throw new Error('Le tappe derivate da prenotazioni si eliminano dal relativo blocco del planner.')
    await deps.itineraries.softDelete(itineraryId)
  }
  async function reconcileDayReservationItineraries(tripId: string, dayId: string): Promise<number> {
    await assertContext(tripId, dayId, true)
    const [blocksByDay, reservationsByDay] = await Promise.all([
      deps.blocks.listByDay(dayId),
      deps.reservations.listByDay(dayId),
    ])
    const blocks = blocksByDay.filter((item) => item.tripId === tripId && item.dayId === dayId)
    const reservations = reservationsByDay.filter((item) => item.tripId === tripId && item.dayId === dayId)
    const reservationById = new Map(reservations.map((reservation) => [reservation.id, reservation])); let reconciled = 0
    for (const block of blocks) { const reservationId = reservationIdFromBlock(block); if (!reservationId) continue; const reservation = reservationById.get(reservationId); if (!reservation) continue; await deps.reservationSync.saveReservationForBlock(block.id, tripId, dayId, reservation); reconciled += 1 }
    return reconciled
  }
  async function moveManualUntimedItineraryItem(tripId: string, dayId: string, itineraryId: string, direction: ManualItineraryMoveDirection): Promise<boolean> {
    await assertContext(tripId, dayId, true); return deps.itineraries.moveManualUntimed(tripId, dayId, itineraryId, direction)
  }
  async function resolveOrphanedItineraryItem(tripId: string, dayId: string, itineraryId: string, action: OrphanResolutionAction): Promise<void> {
    await assertContext(tripId, dayId, true)
    const itinerary = await deps.itineraries.get(itineraryId)
    if (!itinerary) throw new Error('La tappa non esiste più.')
    if (itinerary.tripId !== tripId || itinerary.dayId !== dayId) throw new Error('La tappa non appartiene a questa giornata.')
    if (!itinerary.reservationId && !itinerary.blockId) throw new Error('La tappa è già manuale e non richiede una riconciliazione.')
    const blocks = (await deps.blocks.listByDay(dayId)).filter((block) => block.tripId === tripId && block.dayId === dayId)
    const linkedBlock = itinerary.blockId ? blocks.find((block) => block.id === itinerary.blockId) : undefined
    const reservationId = itinerary.reservationId ?? reservationIdFromBlock(linkedBlock)
    if (reservationId) {
      const reservation = await deps.reservations.get(reservationId)
      const sourceBlocks = blocks.filter((block) => reservationIdFromBlock(block) === reservationId)
      if (sourceBlocks.length > 1) throw new Error('Più blocchi attivi fanno riferimento alla stessa prenotazione: risolvi prima l’ambiguità nel planner.')
      if (reservation && sourceBlocks.length === 1) throw new Error('La sorgente della tappa è di nuovo disponibile. Usa “Riallinea” invece di scollegarla.')
    }
    if (action === 'delete') { await deps.itineraries.softDelete(itinerary.id); return }
    const siblings = (await deps.itineraries.listByDay(dayId)).filter((item) => item.tripId === tripId && item.dayId === dayId && !item.reservationId && !item.blockId && !item.startsAt)
    const nextPosition = siblings.reduce((maximum, item) => Math.max(maximum, item.position ?? 0), 0) + 1
    await deps.itineraries.put({ ...itinerary, reservationId: undefined, blockId: undefined, position: itinerary.startsAt ? itinerary.position : nextPosition, updatedAt: deps.now() })
  }
  async function listTripItineraryOverview(tripId: string): Promise<TripItineraryOverview> {
    await requireTrip({ trips: deps.trips }, tripId)
    const [tripDays, tripItineraries, tripReservations, tripBlocks] = await Promise.all([
      deps.days.listByTrip(tripId),
      deps.itineraries.listByTrip(tripId),
      deps.reservations.listByTrip(tripId),
      deps.blocks.listByTrip(tripId),
    ])
    const days = tripDays.filter((day) => day.tripId === tripId).sort((a, b) => a.sequence - b.sequence || a.date.localeCompare(b.date))
    const itineraries = tripItineraries.filter((item) => item.tripId === tripId)
    const reservations = tripReservations.filter((item) => item.tripId === tripId)
    const blocks = tripBlocks.filter((item) => item.tripId === tripId)
    const places = await loadReferencedPlaces(itineraries, reservations)
    const itineraryDays = days.map((day) => ({ day, items: buildDayItems(day, itineraries, places, reservations, blocks) }))
    return { days: itineraryDays, stopCount: itineraryDays.reduce((total, section) => total + section.items.length, 0), warningCount: itineraryDays.reduce((total, section) => total + section.items.filter(needsAttention).length, 0) }
  }
  return { itineraryToDraft, listItineraryPlaces, listDayItineraryItems, saveManualItineraryItem, deleteManualItineraryItem, reconcileDayReservationItineraries, moveManualUntimedItineraryItem, resolveOrphanedItineraryItem, listTripItineraryOverview }
}
