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

## Legacy compatibility

Reservations created before itinerary synchronization may have no persisted itinerary row. The day itinerary query synthesizes a read-only in-memory entry from the existing reservation and planner block, so old trips immediately appear in the timeline without a migration or background write. The next explicit reservation save persists the synchronized itinerary normally.

The timeline sorts timed entries by local `startsAt`. For equal or missing times it uses the current planner block position rather than trusting a potentially stale persisted position, so moving a reservation block is immediately reflected in the visible itinerary.

No new IndexedDB index is required for this increment; `reservationId` is an optional field on `Itinerary`, and existing Vault data remains structurally compatible.
