# UI layer

Reusable presentation components. UI components receive data and callbacks; they do not perform persistence or network operations.

Implemented / active:

- `layout/AppShell.tsx` — iPhone-first safe-area shell, top branding and primary navigation.
- responsive/reduced-motion base styling in `src/styles.css`.

Planned areas:

- `book/` — 3D cover, page turns, chapter transitions and reduced-motion fallback.
- `editor/` — blocks, forms and drag/reorder controls.
- `media/` — galleries, video playback and document previews.
- `map/` — map presentation and place pins.
- `feedback/` — toasts, errors, loading and offline indicators.
- `primitives/` — buttons, dialogs, inputs and accessible base components.
