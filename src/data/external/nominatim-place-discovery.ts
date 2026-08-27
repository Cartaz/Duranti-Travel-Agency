type NominatimAddress = Record<string, string | undefined>
type NominatimExtraTags = Record<string, string | undefined>

export interface NominatimPlaceCandidate {
  name: string
  formattedAddress?: string
  city?: string
  countryCode?: string
  category?: string
  phone?: string
  openingHours?: string
  latitude?: number
  longitude?: number
  provider: 'openstreetmap'
  providerPlaceId: string
}

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
let requestQueue: Promise<void> = Promise.resolve()

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
  if (result.osm_type?.trim() && Number.isFinite(result.osm_id)) return `${result.osm_type}:${result.osm_id}`
  return `nominatim:${result.place_id}`
}

function candidateFromResult(result: NominatimResult): NominatimPlaceCandidate {
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

function readCache(query: string): NominatimPlaceCandidate[] | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(query))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { storedAt: number; candidates: NominatimPlaceCandidate[] }
    if (!Number.isFinite(parsed.storedAt) || Date.now() - parsed.storedAt > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(query))
      return undefined
    }
    return Array.isArray(parsed.candidates) ? parsed.candidates : undefined
  } catch {
    return undefined
  }
}

function writeCache(query: string, candidates: NominatimPlaceCandidate[]): void {
  try {
    localStorage.setItem(cacheKey(query), JSON.stringify({ storedAt: Date.now(), candidates }))
  } catch {
    // This cache contains only reproducible third-party lookup data, never DTAgency user data.
  }
}

async function waitForRequestSlot(): Promise<void> {
  const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt))
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  lastRequestStartedAt = Date.now()
}

function serializeRequest<T>(operation: () => Promise<T>): Promise<T> {
  const scheduled = requestQueue.then(operation, operation)
  requestQueue = scheduled.then(() => undefined, () => undefined)
  return scheduled
}

async function fetchCandidates(query: string, endpoint: string): Promise<NominatimPlaceCandidate[]> {
  await waitForRequestSlot()
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
}

export function createNominatimPlaceDiscovery(endpoint = 'https://nominatim.openstreetmap.org') {
  return {
    async search(query: string): Promise<NominatimPlaceCandidate[]> {
      const cached = readCache(query)
      if (cached) return cached

      // Shared module queue guarantees one in-process request at a time. Tabs remain
      // independent browser contexts, so cross-tab rate coordination is intentionally
      // not claimed by this adapter.
      return serializeRequest(async () => {
        const refreshedCache = readCache(query)
        if (refreshedCache) return refreshedCache
        return fetchCandidates(query, endpoint)
      })
    },
  }
}

export const nominatimPlaceDiscovery = createNominatimPlaceDiscovery()
