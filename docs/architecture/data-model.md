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
- `travelerDocument`: sensitive identity-document record whose secret fields are encrypted at rest.
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

`planned -> ongoing -> completed -> archived`

The lifecycle is a domain invariant, not merely a UI filter. A trip can be edited in every state unless a future feature explicitly introduces locking.

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

## Media

IndexedDB stores metadata only. Ordinary photo/video/audio media bytes are kept in OPFS. Blob URLs are runtime-only and must never be persisted.

Traveler passport/identity scans are **not ordinary media**. They must not use the plaintext media OPFS path; they will use the encrypted private-file layer defined by the security architecture.

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

The AES-GCM `encryptedPayload` contains fields such as document number, issuing country, issue/expiry dates, holder name and notes. The secure repository is the only application persistence boundary for these records.

The key hierarchy is defined by ADR-003. Legacy plaintext rows are detected and blocked from normal use until an explicit unlocked migration can encrypt them. Document scans are not enabled until encrypted OPFS storage is available.
