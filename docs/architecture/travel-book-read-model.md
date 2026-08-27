# Travel Book read model

The Travel Book is a read-only presentation of data DTAgency already owns. It intentionally does **not** introduce persisted `Book`, `Chapter` or `Page` entities.

## Decision

A dedicated `TravelBookApplication` composes existing trip, day and media read capabilities behind narrow ports. It returns a presentation-neutral `TravelBook` read model whose ordered chapters are derived from `Day` records. Media metadata is projected into each chapter while OPFS-backed bytes are read on demand for the active chapter.

The React reader consumes this model but does not orchestrate repositories, OPFS, day services or persistence itself.

## Completed milestones

1. **Narrative read model** — trip identity/range and ordered day chapters are projected behind the application boundary.
2. **Multimedia chapters** — existing photo/video metadata is projected without duplicate persistence; media files are loaded only when needed and object URLs are revoked by the UI.
3. **Book reading surface** — the reader now presents a responsive two-page spread, chapter progress and a compact chapter index. On narrow screens the spread collapses into a continuous vertical reading surface.
4. **Input and accessibility semantics** — previous/next controls remain explicit, left/right keyboard navigation is available outside interactive controls, progress is exposed semantically and reduced-motion preferences are honored.
5. **Renderer seam** — all navigation remains ordinary reader state over the presentation-neutral model. No Three.js object, camera, scene or renderer state leaks into the application contract.

## Why this is strategic

The current data model already contains the narrative facts needed by the reader: trip title/range plus each day's date, title, summary, `journalText` and media references. Persisting another hierarchy would duplicate ownership and create synchronization and migration problems without enabling a user capability that cannot otherwise be delivered.

The read model creates one stable seam for future renderers. A later 3D book experience should consume the same application-level projection and navigation semantics instead of reaching into planner or media feature code.

## Compatibility and data safety

These milestones change no IndexedDB schema, OPFS namespace, cryptographic framing, Vault format or persisted identifier. The `day:<dayId>` chapter key is an in-memory presentation key only and is not a storage contract.

The book remains readable for archived trips because archival is a lifecycle state, not deletion. Missing trips fail visibly; no write or cleanup operation is performed by the reader.

## Next renderer milestone

Three.js is already an application dependency, but the reader deliberately does not import it yet. The next renderer milestone can add a progressive-enhancement 3D shell around the proven reader contract. It must preserve the 2D reader as an accessible fallback, keep chapter selection outside renderer state, respect reduced-motion/device capability, and avoid introducing persistent book/page entities.
