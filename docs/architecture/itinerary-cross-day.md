# Cross-day itinerary overview

The trip detail page exposes a read-only itinerary overview that combines every persisted trip day into one continuous sequence.

## Data loading

`trip-itinerary-service.ts` loads the trip days and the active itinerary, place, reservation and planner-block collections once for the trip. Day sections are then derived in memory instead of calling the complete day-itinerary read workflow once per day.

This overview intentionally uses the same reservation mapping and synchronization semantics as the editable day timeline:

- persisted manual itinerary rows remain manual;
- valid reservation/block pairs are classified as synchronized or needing reconciliation;
- active reservations that do not yet have a persisted itinerary row receive the same synthetic legacy representation;
- missing or invalid source relationships remain visible as orphaned/attention states;
- no implicit repair or fuzzy matching is performed.

## Ordering

The cross-day view keeps trip days in their existing `Day.sequence` order. Within each day the display follows the same rules as the editable timeline:

1. entries with `startsAt` are ordered chronologically;
2. untimed reservation-derived entries preserve current planner order;
3. independent untimed manual entries use their persisted manual `position`.

Cancelled entries remain visible but visually de-emphasized.

## Interaction boundary

The cross-day overview is intentionally read-only. Each day header links back to the existing day planner, which remains the editing surface for manual itinerary stops, reservations, reconciliation and manual ordering.

This avoids introducing a second editing surface with competing ownership rules.

## Storage impact

No IndexedDB schema, table, index or migration is required. The feature only reads existing `days`, `itineraries`, `places`, `reservations` and `blocks` data.
