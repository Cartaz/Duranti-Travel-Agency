# Features

Feature modules contain user workflows and orchestration. They depend on domain contracts and repository interfaces, not browser storage primitives.

Implemented / active:

- `storage-lab/` — regression UI for IndexedDB, OPFS and the legacy diagnostic Vault.
- `trips/` — travel-book index backed by local persistence, trip creation/editing, status grouping, chapter detail navigation, archive/restore lifecycle and an optional exact minor-unit budget in the trip currency.
- `days/` — ordered trip-day pages with local create/edit workflows, trip ownership validation and travel-date range enforcement.
- `planner/` — persistent day editor with text, heading, checklist, divider, place, transport, accommodation, restaurant, activity and expense blocks, atomic up/down reordering, soft-delete and read-only archived trips.
- `places/` — manually saved local places linked from planner blocks with universal Google Maps URLs; no Google API key or automatic geocoding required.
- `reservations/` — transport, accommodation, restaurant and activity records linked atomically to planner blocks, with local wall-clock date/time, separate IANA timezone, optional saved place and booking link; reservation saves also synchronize an itinerary entry used by the day timeline, with read-only fallback for legacy reservations not yet persisted into itinerary data. Each saved reservation can own one local PDF/image attachment stored in OPFS with metadata in IndexedDB, including replace/remove cleanup.
- `itinerary/` — editable day timeline ordered first by local start time. Users can create/edit/delete independent manual stops; reservation-derived entries remain single-source and expose synchronized, needs-sync or orphaned states with explicit reconciliation. Untimed reservation entries retain planner order, untimed manual stops can be reordered transactionally, and orphaned source links can be explicitly converted into independent manual stops or soft-deleted after a fresh source-graph check.
- `expenses/` — exact minor-unit expense records linked atomically to planner blocks, payer assignment restricted to trip participants, per-day/category/payer summaries, trip budgets, and optional explicit per-expense FX into the trip currency using only a user-supplied rate and exact integer conversion math.
- `travelers/` — reusable system-level traveler profiles and trip memberships with role management and duplicate-membership protection; identity documents remain behind the encrypted document boundary.

Planned next:

- `planner/` — richer block types and guided planning.
- `places/` — reusable place library, richer map UI and provider-assisted lookup only when explicitly enabled.
- `reservations/` — multiple attachments and richer booking-specific fields.
- `itinerary/` — richer cross-day views and, if needed, explicit user-selected relinking to a concrete reservation/block pair without fuzzy matching.
- `expenses/` — richer budget views, reconciliation and optional saved FX-rate metadata/source notes.
- `media/` — capture/import/organize photos and videos.
- `travelers/` — encrypted identity-document UI, addresses/preferences and membership reconciliation tooling.
- `templates/` — museum, day trip, travel day and custom templates.
- `vault/` — production encrypted export/import UI.
- `book/` — book/chapter/page presentation state and page-turn interaction.
