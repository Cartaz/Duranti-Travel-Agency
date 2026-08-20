# Manual itinerary ordering

The day itinerary has two ordering modes that deliberately do not compete with each other.

## Timed entries

Any itinerary entry with `startsAt` is ordered chronologically by its local wall-clock value. A manual up/down action is not available for these entries because time is already the authoritative ordering signal.

## Untimed reservation entries

Reservation-derived entries without a start time keep the order of their owning planner blocks. Their `Itinerary.position` may exist as a synchronized fallback, but the day view preserves planner order rather than allowing the itinerary to become a second source of truth.

## Untimed manual entries

Independent manual stops without a start time are displayed after untimed reservation entries and may be moved up or down relative to other untimed manual stops.

The specialized `ItineraryRepository.moveManualUntimed()` operation:

1. verifies that the target belongs to the requested trip/day;
2. refuses reservation-derived entries;
3. refuses entries that already have `startsAt`;
4. loads active manual untimed siblings for that day;
5. applies the requested move;
6. rewrites normalized positions `1..N` in one Dexie transaction.

This prevents partial reorder state and avoids fractional or ever-growing position values.

## Source-of-truth rule

The visible sequence is therefore:

1. timed entries, chronological;
2. untimed reservation-derived entries, planner order;
3. untimed manual entries, explicit manual order.

Changing a reservation block position continues to affect the itinerary through the planner. Changing a manual itinerary position never mutates planner blocks or reservation records.

No IndexedDB schema migration or new index is required because `Itinerary.position` already exists.
