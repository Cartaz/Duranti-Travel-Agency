import type { PlaceDraft } from './place-application'

export interface PlaceImportCandidate extends PlaceDraft {
  provider: 'openstreetmap'
  providerPlaceId: string
}

export interface PlaceDiscoveryPort {
  search(query: string): Promise<PlaceImportCandidate[]>
}

export interface GoogleMapsImportRequest {
  sourceUrl: string
}

export interface PlaceImportApplication {
  previewGoogleMapsImport(input: GoogleMapsImportRequest): Promise<PlaceImportCandidate[]>
}

function decodedPathPart(value: string): string {
  try { return decodeURIComponent(value.replace(/\+/g, ' ')) } catch { return value.replace(/\+/g, ' ') }
}

function isGoogleMapsHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (normalized === 'maps.app.goo.gl') return true
  return /(^|\.)google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(normalized)
}

export function googleMapsSearchQuery(sourceUrl: string): string {
  const raw = sourceUrl.trim()
  if (!raw) throw new Error('Incolla un link Google Maps.')

  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Il link Google Maps non è valido.') }

  if (url.hostname.toLowerCase() === 'maps.app.goo.gl') {
    throw new Error('Questo è un link Google Maps abbreviato. Aprilo nel browser e copia il link completo dalla barra degli indirizzi, poi riprova.')
  }

  if (!isGoogleMapsHost(url.hostname) || !url.pathname.includes('/maps')) {
    throw new Error('Usa un link completo di Google Maps.')
  }

  const queryParam = url.searchParams.get('query') || url.searchParams.get('q')
  if (queryParam?.trim()) return queryParam.trim()

  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/)
  if (placeMatch?.[1]) {
    const name = decodedPathPart(placeMatch[1]).trim()
    if (name) return name
  }

  throw new Error('Non riesco a ricavare il nome del luogo da questo link. Apri la scheda del ristorante in Google Maps e copia il link completo.')
}

export function createPlaceImportApplication(discovery: PlaceDiscoveryPort): PlaceImportApplication {
  return {
    async previewGoogleMapsImport(input: GoogleMapsImportRequest): Promise<PlaceImportCandidate[]> {
      const query = googleMapsSearchQuery(input.sourceUrl)
      const candidates = await discovery.search(query)
      if (candidates.length === 0) throw new Error('Nessun luogo corrispondente trovato su OpenStreetMap. Puoi comunque inserirlo manualmente.')
      return candidates
    },
  }
}
