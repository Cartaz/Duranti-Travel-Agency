import { createPlaceImportApplication } from '../application/places/place-import'
import { nominatimPlaceDiscovery } from '../data/external/nominatim-place-discovery'

export const placeImportApplication = createPlaceImportApplication(nominatimPlaceDiscovery)
