# Features

Feature modules contain user workflows and orchestration. They depend on domain contracts and repository interfaces, not browser storage primitives.

Implemented / active:

- `storage-lab/` — regression UI for IndexedDB, OPFS and the legacy diagnostic Vault.
- `trips/` — initial travel-book index shell with planned / in-progress / completed chapter sections.

Planned next:

- `trips/` — real trip creation, editing, status and chapter navigation.
- `planner/` — free-form and guided planning.
- `days/` — day timeline and block editor.
- `places/` — saved places, Google Maps references and map UI.
- `media/` — capture/import/organize photos and videos.
- `travelers/` — reusable companion profiles and secure document references.
- `templates/` — museum, day trip, travel day and custom templates.
- `vault/` — production encrypted export/import UI.
- `book/` — book/chapter/page presentation state.
