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
- Preview and full-screen object URLs are created only in memory and revoked when their component unmounts.

## Captions and associations

`Media.caption` is optional text metadata with a 500-character UI/service limit.

Gallery media can also carry optional `placeId`, `itineraryId` or `reservationId` associations:

- place choices come from place blocks and itinerary places that belong to the current day;
- manual itinerary entries are linked through `itineraryId`;
- reservation-derived itinerary entries are linked through `reservationId`, which keeps the association stable if a legacy itinerary representation is later reconciled into a persisted itinerary row;
- stale links remain readable as unavailable and can be cleared by the user instead of being silently reassigned.

These fields are metadata only and are not IndexedDB indexes, so they do not require a Dexie schema migration.

## Ordering

`Media.position` is optional. Existing gallery records without a position continue to use creation order. The first manual move writes a complete 1-based order for every active gallery item in the day inside one IndexedDB transaction. Newly imported unpositioned media naturally follows already-positioned items until the user reorders again.

## Full-screen viewing

The gallery can open photos and videos in a modal full-screen viewer. It supports previous/next controls, keyboard arrows and `Escape` to close. The viewer reads the original local OPFS file and does not create a second persisted copy.

## Removal

Removal first tombstones the media metadata and then attempts to purge both metadata and the OPFS file. If physical cleanup fails, the tombstone keeps the file hidden and allows a later integrity cleanup to retry safely.
