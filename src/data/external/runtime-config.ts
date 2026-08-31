export interface RuntimeConfig {
  nominatimEndpoint: string
}

export const DEFAULT_NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org'

function normalizedEndpoint(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_NOMINATIM_ENDPOINT
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('L’endpoint Nominatim configurato non è un URL valido.') }
  if (url.protocol !== 'https:') throw new Error('L’endpoint Nominatim configurato deve usare HTTPS.')
  if (url.username || url.password || url.search || url.hash) throw new Error('L’endpoint Nominatim configurato non può contenere credenziali, query o frammenti.')
  return url.toString().replace(/\/$/, '')
}

export async function loadRuntimeConfig(
  configUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<RuntimeConfig> {
  let response: Response
  try {
    response = await fetcher(configUrl, { cache: 'no-store', headers: { Accept: 'application/json' } })
  } catch {
    return { nominatimEndpoint: DEFAULT_NOMINATIM_ENDPOINT }
  }
  if (!response.ok) return { nominatimEndpoint: DEFAULT_NOMINATIM_ENDPOINT }

  let payload: unknown
  try { payload = await response.json() } catch { throw new Error('La configurazione runtime DTAgency non contiene JSON valido.') }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('La configurazione runtime DTAgency non è valida.')
  return { nominatimEndpoint: normalizedEndpoint((payload as Record<string, unknown>).nominatimEndpoint) }
}

let endpointPromise: Promise<string> | undefined

export function resolveNominatimEndpoint(): Promise<string> {
  if (!endpointPromise) {
    const basePath = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`
    const configUrl = new URL(`${basePath}runtime-config.json`, window.location.origin).toString()
    endpointPromise = loadRuntimeConfig(configUrl).then((config) => config.nominatimEndpoint)
  }
  return endpointPromise
}
