import type { Place } from '../../domain/entities'

export interface GoogleMapsSearchSource {
  name: string
  formattedAddress?: string
  city?: string
  countryCode?: string
  latitude?: number
  longitude?: number
}

export function buildGoogleMapsSearchUrl(source: GoogleMapsSearchSource): string {
  const hasCoordinates = Number.isFinite(source.latitude) && Number.isFinite(source.longitude)
  const query = hasCoordinates
    ? `${source.latitude},${source.longitude}`
    : [source.name, source.formattedAddress, source.city, source.countryCode]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .join(', ')

  if (!query) throw new Error('Il luogo non contiene abbastanza informazioni per aprire Google Maps.')

  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', query)
  return url.toString()
}

export function googleMapsUrlForPlace(place: Place): string {
  return place.mapsUrl ?? buildGoogleMapsSearchUrl(place)
}
