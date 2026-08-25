import type { Traveler, TripTraveler } from '../../domain/entities'
import { requireTrip } from '../../application/shared/trip-day-context'
import {
  travelerRepository,
  tripRepository,
  tripTravelerRepository,
} from '../../data/repositories/repositories'
import type { TripTravelerRole } from '../../data/repositories/trip-traveler-repository'

export type TravelerRole = TripTravelerRole

export interface TravelerDraft {
  firstName: string
  lastName: string
  displayName: string
  birthDate?: string
  birthPlace?: string
  nationality?: string
  gender?: string
  email?: string
  phone?: string
  notes?: string
}

export interface TripParticipant {
  membership: TripTraveler
  traveler: Traveler
}

export const EMPTY_TRAVELER_DRAFT: TravelerDraft = {
  firstName: '',
  lastName: '',
  displayName: '',
}

const roles = new Set<TravelerRole>(['owner', 'companion', 'child', 'other'])

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

function validateOptionalText(value: string | undefined, label: string, maxLength: number): string | undefined {
  const cleaned = cleanOptional(value)
  if (cleaned && cleaned.length > maxLength) throw new Error(`${label}: valore troppo lungo.`)
  return cleaned
}

function localTodayKey(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validateBirthDate(value: string | undefined): string | undefined {
  const cleaned = cleanOptional(value)
  if (!cleaned) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) throw new Error('La data di nascita non è valida.')

  const [year, month, day] = cleaned.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('La data di nascita non esiste nel calendario.')
  }
  if (cleaned > localTodayKey()) throw new Error('La data di nascita non può essere nel futuro.')
  return cleaned
}

function validateEmail(value: string | undefined): string | undefined {
  const cleaned = validateOptionalText(value, 'Email', 254)
  if (!cleaned) return undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) throw new Error('L’indirizzo email non è valido.')
  return cleaned
}

function normalizeTravelerDraft(input: TravelerDraft): TravelerDraft {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (!firstName) throw new Error('Il nome è obbligatorio.')
  if (!lastName) throw new Error('Il cognome è obbligatorio.')
  if (firstName.length > 100 || lastName.length > 100) throw new Error('Nome o cognome troppo lunghi.')

  const displayName = input.displayName.trim() || `${firstName} ${lastName}`
  if (displayName.length > 160) throw new Error('Il nome visualizzato è troppo lungo.')

  return {
    firstName,
    lastName,
    displayName,
    birthDate: validateBirthDate(input.birthDate),
    birthPlace: validateOptionalText(input.birthPlace, 'Luogo di nascita', 200),
    nationality: validateOptionalText(input.nationality, 'Nazionalità', 100),
    gender: validateOptionalText(input.gender, 'Genere', 80),
    email: validateEmail(input.email),
    phone: validateOptionalText(input.phone, 'Telefono', 80),
    notes: validateOptionalText(input.notes, 'Note', 4000),
  }
}

export function travelerToDraft(traveler: Traveler): TravelerDraft {
  return {
    firstName: traveler.firstName,
    lastName: traveler.lastName,
    displayName: traveler.displayName,
    birthDate: traveler.birthDate,
    birthPlace: traveler.birthPlace,
    nationality: traveler.nationality,
    gender: traveler.gender,
    email: traveler.email,
    phone: traveler.phone,
    notes: traveler.notes,
  }
}

export async function listTravelers(): Promise<Traveler[]> {
  return (await travelerRepository.list())
    .sort((left, right) => (
      left.displayName.localeCompare(right.displayName, 'it') ||
      left.lastName.localeCompare(right.lastName, 'it') ||
      left.id.localeCompare(right.id)
    ))
}

export async function getTraveler(travelerId: string): Promise<Traveler | undefined> {
  return travelerRepository.get(travelerId)
}

export async function createTraveler(input: TravelerDraft): Promise<Traveler> {
  const draft = normalizeTravelerDraft(input)
  const now = new Date().toISOString()
  const traveler: Traveler = {
    id: crypto.randomUUID(),
    ...draft,
    createdAt: now,
    updatedAt: now,
  }
  await travelerRepository.put(traveler)
  return traveler
}

export async function updateTraveler(travelerId: string, input: TravelerDraft): Promise<Traveler> {
  const existing = await travelerRepository.get(travelerId)
  if (!existing) throw new Error('Il profilo viaggiatore non esiste più.')

  const draft = normalizeTravelerDraft(input)
  const updated: Traveler = {
    ...existing,
    ...draft,
    updatedAt: new Date().toISOString(),
  }
  await travelerRepository.put(updated)
  return updated
}

export async function listTripParticipants(tripId: string): Promise<TripParticipant[]> {
  await requireTrip({ trips: tripRepository }, tripId)

  const memberships = await tripTravelerRepository.listActiveForTrip(tripId)
  const participants: TripParticipant[] = []
  for (const membership of memberships) {
    const traveler = await travelerRepository.get(membership.travelerId)
    if (!traveler) {
      throw new Error('Il viaggio contiene un partecipante collegato a un profilo mancante o eliminato.')
    }
    participants.push({ membership, traveler })
  }

  return participants.sort((left, right) => left.traveler.displayName.localeCompare(right.traveler.displayName, 'it'))
}

export async function attachTravelerToTrip(
  tripId: string,
  travelerId: string,
  role: TravelerRole,
): Promise<TripTraveler> {
  if (!roles.has(role)) throw new Error('Il ruolo del partecipante non è valido.')
  return tripTravelerRepository.setMembership(tripId, travelerId, role)
}

export async function detachTravelerFromTrip(tripId: string, travelerId: string): Promise<void> {
  const result = await tripTravelerRepository.detachMembership(tripId, travelerId)
  if (result === 'not-found') throw new Error('Il viaggiatore non risulta associato a questo viaggio.')
}
