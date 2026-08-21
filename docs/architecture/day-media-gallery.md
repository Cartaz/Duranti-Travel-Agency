# Day media gallery

The diary media gallery stores photo/video metadata in the existing `media` IndexedDB table and original file bytes in OPFS.

## Ownership

- Gallery media always has both `tripId` and `dayId`.
- Gallery media does not have `blockId`.
- Reservation attachments keep their `blockId` and are therefore excluded from the diary gallery even when they share the same day.
- Archived trips expose the gallery read-only.

## Files

- Images: maximum 25 MiB per file.
- Videos: maximum 250 MiB per file.
- Multiple files can be selected in one import action.
- Common image/video extensions are used as a MIME fallback when the browser does not provide a file type.
- Preview object URLs are created only in memory and revoked when the card unmounts.

## Captions

`Media.caption` is optional text metadata with a 500-character UI/service limit. Adding the optional field does not require a Dexie schema migration because it does not add or change an index.

## Removal

Removal first tombstones the media metadata and then attempts to purge both metadata and the OPFS file. If physical cleanup fails, the tombstone keeps the file hidden and allows a later integrity cleanup to retry safely.
