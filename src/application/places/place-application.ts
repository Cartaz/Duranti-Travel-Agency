import type { Block, Place } from '../../domain/entities'
import { assertTripDayContext } from '../shared/trip-day-context'
import type { PlaceApplicationDependencies } from './ports'

export interface PlaceDraft {
  name: string
  formattedAddress?: string
  city?: string
  countryCode?: string
  category?: string
  phone?: string
  openingHours?: string
  notes?: string
  latitude?: number
  longitude?: number
  provider?: string
  providerPlaceId?: string
}

export const EMPTY_PLACE_DRAFT: PlaceDraft = { name: '' }

export interface PlaceApplication {
  placeToDraft(place: Place): PlaceDraft
  listCatalogPlaces(): Promise<Place[]>
  saveCatalogPlace(input: PlaceDraft): Promise<Place>
  getPlannerPlace(tripId: string, dayId: string, blockId: string): Promise<Place | undefined>
  savePlannerPlace(tripId: string, dayId: string, blockId: string, input: PlaceDraft): Promise<Place>
}

function cleanOptional(value: string | undefined): string | undefined { const cleaned = value?.trim(); return cleaned ? cleaned : undefined }
function validateOptionalText(value: string | undefined, label: string, maxLength: number): string | undefined {
  const cleaned = cleanOptional(value)
  if (cleaned && cleaned.length > maxLength) throw new Error(`${label}: valore troppo lungo.`)
  return cleaned
}
function buildGoogleMapsSearchUrl(source: PlaceDraft): string {
  const hasCoordinates = Number.isFinite(source.latitude) && Number.isFinite(source.longitude)
  const query = hasCoordinates
    ? `${source.latitude},${source.longitude}`
    : [source.name, source.formattedAddress, source.city, source.countryCode].map((value) => value?.trim()).filter((value): value is string => Boolean(value)).join(', ')
  if (!query) throw new Error('Il luogo non contiene abbastanza informazioni per aprire Google Maps.')
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1'); url.searchParams.set('query', query)
  return url.toString()
}
function normalizeDraft(input: PlaceDraft): PlaceDraft {
  const name = input.name.trim()
  if (!name) throw new Error('Il nome del luogo è obbligatorio.')
  if (name.length > 200) throw new Error('Il nome del luogo è troppo lungo.')
  const countryCode = cleanOptional(input.countryCode)?.toUpperCase()
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new Error('Paese: inserisci esattamente due lettere, ad esempio IT per Italia o FR per Francia.')
  const hasLatitude = input.latitude !== undefined; const hasLongitude = input.longitude !== undefined
  if (hasLatitude && !hasLongitude) throw new Error('Hai inserito la latitudine ma manca la longitudine. Inserisci entrambe le coordinate oppure lascia entrambe vuote.')
  if (!hasLatitude && hasLongitude) throw new Error('Hai inserito la longitudine ma manca la latitudine. Inserisci entrambe le coordinate oppure lascia entrambe vuote.')
  if (hasLatitude && !Number.isFinite(input.latitude)) throw new Error('Latitudine non valida: inserisci un numero compreso tra -90 e 90.')
  if (hasLatitude && (input.latitude! < -90 || input.latitude! > 90)) throw new Error(`Latitudine non valida: ${input.latitude} è fuori dall’intervallo consentito da -90 a 90.`)
  if (hasLongitude && !Number.isFinite(input.longitude)) throw new Error('Longitudine non valida: inserisci un numero compreso tra -180 e 180.')
  if (hasLongitude && (input.longitude! < -180 || input.longitude! > 180)) throw new Error(`Longitudine non valida: ${input.longitude} è fuori dall’intervallo consentito da -180 a 180.`)
  return {
    name,
    formattedAddress: validateOptionalText(input.formattedAddress, 'Indirizzo', 500),
    city: validateOptionalText(input.city, 'Città', 120),
    countryCode,
    category: validateOptionalText(input.category, 'Categoria', 80),
    phone: validateOptionalText(input.phone, 'Telefono', 80),
    openingHours: validateOptionalText(input.openingHours, 'Orari', 1000),
    notes: validateOptionalText(input.notes, 'Note', 2000),
    latitude: hasLatitude ? input.latitude : undefined,
    longitude: hasLongitude ? input.longitude : undefined,
    provider: validateOptionalText(input.provider, 'Provider', 80),
    providerPlaceId: validateOptionalText(input.providerPlaceId, 'Identificatore provider', 200),
  }
}
function placeBaseFromDraft(input: PlaceDraft): Omit<Place, 'id' | 'createdAt' | 'updatedAt'> {
  const draft = normalizeDraft(input)
  return { ...draft, provider: draft.provider ?? 'manual', mapsUrl: buildGoogleMapsSearchUrl(draft) }
}
function placeIdFromBlock(block: Block): string | undefined {
  const value = block.content.placeId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il riferimento al luogo del blocco non è valido.')
  return value
}

export function createPlaceApplication(deps: PlaceApplicationDependencies): PlaceApplication {
  async function assertContext(tripId: string, dayId: string, editable: boolean) {
    return assertTripDayContext({ trips: deps.trips, days: deps.days }, tripId, dayId, editable, 'Ripristina il viaggio prima di modificare i luoghi.')
  }
  async function getPlaceBlock(tripId: string, dayId: string, blockId: string): Promise<Block> {
    const block = await deps.blocks.get(blockId)
    if (!block || block.tripId !== tripId || block.dayId !== dayId || block.type !== 'place') throw new Error('Il blocco luogo non appartiene a questa giornata.')
    return block
  }
  function placeToDraft(place: Place): PlaceDraft {
    return { name: place.name, formattedAddress: place.formattedAddress, city: place.city, countryCode: place.countryCode, category: place.category, phone: place.phone, openingHours: place.openingHours, notes: place.notes, latitude: place.latitude, longitude: place.longitude, provider: place.provider, providerPlaceId: place.providerPlaceId }
  }
  async function listCatalogPlaces(): Promise<Place[]> {
    return (await deps.places.list()).sort((left, right) => left.name.localeCompare(right.name, 'it'))
  }
  async function saveCatalogPlace(input: PlaceDraft): Promise<Place> {
    const timestamp = deps.now()
    const place: Place = { id: deps.newId(), ...placeBaseFromDraft(input), createdAt: timestamp, updatedAt: timestamp }
    await deps.places.put(place)
    return place
  }
  async function getPlannerPlace(tripId: string, dayId: string, blockId: string): Promise<Place | undefined> {
    await assertContext(tripId, dayId, false)
    const block = await getPlaceBlock(tripId, dayId, blockId)
    const placeId = placeIdFromBlock(block)
    if (!placeId) return undefined
    return deps.places.get(placeId)
  }
  async function savePlannerPlace(tripId: string, dayId: string, blockId: string, input: PlaceDraft): Promise<Place> {
    await assertContext(tripId, dayId, true)
    const block = await getPlaceBlock(tripId, dayId, blockId)
    const currentPlaceId = placeIdFromBlock(block)
    const currentPlace = currentPlaceId ? await deps.places.get(currentPlaceId) : undefined
    const now = deps.now()
    const base = placeBaseFromDraft(input)
    const place: Place = currentPlace
      ? { ...currentPlace, ...base, updatedAt: now }
      : { id: deps.newId(), ...base, createdAt: now, updatedAt: now }
    await deps.blockTransactions.savePlaceForBlock(blockId, tripId, dayId, place)
    return place
  }
  return { placeToDraft, listCatalogPlaces, saveCatalogPlace, getPlannerPlace, savePlannerPlace }
}
