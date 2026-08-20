# Features

Feature modules contain user workflows and orchestration. They depend on domain contracts and repository interfaces, not browser storage primitives.

Implemented / active:

- `storage-lab/` — regression UI for IndexedDB, OPFS and the legacy diagnostic Vault.
- `trips/` — travel-book index backed by local persistence, trip creation/editing, status grouping, chapter detail navigation and archive/restore lifecycle.
- `days/` — ordered trip-day pages with local create/edit workflows, trip ownership validation and travel-date range enforcement.
- `planner/` — persistent day editor with text, heading, checklist and divider blocks, atomic up/down reordering, soft-delete and read-only archived trips.

Planned next:

- `planner/` — richer block types and guided planning.
- `places/` — saved places, Google Maps references and map UI.
- `media/` — capture/import/organize photos and videos.
- `travelers/` — reusable companion profiles and secure document references.
- `templates/` — museum, day trip, travel day and custom templates.
- `vault/` — production encrypted export/import UI.
- `book/` — book/chapter/page presentation state and page-turn interaction.
