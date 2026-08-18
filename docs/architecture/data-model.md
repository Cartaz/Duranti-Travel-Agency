# Domain Data Model

The model is intentionally relational-by-reference inside IndexedDB. IDs are stable UUIDs. Large media are stored in OPFS and referenced by `mediaId`.

## Core entities

- `traveler`: person profile, contact details, document references and preferences.
- `trip`: a planned, active or completed trip; contains ordered chapters/days.
- `tripTraveler`: membership of a traveler in a trip, allowing the same person to participate in many trips.
- `day`: a calendar/day-plan unit with ordered blocks.
- `block`: generic content unit; type identifies template/domain behavior.
- `place`: saved place with provider metadata, address, coordinates, Google Maps URL and notes.
- `activity`: planned/reserved activity linked to a place and/or day.
- `media`: metadata for a photo/video/document stored in OPFS.
- `link`: external URL with title, source and optional relation to another entity.
- `document`: sensitive travel document metadata linked to a media asset; content remains local.
- `template`: reusable day/block template such as museum, day trip or travel day.
- `vaultMetadata`: local bookkeeping for vault format/version and last export; never stores the password.
- `appSetting`: small non-sensitive preferences and UI state.

## Common fields

```ts
id: string
createdAt: string
updatedAt: string
```

Timestamps are ISO 8601 UTC strings. IDs are immutable. Records should carry a `schemaVersion` when their shape is expected to evolve independently.

## Trip lifecycle

`planned -> active -> completed`

The lifecycle is a domain invariant, not merely a UI filter. A trip can be edited in every state unless a future feature explicitly introduces locking.

## Content blocks

Blocks are intentionally extensible. Examples:

- `text`
- `checklist`
- `place`
- `activity`
- `reservation`
- `transport`
- `lodging`
- `meal`
- `media`
- `link`
- `document`
- `map`
- `budget`
- `weatherSnapshot`

Templates compose blocks and define defaults; they do not own the underlying data.

## Media

IndexedDB stores metadata only:

```text
media.id
media.kind = photo | video | document | audio | generated
media.mimeType
media.byteSize
media.width?
media.height?
durationMs?
opfsPath
sha256?
createdAt
updatedAt
```

The OPFS file is the canonical binary. Blob URLs are runtime-only and must never be persisted.

## Sensitive documents

Passport/ID data should be separated from ordinary trip notes. Store only the minimum metadata required for the UI, keep scans in OPFS, and never include document contents in analytics, logs or crash reports. Vault export must encrypt both metadata and binary assets.
