# Domain Data Model

The model is intentionally relational-by-reference inside IndexedDB. IDs are stable UUIDs. Large non-sensitive media are stored in OPFS and referenced by `mediaId`.

## Core entities

- `traveler`: person profile, contact details, document references and preferences.
- `trip`: a planned, active or completed trip; contains ordered chapters/days.
- `tripTraveler`: membership of a traveler in a trip, allowing the same person to participate in many trips.
- `day`: a calendar/day-plan unit with ordered blocks.
- `block`: generic content unit; type identifies template/domain behavior.
- `place`: saved place with provider metadata, address, coordinates, Google Maps URL and notes.
- `activity`: planned/reserved activity linked to a place and/or day.
- `media`: metadata for ordinary photo/video/audio/document assets stored in OPFS.
- `link`: external URL with title, source and optional relation to another entity.
- `travelerDocument`: sensitive identity-document record whose secret fields and optional attachment metadata are encrypted at rest.
- `template`: reusable day/block template such as museum, day trip or travel day.
- `appMeta`: local installation, schema, Vault and wrapped encryption-key metadata; never stores the passphrase or an unwrapped key.

## Common fields

```ts
id: string
createdAt: string
updatedAt: string
deletedAt?: string
```

Timestamps are ISO 8601 UTC strings. IDs are immutable. User-facing entities use tombstones before physical purge.

## Trip lifecycle

Active book states are:

`planned -> ongoing -> completed`

A trip may be moved from any active state to `archived`. Archiving is a reversible domain state, not deletion: `archivedFromStatus` records the previous active state so restore returns the chapter to the same section. If older data lacks that field, restore falls back to `planned`.

`archived` is distinct from the repository tombstone in `deletedAt`. Archived trips remain normal persisted entities, remain part of Vault backup/restore, and are hidden from the main book index only by feature-level filtering.

The lifecycle is a domain invariant, not merely a UI filter. Active trips remain editable; archived trips must be restored before editing.

## Content blocks

Blocks are intentionally extensible. Examples:

- `text`
- `checklist`
- `place`
- `activity`
- `reservation`
- `transport`
- `accommodation`
- `media`
- `link`
- `document`
- `map`
- `expense`
- `weatherSnapshot`

Templates compose blocks and define defaults; they do not own the underlying data.

Block order is represented by `position` within a day. Planner reorder operations normalize active positions and write the affected rows in one IndexedDB transaction.

### Place blocks

A `place` block does not duplicate address or coordinate data. Its `content` contains only the stable relationship:

```ts
{ placeId: string }
```

The referenced `place` entity owns the name, address, optional coordinates, category, notes and generated Google Maps URL. The initial implementation accepts manual/offline place data and generates a universal Maps search URL; it does not require a Google API key or automatic geocoding.

Removing a place block tombstones only the block. The `place` entity remains available for future reuse by other days, itinerary items, reservations or the planned place library.

## Media

IndexedDB stores metadata only. Ordinary photo/video/audio media bytes are kept in OPFS. Blob URLs are runtime-only and must never be persisted.

Traveler passport/identity scans are **not ordinary media**. They use the encrypted private-file namespace under `duranti/private/traveler-documents/` and are accessed only through the secure traveler-document repository.

## Sensitive documents

A persisted `travelerDocument` keeps only non-secret relationship/query data in plaintext:

```text
id
travelerId
type
encryptedPayload
createdAt
updatedAt
deletedAt?
```

The AES-GCM `encryptedPayload` contains fields such as document number, issuing country, issue/expiry dates, holder name and notes. If a scan/photo is attached, the same encrypted payload also contains its random attachment ID, private OPFS path, MIME type, original filename and plaintext byte size.

The attachment ciphertext itself is stored separately at:

```text
duranti/private/traveler-documents/<documentId>/<attachmentId>.enc
```

The private-file format contains only its format marker, AES-GCM IV and authenticated ciphertext. It is deliberately separate from the ordinary `media` table and ordinary media OPFS tree.

Private attachment format v1 is limited to 20 MiB because Web Crypto processes the complete encryption/decryption BufferSource in memory. Larger sensitive files require a future chunked authenticated-encryption format.

The key hierarchy and crash-safe attachment lifecycle are defined by ADR-003. Legacy plaintext rows are detected and blocked from normal use until an explicit unlocked migration can encrypt them.
