# DTAgency

Private offline-first travel planner & journal. Plan trips, save ideas, places, bookings, budgets and documents, then turn every journey into a rich multimedia travel book with a playful 3D book experience.

## Engineering philosophy

DTAgency is developed according to **Strategic Programming**: every change must reduce or contain future complexity, protect data compatibility, preserve clear architectural boundaries and prefer durable abstractions over local workarounds.

The binding repository rules are defined in [`AGENTS.md`](AGENTS.md) and the rationale and decision framework live in [`docs/architecture/strategic-programming.md`](docs/architecture/strategic-programming.md).

## Current milestone: Product completion

The storage/security foundation and the strategic architecture audit are integrated in `main`: Dexie/IndexedDB, OPFS media lifecycle, encrypted traveler documents, integrity reconciliation, production Vault export/import/restore with crash recovery, semantic repository queries and automated architectural guardrails.

The core planner is already usable end to end across trips, days, planner blocks, reservations, itinerary, expenses, places, travelers, templates and day media. Active development now focuses on completing the everyday product experience rather than adding new infrastructure.

The current sequence is:

1. expose production backup/restore as an everyday user workflow;
2. complete remaining traveler/document and richer trip-management workflows;
3. build the book/chapter/page presentation and travel-book interaction;
4. polish iPhone/PWA UX, real-device regression coverage and release readiness.

The architectural rule remains strict: browser-managed origin storage is operational storage, never the only backup. Important data must remain exportable to an encrypted `.dtagency` Vault outside Safari's origin storage.

See:

- [`docs/architecture/`](docs/architecture/) for storage/domain decisions;
- [`docs/architecture/strategic-audit-2026-08-25.md`](docs/architecture/strategic-audit-2026-08-25.md) for the completed strategic audit;
- [`docs/architecture/strategic-programming.md`](docs/architecture/strategic-programming.md) for the programming philosophy and change rules;
- [`docs/storage-lab.md`](docs/storage-lab.md) for the manual iPhone storage regression protocol;
- [`src/vault/README.md`](src/vault/README.md) for the production Vault format and restore rules.
