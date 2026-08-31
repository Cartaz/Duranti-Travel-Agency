# Database v2 — place reference indexes

DTAgency database v2 is an index-only migration from the frozen v1 schema. No entity shape, table inventory, primary key, Vault framing or OPFS namespace changes.

## Added indexes

- `blocks.content.placeId` supports reverse lookup of planner place blocks without scanning the blocks table.
- `media.placeId` supports reverse lookup of gallery/media place references without scanning the media table.

Dexie keeps both schema declarations. Existing v1 databases are upgraded by IndexedDB when opened; no `.upgrade()` row transformation is required because only indexes change.

## Vault compatibility

The `.dtagency` Vault format remains version 1. Database snapshots with schema version 1 remain accepted. During authenticated import the snapshot schema version is normalized in memory to the current database version before restore. Rows are not rewritten because v1 and v2 have the same persisted entity shapes.

Future database version increments must explicitly extend the compatibility policy and tests rather than being accepted implicitly.
