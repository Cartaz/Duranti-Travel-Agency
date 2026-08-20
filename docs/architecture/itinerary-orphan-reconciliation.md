# Itinerary orphan reconciliation

Itinerary rows derived from reservation blocks normally carry both `reservationId` and `blockId`. Older data or interrupted/manual migrations can leave an active itinerary row whose source reservation or source block is no longer active.

The itinerary UI treats these rows as **orphaned** and never rewrites or deletes them automatically.

## Explicit recovery actions

For an orphaned itinerary row the user can choose one of two safe actions:

1. **Convert to manual stop** — preserves the visible itinerary data but clears `reservationId` and `blockId`, making the row an independent manual itinerary item.
2. **Remove orphaned stop** — soft-deletes only the orphaned itinerary row.

Both actions first re-check the current active reservation/block graph. If a complete active source pair exists again, the operation is rejected and the normal reservation reconciliation workflow must be used instead.

When an untimed orphan is converted to a manual stop, it is appended to the current manual untimed ordering sequence rather than retaining a stale planner-derived position.

## Residual-link detection

A row is not considered safely manual merely because its active reservation cannot currently be resolved. Any residual `reservationId` or `blockId` keeps the row behind the orphan recovery workflow. This prevents stale block references from accidentally exposing reservation-derived data to the normal manual editor or manual reorder controls.

## Why relinking is not automatic

A missing reservation or planner block can be ambiguous. The app does not guess ownership from title, time, place, confirmation code or other mutable fields. Automatic fuzzy relinking could silently associate a stop with the wrong booking.

If a future workflow adds explicit relinking, it should require the user to choose a concrete active reservation/block pair and should validate exact trip/day/type ownership before writing any references.

## Storage behavior

No new IndexedDB table or index is required. Conversion updates the existing itinerary row in place; removal uses the normal itinerary tombstone lifecycle. Existing Vault exports remain structurally compatible.
