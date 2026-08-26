import type { PlaceDiscoveryPort, PlaceImportCandidate } from '../../application/places/place-import'

type NominatimAddress = Record<string, string | undefined>
type NominatimExtraTags = Record<string, string | undefined>

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  name?: string
  type?: string
  address?: NominatimAddress
  extratags?: NominatimExtraTags
  namedetails?: Record<string, string | undefined>
}

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
    providerPlaceId: String(result.place_id),
  }
}

export const nominatimPlaceDiscovery: PlaceDiscoveryPort = {
  async search(query: string): Promise<PlaceImportCandidate[]> {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '5')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('extratags', '1')
    url.searchParams.set('namedetails', '1')
    url.searchParams.set('accept-language', 'it')

    let response: Response
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' } })
    } catch {
      throw new Error('Non riesco a contattare OpenStreetMap. Controlla la connessione e riprova.')
    }
    if (!response.ok) throw new Error(`OpenStreetMap non è disponibile in questo momento (${response.status}).`)

    const payload = await response.json() as NominatimResult[]
    return payload
      .filter((result) => Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon)))
      .map(candidateFromResult)
  },
}
