# Database migrations

DTAgency's IndexedDB schema is versioned by Dexie. `DB_VERSION` in `dtagency-db.ts` is the current target schema version.

## Current baseline

DTAgency starts from a single production baseline: **database schema v1**. Pre-release schema declarations were removed because no meaningful user data requires upgrade compatibility.

The v1 schema contains the current stores and indexes for app metadata, trips, travelers, encrypted traveler documents, trip membership, days, blocks, places, media, links, itineraries, templates, expenses, reservations and audit records.

## Rules from the first meaningful-data release onward

1. Never change an existing store/index definition without incrementing the Dexie version.
2. Keep historical declarations that installed clients may still need for upgrades.
3. Every destructive or row-shape-changing migration must have an explicit `upgrade()` function and tests.
4. Pure store/index changes may rely on Dexie's schema diff only when the compatibility impact is understood and tested.
5. Migrations must be deterministic and atomic from the perspective of application state.
6. Do not perform network, OPFS, Web Crypto, media decoding or other unrelated asynchronous work inside an IndexedDB upgrade transaction.
7. Imported Vault data is validated and migrated in staging before it reaches the live database.
8. A database schema bump and its Vault snapshot migration must be designed together.
9. `DB_VERSION` may not become 2 until ADR-004's Vault v1 compatibility requirements are implemented and tested.

## Version history

### v1 — DTAgency production baseline

Single clean baseline containing the current schema. This declaration becomes a compatibility contract once meaningful user data is produced.
