# Database migrations

Duranti's IndexedDB schema is versioned by Dexie. `DB_VERSION` in `duranti-db.ts` is the current target schema version.

Rules:

1. Never change an existing store/index definition without incrementing the Dexie version.
2. Keep historical declarations that installed clients may still need for upgrades.
3. Every destructive or row-shape-changing migration must have an explicit `upgrade()` function and tests.
4. Pure store/index changes may rely on Dexie's schema diff without a row-level `upgrade()` callback.
5. Migrations must be deterministic and atomic from the perspective of application state.
6. Do not perform network, OPFS, Web Crypto, media decoding or other unrelated asynchronous work inside an IndexedDB upgrade transaction.
7. Imported Vault data is validated before it reaches the live database.

## Version history

### v1

Initial production Dexie schema for trips, travelers, documents, days, blocks, places, media, links, itineraries, templates, expenses, reservations and the local audit log.

This declaration is frozen.

### v2

- adds `appMeta` with primary key `key`;
- adds `[tripId+sequence]` for ordered trip days;
- keeps `[tripId+date]` for date-based day lookup;
- removes unused standalone/compound indexes from blocks and places;
- adds `category` for places;
- adds `domain` for saved links;
- adds `[dayId+startsAt]` for itinerary ordering;
- adds `occurredAt` for expenses;
- adds `placeId` for reservations.

No row payload is rewritten in v2, so there is intentionally no `upgrade()` callback. The non-unique `[tripId+travelerId]` index remains unchanged in v2; enforcing uniqueness requires a dedicated migration that first detects and resolves any historical duplicates.
