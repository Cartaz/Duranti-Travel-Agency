import { resolveNominatimEndpoint } from './runtime-config.ts'

type NominatimAddress = Record<string, string | undefined>
type NominatimExtraTags = Record<string, string | undefined>
export interface NominatimPlaceCandidate { name: string; formattedAddress?: string; city?: string; countryCode?: string; category?: string; phone?: string; openingHours?: string; latitude?: number; longitude?: number; provider: 'openstreetmap'; providerPlaceId: string }
interface NominatimResult { place_id: number; osm_type?: string; osm_id?: number; display_name: string; lat: string; lon: string; name?: string; type?: string; address?: NominatimAddress; extratags?: NominatimExtraTags; namedetails?: Record<string, string | undefined> }
type NominatimEndpointSource = string | (() => string | Promise<string>)
const CACHE_PREFIX = 'dtagency:nominatim:v1:'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_REQUEST_INTERVAL_MS = 1_000
const RATE_LIMIT_LOCK_NAME = 'dtagency:nominatim:request-slot:v1'
const LAST_REQUEST_START_KEY = 'dtagency:nominatim:last-request-start:v1'
function first(...values: Array<string | undefined>): string | undefined { return values.find((value) => value?.trim())?.trim() }
function cityFrom(address: NominatimAddress | undefined): string | undefined { return first(address?.city, address?.town, address?.village, address?.municipality) }
function countryCodeFrom(address: NominatimAddress | undefined): string | undefined { return address?.country_code?.trim().toUpperCase() || undefined }
function categoryFrom(result: NominatimResult): string | undefined { const value = result.type?.trim(); return value ? value.replace(/_/g, ' ') : undefined }
function providerPlaceId(result: NominatimResult): string { if (result.osm_type?.trim() && Number.isFinite(result.osm_id)) return `${result.osm_type}:${result.osm_id}`; return `nominatim:${result.place_id}` }
function candidateFromResult(result: NominatimResult): NominatimPlaceCandidate { const extra = result.extratags; return { name: first(result.name, result.namedetails?.name, result.display_name.split(',')[0]) ?? result.display_name, formattedAddress: result.display_name, city: cityFrom(result.address), countryCode: countryCodeFrom(result.address), category: categoryFrom(result), latitude: Number(result.lat), longitude: Number(result.lon), phone: first(extra?.phone, extra?.['contact:phone']), openingHours: extra?.opening_hours?.trim() || undefined, provider: 'openstreetmap', providerPlaceId: providerPlaceId(result) } }
function cacheKey(query: string): string { return `${CACHE_PREFIX}${query.trim().toLocaleLowerCase('it-IT')}` }
function readCache(query: string): NominatimPlaceCandidate[] | undefined { try { const raw = localStorage.getItem(cacheKey(query)); if (!raw) return undefined; const parsed = JSON.parse(raw) as { storedAt: number; candidates: NominatimPlaceCandidate[] }; if (!Number.isFinite(parsed.storedAt) || Date.now() - parsed.storedAt > CACHE_TTL_MS) { localStorage.removeItem(cacheKey(query)); return undefined } return Array.isArray(parsed.candidates) ? parsed.candidates : undefined } catch { return undefined } }
function writeCache(query: string, candidates: NominatimPlaceCandidate[]): void { try { localStorage.setItem(cacheKey(query), JSON.stringify({ storedAt: Date.now(), candidates })) } catch { /* reproducible provider cache only */ } }
function readSharedLastRequestStart(): number { try { const value = Number(localStorage.getItem(LAST_REQUEST_START_KEY)); return Number.isFinite(value) && value > 0 ? value : 0 } catch { return 0 } }
function writeSharedLastRequestStart(value: number): void { try { localStorage.setItem(LAST_REQUEST_START_KEY, String(value)) } catch { /* in-process serialization still applies */ } }
async function endpointFrom(source: NominatimEndpointSource): Promise<string> { const value = typeof source === 'function' ? await source() : source; const normalized = value.trim(); if (!normalized) throw new Error('Nominatim endpoint is not configured.'); return normalized.endsWith('/') ? normalized : `${normalized}/` }
export function createNominatimPlaceDiscovery(endpointSource: NominatimEndpointSource = resolveNominatimEndpoint) {
  let nextRequestStartAt = 0
  const inFlightSearches = new Map<string, Promise<NominatimPlaceCandidate[]>>()
  async function reserveRequestSlot(): Promise<void> { const now = Date.now(); const sharedNextStartAt = readSharedLastRequestStart() + MIN_REQUEST_INTERVAL_MS; const scheduledAt = Math.max(now, nextRequestStartAt, sharedNextStartAt); nextRequestStartAt = scheduledAt + MIN_REQUEST_INTERVAL_MS; const waitMs = scheduledAt - now; if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs)); writeSharedLastRequestStart(scheduledAt) }
  async function waitForRequestSlot(): Promise<void> { const locks = typeof navigator === 'undefined' ? undefined : navigator.locks; if (!locks) { await reserveRequestSlot(); return } await locks.request(RATE_LIMIT_LOCK_NAME, reserveRequestSlot) }
  async function searchRemote(query: string): Promise<NominatimPlaceCandidate[]> {
    await waitForRequestSlot()
    const url = new URL('search', await endpointFrom(endpointSource))
    url.searchParams.set('q', query); url.searchParams.set('format', 'jsonv2'); url.searchParams.set('limit', '5'); url.searchParams.set('addressdetails', '1'); url.searchParams.set('extratags', '1'); url.searchParams.set('namedetails', '1'); url.searchParams.set('accept-language', 'it')
    let response: Response
    try { response = await fetch(url, { headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' }) } catch { throw new Error('Non riesco a contattare OpenStreetMap. Controlla la connessione e riprova.') }
    if (!response.ok) throw new Error(`OpenStreetMap non è disponibile in questo momento (${response.status}).`)
    const payload = await response.json() as NominatimResult[]
    const candidates = payload.filter((result) => Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon))).map(candidateFromResult)
    writeCache(query, candidates); return candidates
  }
  return { async search(query: string): Promise<NominatimPlaceCandidate[]> { const normalizedQuery = query.trim(); const cached = readCache(normalizedQuery); if (cached) return cached; const key = cacheKey(normalizedQuery); const pending = inFlightSearches.get(key); if (pending) return pending; const request = searchRemote(normalizedQuery).finally(() => inFlightSearches.delete(key)); inFlightSearches.set(key, request); return request } }
}
export const nominatimPlaceDiscovery = createNominatimPlaceDiscovery()
