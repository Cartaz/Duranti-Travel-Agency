import type { Block, Place } from '../../domain/entities'
import { placeBlockRepository } from '../../data/repositories/place-block-repository'
import { blockRepository, placeRepository } from '../../data/repositories/repositories'
import { assertPlannerDayContext } from '../planner/block-service'
import { buildGoogleMapsSearchUrl } from './maps-url'

export interface PlaceDraft {
  name: string
  formattedAddress?: string
  city?: string
  countryCode?: string
  category?: string
  notes?: string
  latitude?: number
  longitude?: number
}

export const EMPTY_PLACE_DRAFT: PlaceDraft = { name: '' }

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

function validateOptionalText(value: string | undefined, label: string, maxLength: number): string | undefined {
  const cleaned = cleanOptional(value)
  if (cleaned && cleaned.length > maxLength) throw new Error(`${label}: valore troppo lungo.`)
  return cleaned
}

function normalizeDraft(input: PlaceDraft): PlaceDraft {
  const name = input.name.trim()
  if (!name) throw new Error('Il nome del luogo è obbligatorio.')
  if (name.length > 200) throw new Error('Il nome del luogo è troppo lungo.')

  const formattedAddress = validateOptionalText(input.formattedAddress, 'Indirizzo', 500)
  const city = validateOptionalText(input.city, 'Città', 120)
  const category = validateOptionalText(input.category, 'Categoria', 80)
  const notes = validateOptionalText(input.notes, 'Note', 2000)
  const countryCode = cleanOptional(input.countryCode)?.toUpperCase()
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('Il paese deve essere un codice di due lettere, ad esempio IT.')
  }

  const hasLatitude = input.latitude !== undefined
  const hasLongitude = input.longitude !== undefined
  if (hasLatitude !== hasLongitude) throw new Error('Latitudine e longitudine devono essere inserite insieme.')
  if (hasLatitude && (!Number.isFinite(input.latitude) || input.latitude! < -90 || input.latitude! > 90)) {
    throw new Error('La latitudine deve essere compresa tra -90 e 90.')
  }
  if (hasLongitude && (!Number.isFinite(input.longitude) || input.longitude! < -180 || input.longitude! > 180)) {
    throw new Error('La longitudine deve essere compresa tra -180 e 180.')
  }

  return {
    name,
    formattedAddress,
    city,
    countryCode,
    category,
    notes,
    latitude: hasLatitude ? input.latitude : undefined,
    longitude: hasLongitude ? input.longitude : undefined,
  }
}

function placeIdFromBlock(block: Block): string | undefined {
  const value = block.content.placeId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il riferimento al luogo del blocco non è valido.')
  return value
}

async function getPlaceBlock(tripId: string, dayId: string, blockId: string): Promise<Block> {
  const block = await blockRepository.get(blockId)
  if (!block || block.tripId !== tripId || block.dayId !== dayId || block.type !== 'place') {
    throw new Error('Il blocco luogo non appartiene a questa giornata.')
  }
  return block
}

export function placeToDraft(place: Place): PlaceDraft {
  return {
    name: place.name,
    formattedAddress: place.formattedAddress,
    city: place.city,
    countryCode: place.countryCode,
    category: place.category,
    notes: place.notes,
    latitude: place.latitude,
    longitude: place.longitude,
  }
}

export async function getPlannerPlace(tripId: string, dayId: string, blockId: string): Promise<Place | undefined> {
  await assertPlannerDayContext(tripId, dayId, false)
  const block = await getPlaceBlock(tripId, dayId, blockId)
  const placeId = placeIdFromBlock(block)
  if (!placeId) return undefined
  return placeRepository.get(placeId)
}

export async function savePlannerPlace(
  tripId: string,
  dayId: string,
  blockId: string,
  input: PlaceDraft,
): Promise<Place> {
  await assertPlannerDayContext(tripId, dayId, true)
  const block = await getPlaceBlock(tripId, dayId, blockId)
  const currentPlaceId = placeIdFromBlock(block)
  const currentPlace = currentPlaceId ? await placeRepository.get(currentPlaceId) : undefined
  const draft = normalizeDraft(input)
  const now = new Date().toISOString()

  const placeBase = {
    ...draft,
    provider: 'manual',
  }
  const mapsUrl = buildGoogleMapsSearchUrl(placeBase)

  const place: Place = currentPlace
    ? {
        ...currentPlace,
        ...placeBase,
        mapsUrl,
        updatedAt: now,
      }
    : {
        id: crypto.randomUUID(),
        ...placeBase,
        mapsUrl,
        createdAt: now,
        updatedAt: now,
      }

  await placeBlockRepository.savePlaceForBlock(blockId, tripId, dayId, place)
  return place
}
