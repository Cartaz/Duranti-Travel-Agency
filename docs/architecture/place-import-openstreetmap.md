# Zero-billing place import

DTAgency can import a restaurant or other place starting from a Google Maps link without enabling Google Maps Platform, creating an API key or providing billing information to Google.

## Boundary

The flow is deliberately split into three responsibilities:

1. `googleMapsSearchQuery()` parses only information already present in a full Google Maps URL supplied by the user;
2. `PlaceImportApplication` delegates the resulting text query to a narrow `PlaceDiscoveryPort`;
3. the selected candidate is reviewed by the user and persisted through the existing `PlaceApplication` as a normal DTAgency `Place`.

The domain and planner do not depend on Google or OpenStreetMap. A different discovery provider can replace Nominatim behind the port without changing stored places or callers.

## Google Maps handling

DTAgency does not call Google Places API, does not require Google Cloud billing and does not scrape Google Maps page content. The Google Maps URL is only user-provided input.

Short `maps.app.goo.gl` links are intentionally rejected because resolving them reliably would require a Google network redirect dependency or a proxy. The user is asked to open the short link and copy the expanded browser URL instead.

## OpenStreetMap / Nominatim

The discovery adapter uses the configured Nominatim search endpoint only for searches explicitly triggered by the user. It requests `addressdetails=1`, `extratags=1` and `namedetails=1`; `extratags` may provide telephone and `opening_hours` when those tags exist in OpenStreetMap.

The adapter reserves request-start slots so concurrent callers cannot exceed one network request per second, deduplicates identical in-flight searches, coordinates same-origin tabs with Web Locks when supported, caches successful results for seven days, exposes OpenStreetMap attribution, and performs no autocomplete, background refresh, bulk download or systematic POI harvesting.

The public Nominatim instance is deliberately replaceable at runtime. `public/runtime-config.json` owns the endpoint and is excluded from the service-worker precache; the adapter reads it with `cache: no-store` and falls back to `https://nominatim.openstreetmap.org` only when the configuration resource is unavailable. Changing that JSON file changes the provider endpoint without changing the application bundle or persisted data.

This boundary exists because the public Nominatim usage policy requires applications to be able to switch service without a software update. If usage grows beyond moderate personal use, the runtime endpoint must be changed to a compliant provider, proxy, or self-hosted Nominatim service before increasing traffic.

## Persisted data

`Place` has optional `phone` and `openingHours` properties. Imported candidates store `provider = "openstreetmap"` plus an OSM object identity when available. Provider identity is provenance metadata, not ownership: after review, the saved DTAgency copy is normal local application data included in Vault export.

The discovery endpoint itself is operational configuration and is never persisted into a `Place`, Vault archive, domain entity or planner record.

## Data quality

OpenStreetMap coverage is not guaranteed. Name, address, telephone and opening hours are shown to the user before saving and remain editable. Missing fields stay missing; DTAgency never invents values or silently substitutes data from Google.
