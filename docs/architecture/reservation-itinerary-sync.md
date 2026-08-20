# Reservation → itinerary synchronization

Planner reservation blocks (`transport`, `accommodation`, `restaurant`, `activity`) own a structured `Reservation` record through `block.content.reservationId`.

When a reservation is saved, Duranti also upserts one `Itinerary` entry in the same IndexedDB transaction as the block and reservation write. The itinerary entry stores `reservationId` and `blockId` so ownership is explicit and reversible.

## Field mapping

- `Reservation.title` → `Itinerary.title`
- `placeId` → `placeId`
- `startsAt` / `endsAt` → `startsAt` / `endsAt`
- `timezone` → `timezone`
- `notes` → `notes`
- `confirmationCode` → `bookingReference`
- planner block position → itinerary fallback `position`

Reservation types map to itinerary presentation types as follows:

- `transport` → `transport`
- `restaurant` → `meal`
- `activity` → `activity`
- `accommodation` → `reservation`

Reservation statuses map as follows:

- `planned` → `planned`
- `booked` → `booked`
- `completed` → `done`
- `cancelled` → `cancelled`

## Atomicity and deletion

The specialized reservation-block repository writes `blocks`, `reservations` and `itineraries` in one Dexie transaction. If any ownership or type invariant fails, none of the three records is partially updated.

Deleting a reservation block tombstones the block, its reservation and the owned itinerary entry in the same transaction.

The repository refuses ambiguous states with more than one active itinerary entry for the same reservation.

## Editable manual itinerary entries

The day timeline also supports independent itinerary rows that are not owned by a reservation or planner block. These manual entries may define:

- title;
- itinerary type and status;
- local start/end date-time;
- optional IANA timezone;
- optional saved place;
- optional booking/reference text;
- notes.

Manual entry validation follows the same day/trip temporal boundaries used by reservations: the start belongs to the owning day, the end cannot precede the start, and the end cannot extend beyond the trip return date when one exists.

Manual rows deliberately have no `reservationId` or reservation-owned `blockId`. They can therefore be edited or tombstoned directly from the itinerary timeline without changing planner reservation data.

Reservation-derived rows remain single-source: the itinerary editor never edits their mirrored fields directly. Users change those values in the reservation block that owns them.

## Synchronization states and reconciliation

Every visible itinerary row is classified at read time:

- `manual` — independent editable itinerary row;
- `synced` — persisted reservation-derived row matches the current reservation and planner block;
- `needs-sync` — a valid reservation/block pair exists but the itinerary mirror is missing or stale;
- `orphaned` — the persisted relationship references data that can no longer be resolved safely.

The comparison includes trip/day ownership, block and reservation IDs, place, mapped type/status, start/end, timezone, title, notes, booking reference and planner position.

The explicit **Riallinea** action replays the normal reservation-to-itinerary upsert for valid reservation blocks. It does not silently rewrite manual entries and does not delete or guess how to repair orphaned relationships. Orphans remain visible as a diagnostic state for later manual reconciliation tooling.

## Legacy compatibility

Reservations created before itinerary synchronization may have no persisted itinerary row. The day itinerary query synthesizes a read-only in-memory entry from the existing reservation and planner block, so old trips immediately appear in the timeline without a migration or background write. Such entries are classified `needs-sync`; the explicit reconciliation action or the next reservation save persists the synchronized itinerary normally.

The timeline sorts timed entries by local `startsAt`. For equal or missing times it uses the current planner block position for reservation-derived rows and the persisted itinerary position for manual rows. Moving a reservation block is therefore reflected immediately in visible ordering even before reconciliation updates the stored fallback position.

No new IndexedDB index is required for this increment. Existing Vault data remains structurally compatible.
