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

Short `maps.app.goo.gl` links are intentionally rejected in the first slice because resolving them reliably would require a Google network redirect dependency or a proxy. The user is asked to open the short link and copy the expanded browser URL instead. This is preferable to a fragile hidden workaround.

## OpenStreetMap / Nominatim

The initial discovery adapter uses the public Nominatim search endpoint only for searches explicitly triggered by the user. It requests `addressdetails=1`, `extratags=1` and `namedetails=1`; `extratags` may provide telephone and `opening_hours` when those tags exist in OpenStreetMap.

The adapter:

- serializes network calls through one module-level queue and starts at most one in-process request per second;
- rechecks the seven-day local cache after entering the queue, so concurrent identical searches can reuse the first completed lookup;
- caches successful query results locally for seven days;
- sends a browser referrer policy suitable for application identification;
- exposes OpenStreetMap attribution in the UI;
- performs no autocomplete, background refresh, bulk download or systematic POI harvesting.

The queue coordinates callers in the current JavaScript context only. Separate tabs have independent module state and are **not** claimed to share a rate-limit lease. This is acceptable for the current explicit, low-volume personal-use flow; if multi-tab discovery becomes common, add a cross-tab lease or move to a provider whose quota model supports the intended traffic.

The public Nominatim instance is an adapter, not an architectural dependency. If DTAgency grows beyond moderate personal use, the adapter must be switched to another compliant provider or a self-hosted service before increasing traffic.

## Persisted data

`Place` gains optional `phone` and `openingHours` properties. These are additive object properties in the existing `places` table; no IndexedDB index or table layout changes, so database version 1 remains valid and older records simply omit the fields.

Imported candidates store `provider = "openstreetmap"` plus an OSM object identity (`osm_type:osm_id`) when available. Provider identity is provenance metadata, not ownership: after the user reviews and saves the record, the DTAgency copy is ordinary local application data and is included in the normal Vault export like other `Place` records.

No Vault framing, OPFS namespace, cryptographic format, database identifier or table inventory changes in this milestone.

## Data quality

OpenStreetMap coverage is not guaranteed. Name, address, telephone and opening hours are always shown to the user before saving and remain editable. Missing fields stay missing; DTAgency never invents values or silently substitutes data from Google.
