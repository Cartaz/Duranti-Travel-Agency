# Strategic programming audit — 2026-08-25

Status: **completed**.

This audit focused on structural leverage rather than local cleanup: dependency direction, ownership and lifecycle invariants, semantic repository queries, historical references, transactional mutations, and duplicated business policy.

## Consolidated outcomes

- Application services depend on ports/domain rather than concrete data adapters.
- Application-backed features resolve capabilities through the application boundary; removed feature-service bridges are policy violations.
- Planner, media, templates, expenses and itinerary use scoped semantic queries where a natural trip/day/category scope exists instead of loading whole tables and filtering in memory.
- Batch lookup (`getMany`) is used for referenced travelers/places where multiple point reads would create N+1 access patterns.
- Generic planner deletion cannot bypass transactional delete paths for expenses and reservation-backed blocks.
- Trip-traveler membership attach/detach mutations enforce the parent-trip lifecycle, including archived trips.
- Reservation deletion owns and tombstones the reservation block, reservation record, derived itinerary record and reservation attachment atomically. Journal media that merely preserve historical context are not reservation-owned records.
- Historical references are preservable when unchanged but cannot be newly assigned when the referenced entity is no longer available. This policy is aligned across media, reservations, itinerary and expense payer handling.
- Block → Reservation → Itinerary type/status mapping is a domain rule with a single implementation in `src/domain/reservation-itinerary-mapping.ts`.
- Architectural dependency direction is covered by an automated storage test in addition to the repository policy check.

## Intentional global reads

A remaining `list()` is not automatically technical debt. Global reads are retained where the user-facing operation is explicitly a complete catalog/picker, including saved places and the traveler catalog. Scoped query APIs remain preferred for trip/day/category contexts.

## Guardrails

The conclusions of this audit are protected by repository policy checks and regression contracts covering semantic queries, archived-state mutations, transactional ownership, historical references, domain mapping, and architectural boundaries. These checks are part of `npm run build` and therefore of the deployment workflow.

## Re-open the strategic audit when

Re-run a focused strategic review when introducing a new persistent aggregate, changing IndexedDB schema/version, adding a new cross-aggregate reference, adding restore/purge semantics, introducing remote sync, or adding a new presentation path that can mutate domain data.

Normal feature development, UX iteration and performance tuning do not by themselves represent unfinished items from this audit.
