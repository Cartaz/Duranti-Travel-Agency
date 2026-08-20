# Reservation attachment lifecycle

Reservation attachments reuse the ordinary `media` entity and OPFS storage instead of storing binary data in IndexedDB.

## Scope

The first reservation attachment workflow supports one attachment per saved reservation:

- PDF
- JPEG
- PNG
- WebP
- GIF
- maximum 25 MiB

HTML, SVG and executable formats are deliberately excluded from this surface.

## Ownership

`Reservation.attachmentMediaId` points to one active `Media` record. The media record is owned by the same planner context:

```ts
{
  tripId,
  dayId,
  blockId,
  kind: 'image' | 'document'
}
```

Attachment reads and writes validate that trip, day and block ownership match the reservation block before exposing or changing the media.

## Persistence

`MediaRepository.create()` writes the binary to OPFS first and then persists metadata. If metadata persistence fails, it attempts to remove the newly written OPFS file.

Attaching a newly created media record updates `Reservation.attachmentMediaId` inside an IndexedDB transaction. Replacing or removing an attachment tombstones the previous media metadata in the same transaction as the reservation update.

After a successful replacement/removal, the old tombstoned media is purged from OPFS on a best-effort basis. If physical deletion fails, the tombstone remains authoritative and later integrity cleanup can safely retry the purge.

If attaching the new media fails after its OPFS write, the feature attempts to tombstone and purge that new media before rethrowing the original error.

Deleting a reservation planner block tombstones the block, reservation, synchronized itinerary entry and active attachment metadata in one IndexedDB transaction. The attachment binary remains eligible for later purge through the ordinary media lifecycle.

## UI rules

A reservation must exist before an attachment can be added. This avoids creating unattached media for an unsaved reservation draft.

The editor allows:

- add attachment
- replace attachment
- open local attachment through a runtime-only Blob URL
- remove attachment

Blob URLs are never persisted and are revoked after use.
