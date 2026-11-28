import { resolveNominatimEndpoint } from './runtime-config.ts'

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
type NominatimEndpointSource = string | (() => string | Promise<string>)
const CACHE_PREFIX = 'dtagency:nominatim:v1:'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_CACHED_QUERIES = 50
const MIN_REQUEST_INTERVAL_MS = 1_000
const RATE_LIMIT_LOCK_NAME = 'dtagency:nominatim:request-slot:v1'
const LAST_REQUEST_START_KEY = 'dtagency:nominatim:last-request-start:v1'
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
function cachedStoredAt(key: string): number {
  try {
    const value = (JSON.parse(localStorage.getItem(key) ?? '') as { storedAt?: unknown }).storedAt
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

// Expired entries are otherwise only dropped when the same query is repeated,
// so keep the cache bounded by evicting the oldest searches.
function evictOldestCacheEntries(): void {
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
  }
  if (keys.length <= MAX_CACHED_QUERIES) return
  keys
    .map((key) => ({ key, storedAt: cachedStoredAt(key) }))
    .sort((left, right) => left.storedAt - right.storedAt)
    .slice(0, keys.length - MAX_CACHED_QUERIES)
    .forEach(({ key }) => localStorage.removeItem(key))
}

function clearSearchCache(): void {
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))
}

function writeCache(query: string, candidates: NominatimPlaceCandidate[]): void {
  const entry = JSON.stringify({ storedAt: Date.now(), candidates })
  try {
    evictOldestCacheEntries()
    localStorage.setItem(cacheKey(query), entry)
    evictOldestCacheEntries()
  } catch {
    // Quota exhausted: drop every cached search once and retry; the cache is
    // only a reproducible convenience.
    try {
      clearSearchCache()
      localStorage.setItem(cacheKey(query), entry)
    } catch {
      /* give up caching this search */
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalStringMap(value: unknown): Record<string, string | undefined> | undefined {
  if (!isRecord(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

/** External input: keep only results with the fields DTAgency relies on, with the expected types. */
function parseNominatimResults(payload: unknown): NominatimResult[] {
  if (!Array.isArray(payload)) throw new Error('OpenStreetMap ha restituito una risposta non valida.')
  return payload.flatMap((raw): NominatimResult[] => {
    if (!isRecord(raw) || typeof raw.display_name !== 'string' || !raw.display_name.trim()) return []
    if (typeof raw.lat !== 'string' || typeof raw.lon !== 'string') return []
    if (!Number.isFinite(Number(raw.lat)) || !Number.isFinite(Number(raw.lon))) return []
    if (typeof raw.place_id !== 'number' || !Number.isFinite(raw.place_id)) return []
    return [
      {
        place_id: raw.place_id,
        osm_type: typeof raw.osm_type === 'string' ? raw.osm_type : undefined,
        osm_id: typeof raw.osm_id === 'number' ? raw.osm_id : undefined,
        display_name: raw.display_name,
        lat: raw.lat,
        lon: raw.lon,
        name: typeof raw.name === 'string' ? raw.name : undefined,
        type: typeof raw.type === 'string' ? raw.type : undefined,
        address: optionalStringMap(raw.address),
        extratags: optionalStringMap(raw.extratags),
        namedetails: optionalStringMap(raw.namedetails),
      },
    ]
  })
}
function readSharedLastRequestStart(): number {
  try {
    const value = Number(localStorage.getItem(LAST_REQUEST_START_KEY))
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}
function writeSharedLastRequestStart(value: number): void {
  try {
    localStorage.setItem(LAST_REQUEST_START_KEY, String(value))
  } catch {
    /* in-process serialization still applies */
  }
}
async function endpointFrom(source: NominatimEndpointSource): Promise<string> {
  const value = typeof source === 'function' ? await source() : source
  const normalized = value.trim()
  if (!normalized) throw new Error('Nominatim endpoint is not configured.')
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}
export { parseNominatimResults }

export function createNominatimPlaceDiscovery(endpointSource: NominatimEndpointSource = resolveNominatimEndpoint) {
  let nextRequestStartAt = 0
  const inFlightSearches = new Map<string, Promise<NominatimPlaceCandidate[]>>()
  async function reserveRequestSlot(): Promise<void> {
    const now = Date.now()
    const sharedNextStartAt = readSharedLastRequestStart() + MIN_REQUEST_INTERVAL_MS
    const scheduledAt = Math.max(now, nextRequestStartAt, sharedNextStartAt)
    nextRequestStartAt = scheduledAt + MIN_REQUEST_INTERVAL_MS
    const waitMs = scheduledAt - now
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
    writeSharedLastRequestStart(scheduledAt)
  }
  async function waitForRequestSlot(): Promise<void> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
    if (!locks) {
      await reserveRequestSlot()
      return
    }
    await locks.request(RATE_LIMIT_LOCK_NAME, reserveRequestSlot)
  }
  async function searchRemote(query: string): Promise<NominatimPlaceCandidate[]> {
    await waitForRequestSlot()
    const url = new URL('search', await endpointFrom(endpointSource))
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
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('OpenStreetMap ha restituito una risposta non leggibile.')
    }
    const candidates = parseNominatimResults(payload).map(candidateFromResult)
    writeCache(query, candidates)
    return candidates
  }
  return {
    async search(query: string): Promise<NominatimPlaceCandidate[]> {
      const normalizedQuery = query.trim()
      const cached = readCache(normalizedQuery)
      if (cached) return cached
      const key = cacheKey(normalizedQuery)
      const pending = inFlightSearches.get(key)
      if (pending) return pending
      const request = searchRemote(normalizedQuery).finally(() => inFlightSearches.delete(key))
      inFlightSearches.set(key, request)
      return request
    },
  }
}
export const nominatimPlaceDiscovery = createNominatimPlaceDiscovery()
