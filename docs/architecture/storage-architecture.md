# DTAgency storage architecture

## Source-of-truth rules

| Data | Primary storage | Backup | Notes |
|---|---|---|---|
| Trips, days, places, itinerary, links | IndexedDB | Vault | Structured/queryable |
| Traveler profiles | IndexedDB | Vault | Sensitive fields isolated |
| Passport/ID metadata | IndexedDB | Vault | Never logged |
| Photos/videos/audio/PDFs | OPFS | Vault | IndexedDB stores metadata only |
| App shell/assets | Cache Storage | Deployment | Rebuildable, never user data |
| Storage diagnostics | Runtime + optional audit log | No | Never trusted as user data |

## Layers

```text
UI
  ↓
Use cases / application services
  ↓
Domain models + policies
  ↓
Repositories
  ↓
IndexedDB / OPFS / Vault
```

The UI must not import the database implementation. This makes the storage engine replaceable without rewriting the planner or book UI.

## Database choice

Use **Dexie 4.x** as the IndexedDB abstraction for production. Safari/iOS is a primary target and Dexie explicitly maintains Safari workarounds and testing. Native IndexedDB remains the underlying persistence technology, so the architecture is not coupled to a remote database. citeturn0search0

Dexie transactions must remain short and must not await unrelated asynchronous APIs inside a transaction. CPU-heavy or asynchronous work such as Web Crypto, media decoding and OPFS operations belongs outside the transaction; persist the resulting metadata in a separate short transaction. citeturn0search2turn0search9

## OPFS

OPFS is the binary store. WebKit documents it as an origin-private file system intended for efficient file operations and notes that it is not necessarily a direct representation of the user's visible filesystem. citeturn0search6

Rules:

1. Never put full-resolution video/photo blobs in IndexedDB unless a browser compatibility fallback is explicitly required.
2. Every OPFS file has a metadata record in `media`.
3. Use UUID paths, never user-controlled filenames as paths.
4. Write to temporary locations before finalizing.
5. Hash media when practical for integrity/deduplication.
6. Generate thumbnails/previews asynchronously.
7. Never make the UI wait on a full video scan just to render a trip.

## Persistence and quota

Request `navigator.storage.persist()` during an appropriate user-driven setup flow, but treat the result as a protection mechanism rather than a backup. WebKit's storage policy covers IndexedDB, Cache API, File System and Service Worker storage and describes quota/eviction constraints. citeturn0search7

`navigator.storage.estimate()` is diagnostic only. Never use it to decide whether a specific file is present or to calculate exact application size.

## Write protocol

### Structured data

```text
validate domain object
      ↓
short Dexie transaction
      ↓
commit
      ↓
notify application state
```

### Media

```text
select/import media
      ↓
validate type + size
      ↓
write OPFS temporary file
      ↓
compute metadata/hash
      ↓
finalize OPFS file
      ↓
short Dexie transaction for media metadata
      ↓
notify UI
```

If the metadata transaction fails, a background orphan cleanup removes the unreferenced OPFS file. If OPFS finalization fails, no metadata record is created.

## Delete protocol

Deletes are deliberately not implemented as one giant operation:

```text
mark metadata deleted
      ↓
remove references
      ↓
physical OPFS cleanup
      ↓
final cleanup/compaction
```

A crash between stages must leave recoverable state rather than a broken trip. A storage-maintenance task can reconcile metadata and OPFS later.

## Vault

The Vault is the only portable backup format in v1. It is encrypted before leaving the app and has no server dependency.

The Vault service is responsible for:

- canonical serialization;
- random salt/IV generation;
- password-based key derivation;
- AES-256-GCM encryption/decryption;
- format/version validation;
- integrity validation;
- import staging;
- atomic commit of imported structured data;
- media extraction to temporary OPFS paths followed by finalization.

Never import directly into live data. Stage, validate, then commit. An import failure must leave the existing trip database untouched.

## Recovery model

The user should eventually have two levels of recovery:

1. **Automatic local persistence:** IndexedDB + OPFS + persistent storage request.
2. **Explicit portable backup:** encrypted `.dtagency` Vault saved through the iOS Files/share flow.

The second is the authoritative disaster-recovery mechanism because browser storage can be cleared or evicted even when persistence is requested. WebKit explicitly distinguishes storage policy from a user-managed backup. citeturn0search7

## Privacy boundary

No application feature may require a cloud service for normal operation. Network access is opt-in and contextual:

- open external museum/attraction links;
- launch Google Maps URLs;
- optionally fetch non-sensitive metadata in future;
- never upload passport/ID images, private diary content or personal records.

No cloud LLM is part of the architecture.
