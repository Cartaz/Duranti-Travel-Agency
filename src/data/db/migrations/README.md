# Database migrations

DTAgency's IndexedDB schema is versioned by Dexie. `DB_VERSION` in `dtagency-db.ts` is the current target schema version.

## Current baseline

The current schema is **v2**. v1 remains declared because installed clients may still open a v1 database; v2 only adds query indexes (`blocks.content.placeId`, `media.placeId`) and needs no row upgrader. Vault format v1 accepts database snapshots v1 and v2 and normalizes them to the current schema (`src/vault/database-schema-compatibility.ts`).

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
9. `DB_VERSION` may not become 3 until the Vault snapshot migration for v2 → v3 exists and is tested (ADR-004); `scripts/check-repo-policy.mjs` enforces the current ceiling.

## Version history

### v1 — DTAgency production baseline

Single clean baseline. This declaration is a compatibility contract.

### v2 — place reverse-reference indexes

Adds `blocks.content.placeId` and `media.placeId` so safe place deletion resolves references through indexes. Rows are unchanged; covered by the browser upgrade contract and `tests/storage/database-contract.test.ts`.
