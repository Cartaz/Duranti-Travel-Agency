# ADR-005 — Deletion, purge, storage reclamation and archive health

- Status: accepted
- Date: 2026-11-27

## Context

The 2026-11 audit (`ANALISI.md`) found that deleted media bytes were never reclaimed, that purge removed OPFS bytes before re-checking the tombstone, that days, trips and travelers could not be deleted, that the app never asked the browser for durable storage, and that concurrent tabs could interleave Vault protocols. Vault semantic validation (`src/vault/database-v1-validator.ts`) requires every reference to resolve, **including references held by tombstoned rows**, so careless purging could make every later backup unrestorable.

## Decisions

### Deletion is a tombstone cascade

Deleting a day, an archived trip or a traveler soft-deletes, in one Dexie transaction (`src/data/repositories/content-deletion-repository.ts`), the entity and every row it owns, found through existing indexes (`dayId`, `tripId`, `travelerId`). Rows are tombstoned, not removed, so the Vault snapshot stays referentially valid.

- Only **archived** trips can be deleted; days require an editable trip.
- Deleted reservations drop `attachmentMediaId`; deleted trips drop `coverMediaId`. This makes the attachment purgeable without leaving a dangling reference.
- Deleting a traveler tombstones memberships and encrypted documents but keeps `expenses.paidByTravelerId`, which still resolves to the tombstoned traveler.

### Purge: row first, bytes second, never a referenced row

`MediaRepository.purge` and `TravelerDocumentRepository.purge` delete the row inside a transaction that re-checks the tombstone, then delete the OPFS bytes. An interruption leaves a recoverable orphan directory, never an active row without bytes. Media still referenced by `reservations.attachmentMediaId` or `trips.coverMediaId` is kept (`'referenced'`). Those columns have no index; the guard scans both small tables, because adding an index would require DB v3 plus a Vault snapshot migration (ADR-004).

After a committed deletion, use cases purge the freed files best-effort and **report** leftovers (`DeletionOutcome.pendingFileCleanup`) instead of swallowing them.

### Storage reclamation is explicit

The backup page offers "Libera spazio": a read-only scan, then, after confirmation, purge of tombstoned media and removal of orphan media directories. Every deletion re-checks current state. It runs under the Vault lock.

### Cross-tab Vault lock

`withVaultLock` (`src/vault/lock.ts`, Web Locks name `dtagency:vault`) serializes export, import staging, restore commit, restore recovery, staging sweep and storage reclamation across tabs. Locked entry points must never call each other (Web Locks are not re-entrant). After a restore the committing tab broadcasts on `BroadcastChannel('dtagency:vault')` and other tabs reload.

### Temporary Vault artifacts

Bootstrap sweeps `dtagency/vault-staging/` and `dtagency/vault-import-staging/` entries older than 6 hours, never the stage referenced by a restore journal. Import stages carry a `created` marker file so empty archives still have an age. The rollback copy under `vault-restore-backup/` is never swept.

An unrecoverable restore journal can be abandoned explicitly from the bootstrap failure screen; this deletes only the journal and keeps the rollback copy.

### Archive health

- Persistence is requested (`navigator.storage.persist()`) only on user action ("Proteggi l'archivio") or right after the user saves a backup, never automatically at bootstrap.
- The date of the last Vault moved outside the browser is stored in `appMeta` under **`vault.lastSavedAt`** (ISO timestamp). The key is part of the Vault snapshot and is now a persisted identifier.
- The shell reminds the user when trips exist and no backup was saved in the last 30 days.

### Passphrases

A single policy (`src/lib/passphrase-policy.ts`, 12 characters) is used by local encryption, the Vault format and the backup UI.

## Consequences

- No schema, Vault format or OPFS layout changed. `vault.lastSavedAt` and the `created` stage marker are additive.
- Restoring a backup brings back that backup's `vault.lastSavedAt`.
- Tombstoned rows keep personal fields (e.g. traveler names) for referential integrity; removing them requires a future, explicitly designed scrubbing step.
