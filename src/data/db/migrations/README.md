# Database migrations

Duranti's IndexedDB schema is versioned by Dexie. `DB_VERSION` in `duranti-db.ts` is the single schema version source.

Rules:

1. Never change an existing store/index definition without incrementing the Dexie version.
2. Every destructive or shape-changing migration must have an explicit `upgrade()` function and tests.
3. Migrations must be deterministic and idempotent from the perspective of application state.
4. Do not perform network requests or long-running work inside an IndexedDB transaction.
5. Imported Vault data is validated before it reaches the live database.
