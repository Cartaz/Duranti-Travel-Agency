import type { PlaceDiscoveryPort, PlaceImportCandidate } from '../../application/places/place-import'

type NominatimAddress = Record<string, string | undefined>
type NominatimExtraTags = Record<string, string | undefined>

interface NominatimResult {
  place_id: number
  osm_type?: string
  osm_id?: number
  display_name: string
  lat: string
  lon: string
  name?: string
  type?: string
  address?: NominatimAddress
  extratags?: NominatimExtraTags
  namedetails?: Record<string, string | undefined>
}

const CACHE_PREFIX = 'dtagency:nominatim:v1:'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_REQUEST_INTERVAL_MS = 1_000
let lastRequestStartedAt = 0

function first(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim()
}

function cityFrom(address: NominatimAddress | undefined): string | undefined {
  return first(address?.city, address?.town, address?.village, address?.municipality)
}

function countryCodeFrom(address: NominatimAddress | undefined): string | undefined {
  return address?.country_code?.trim().toUpperCase() || undefined
}

function categoryFrom(result: NominatimResult): string | undefined {
  const value = result.type?.trim()
  return value ? value.replace(/_/g, ' ') : undefined
}

function providerPlaceId(result: NominatimResult): string {
  if (result.osm_type && Number.isFinite(result.osm_id)) return `${result.osm_type}:${result.osm_id}`
  return `nominatim:${result.place_id}`
}

function candidateFromResult(result: NominatimResult): PlaceImportCandidate {
  const extra = result.extratags
  return {
    name: first(result.name, result.namedetails?.name, result.display_name.split(',')[0]) ?? result.display_name,
    formattedAddress: result.display_name,
    city: cityFrom(result.address),
    countryCode: countryCodeFrom(result.address),
    category: categoryFrom(result),
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    phone: first(extra?.phone, extra?.['contact:phone']),
    openingHours: extra?.opening_hours?.trim() || undefined,
    provider: 'openstreetmap',
    providerPlaceId: providerPlaceId(result),
  }
}

function cacheKey(query: string): string {
  return `${CACHE_PREFIX}${query.trim().toLocaleLowerCase('it-IT')}`
}

function readCache(query: string): PlaceImportCandidate[] | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(query))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { storedAt: number; candidates: PlaceImportCandidate[] }
    if (!Number.isFinite(parsed.storedAt) || Date.now() - parsed.storedAt > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(query))
      return undefined
    }
    return Array.isArray(parsed.candidates) ? parsed.candidates : undefined
  } catch {
    return undefined
  }
}

function writeCache(query: string, candidates: PlaceImportCandidate[]): void {
  try {
    localStorage.setItem(cacheKey(query), JSON.stringify({ storedAt: Date.now(), candidates }))
  } catch {
    // External discovery cache is opportunistic; failure must not affect DTAgency user data.
  }
}

async function respectRateLimit(): Promise<void> {
  const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt))
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  lastRequestStartedAt = Date.now()
}

export function createNominatimPlaceDiscovery(endpoint = 'https://nominatim.openstreetmap.org'): PlaceDiscoveryPort {
  return {
    async search(query: string): Promise<PlaceImportCandidate[]> {
      const cached = readCache(query)
      if (cached) return cached

      await respectRateLimit()
      const url = new URL('/search', endpoint)
      url.searchParams.set('q', query)
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('limit', '5')
      url.searchParams.set('addressdetails', '1')
      url.searchParams.set('extratags', '1')
      url.searchParams.set('namedetails', '1')
      url.searchParams.set('accept-language', 'it')

      let response: Response
      try {
        response = await fetch(url, {
          headers: { Accept: 'application/json' },
          referrerPolicy: 'strict-origin-when-cross-origin',
        })
      } catch {
        throw new Error('Non riesco a contattare OpenStreetMap. Controlla la connessione e riprova.')
      }
      if (!response.ok) throw new Error(`OpenStreetMap non è disponibile in questo momento (${response.status}).`)

      const payload = await response.json() as NominatimResult[]
      const candidates = payload
        .filter((result) => Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon)))
        .map(candidateFromResult)
      writeCache(query, candidates)
      return candidates
    },
  }
}

export const nominatimPlaceDiscovery = createNominatimPlaceDiscovery()
