# Duranti data model — v1

## Goals

- Local-first: the app remains fully usable without network access.
- Structured data lives in IndexedDB; large binary assets live in OPFS.
- Stable opaque IDs are generated client-side and never changed.
- Every entity has `id`, `createdAt`, `updatedAt` and, where relevant, `deletedAt`.
- Relationships use IDs rather than nested mutable copies.
- User data never requires a cloud account or cloud LLM.
- Export/import is a complete, versioned, encrypted Vault.

## IndexedDB database

Database name: `duranti`.

Schema versions are integers and migrations are append-only. Never rewrite an old migration. A migration must be deterministic and safe to rerun or fail atomically.

### `appMeta`

Singleton application metadata.

- `key` primary key
- `value`

Examples: schema metadata, installation identifier, last successful migration, vault format version.

### `travelers`

People available to trips.

- `id`
- `firstName`
- `lastName`
- `displayName`
- `birthDate`
- `birthPlace`
- `nationality`
- `gender` (optional)
- `email`
- `phone`
- `address` (structured object)
- `notes`
- `createdAt`
- `updatedAt`
- `deletedAt`

Sensitive identity/document data should be kept in a separate record family so normal trip queries do not load it unnecessarily.

### `travelerDocuments`

Sensitive documents belonging to a traveler.

- `id`
- `travelerId`
- `type` (passport, identity-card, driving-license, other)
- `documentNumber`
- `issuingCountry`
- `issueDate`
- `expiryDate`
- `holderName`
- `mediaId` (optional scan/photo reference)
- `notes`
- `createdAt`
- `updatedAt`
- `deletedAt`

Never log document numbers or decrypted document payloads.

### `trips`

A planned, active or completed journey.

- `id`
- `title`
- `subtitle`
- `status` (`planned` | `ongoing` | `completed` | `archived`)
- `startDate`
- `endDate`
- `coverMediaId`
- `summary`
- `currency`
- `homeLocation`
- `createdAt`
- `updatedAt`
- `deletedAt`

Indexes: `status`, `startDate`, `updatedAt`.

### `tripTravelers`

Membership of travelers in a trip.

- `id`
- `tripId`
- `travelerId`
- `role` (`owner` | `companion`)
- `createdAt`

Indexes: `tripId`, `travelerId`, unique logical pair `(tripId, travelerId)`.

### `days`

A chronological day/chapter within a trip.

- `id`
- `tripId`
- `date`
- `sequence`
- `title`
- `summary`
- `templateId` (optional)
- `createdAt`
- `updatedAt`
- `deletedAt`

Indexes: `tripId`, `[tripId+sequence]`, `[tripId+date]`.

### `blocks`

The flexible page editor model. A day is composed of ordered blocks rather than one giant document.

- `id`
- `tripId`
- `dayId` (optional)
- `parentBlockId` (optional)
- `type`
- `position`
- `content` (type-specific JSON)
- `createdAt`
- `updatedAt`
- `deletedAt`

`type` examples: `text`, `heading`, `checklist`, `place`, `map`, `media`, `link`, `quote`, `divider`, `table`, `expense`, `transport`, `accommodation`, `document`, `weatherSnapshot`.

Keep blocks small. Do not put binary data inside `content`.

Indexes: `tripId`, `dayId`, `[dayId+position]`, `parentBlockId`.

### `places`

Normalized locations used by planning and memories.

- `id`
- `name`
- `formattedAddress`
- `latitude`
- `longitude`
- `provider` (e.g. Google Maps)
- `providerPlaceId` (optional)
- `mapsUrl` (optional)
- `countryCode`
- `city`
- `category`
- `notes`
- `createdAt`
- `updatedAt`
- `deletedAt`

Indexes: `providerPlaceId`, `city`, `category`.

Do not make Google Maps the source of truth for Duranti data. Store a durable local snapshot of the fields Duranti needs and retain the external link for live navigation/details.

### `itineraries`

Planning-level items independent of diary blocks.

- `id`
- `tripId`
- `dayId` (optional)
- `type` (`transport` | `activity` | `meal` | `reservation` | `free-time` | `custom`)
- `title`
- `placeId` (optional)
- `startAt`
- `endAt`
- `timezone`
- `status` (`idea` | `planned` | `booked` | `done` | `cancelled`)
- `bookingReference` (optional)
- `notes`
- `position`
- `createdAt`
- `updatedAt`
- `deletedAt`

Indexes: `tripId`, `dayId`, `[dayId+startAt]`, `status`.

### `links`

Saved external references, including links added later from TikTok or Safari.

- `id`
- `tripId`
- `dayId` (optional)
- `blockId` (optional)
- `url`
- `title`
- `domain`
- `description`
- `thumbnailMediaId` (optional)
- `createdAt`
- `updatedAt`
- `deletedAt`

The URL itself is the durable source; metadata is a local snapshot and may become stale.

### `media`

Metadata only. Binary payloads are in OPFS.

- `id`
- `tripId`
- `dayId` (optional)
- `blockId` (optional)
- `kind` (`image` | `video` | `audio` | `document`)
- `mimeType`
- `originalName`
- `sizeBytes`
- `width` (optional)
- `height` (optional)
- `durationMs` (optional)
- `sha256` (optional)
- `opfsPath`
- `createdAt`
- `updatedAt`
- `deletedAt`

Indexes: `tripId`, `dayId`, `kind`, `sha256`.

OPFS path is an implementation detail and must be regenerated/validated during import. The database metadata is authoritative for ownership; the file system is authoritative for binary bytes.

### `templates`

Reusable day/block templates.

- `id`
- `name`
- `description`
- `category`
- `version`
- `definition`
- `createdAt`
- `updatedAt`
- `deletedAt`

Templates are copied into a trip/day when instantiated; later template edits must not silently mutate existing trips.

### `expenses`

Optional ultra-nerd financial detail.

- `id`
- `tripId`
- `dayId` (optional)
- `amountMinor`
- `currency`
- `category`
- `description`
- `paidByTravelerId` (optional)
- `occurredAt`
- `notes`
- `createdAt`
- `updatedAt`
- `deletedAt`

Store money as integer minor units, never floating point amounts.

### `reservations`

Structured booking data.

- `id`
- `tripId`
- `type`
- `provider`
- `confirmationCode`
- `title`
- `startAt`
- `endAt`
- `timezone`
- `placeId` (optional)
- `url` (optional)
- `attachmentMediaId` (optional)
- `notes`
- `createdAt`
- `updatedAt`
- `deletedAt`

### `auditLog`

Local diagnostics and recovery history, not a user-visible activity feed by default.

- `id`
- `timestamp`
- `operation`
- `entityType`
- `entityId` (optional)
- `result`
- `errorCode` (optional)
- `metadata` (non-sensitive)

Never store passwords, document numbers, tokens or raw decrypted Vault contents.

## OPFS layout

Use one application root and stable UUID-based paths:

```text
/duranti/
  media/<mediaId>/original
  media/<mediaId>/thumb-<size>.webp
  media/<mediaId>/preview-<size>.webp
  exports/<temporary-id>/...
  temp/<operation-id>/...
```

Writes use a temporary file followed by a finalize/rename operation where supported. The IndexedDB metadata record is committed only after the binary write succeeds. Deletion is a two-phase operation: mark/delete metadata, then remove the binary; orphan cleanup is handled separately.

## Vault format v1

The Vault is a versioned container, not a database dump.

```text
magic: DURANTI
formatVersion: 1
kdf: PBKDF2-SHA-256
kdfIterations: documented constant
salt: random 16+ bytes
cipher: AES-256-GCM
iv: random 12 bytes
ciphertext: encrypted canonical payload
```

The plaintext payload contains:

- export format version
- app/schema version
- metadata
- all structured records
- media descriptors
- optional embedded media blobs

For large trips, media should be streamed/chunked in a future Vault v2 rather than constructing one enormous JS object. v1 can remain a reliable small/medium-data backup format.

Passwords are never stored. Encryption keys exist only in memory for the duration of an operation.

## Referential integrity

Because IndexedDB does not provide relational foreign keys, repositories enforce relationships at the domain layer.

Deletion policy:

- deleting a trip soft-deletes its dependent trip-owned records;
- deleting a traveler is blocked while active trip membership exists, unless explicitly removed from those trips;
- deleting media requires checking all references before physical deletion;
- missing OPFS files are surfaced as recoverable media errors, never silently replaced.

## Concurrency

The app should assume that multiple app instances can exist. All multi-record mutations use transactions. Long-running operations such as hashing, image processing, compression and encryption must not be held inside an IndexedDB transaction. This follows IndexedDB transaction lifetime rules and avoids `TransactionInactiveError`. citeturn0search1turn0search2

## Security boundaries

- UI never talks directly to IndexedDB/OPFS.
- Features call repositories/use-cases.
- Repositories own persistence details.
- Crypto is isolated behind a Vault service.
- Sensitive traveler documents are never sent to external services.
- Google Maps is an external navigation/data source, not a storage backend.
- No cloud synchronization is part of v1.
