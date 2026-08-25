# DTAgency

Private offline-first travel planner & journal. Plan trips, save ideas, places, bookings, budgets and documents, then turn every journey into a rich multimedia travel book with a playful 3D book experience.

## Engineering philosophy

DTAgency is developed according to **Strategic Programming**: every change must reduce or contain future complexity, protect data compatibility, preserve clear architectural boundaries and prefer durable abstractions over local workarounds.

The binding repository rules are defined in [`AGENTS.md`](AGENTS.md) and the rationale and decision framework live in [`docs/architecture/strategic-programming.md`](docs/architecture/strategic-programming.md).

## Current milestone: App Shell

The storage/security foundation is integrated in `main`: Dexie/IndexedDB, OPFS media lifecycle, encrypted traveler documents, integrity reconciliation and production Vault export/import/restore with crash recovery.

The active development milestone is the first real application shell for iPhone. The travel index is the default screen, while the Storage Lab remains available as a diagnostic route for regression testing.

The architectural rule remains strict: browser-managed origin storage is operational storage, never the only backup. Important data must remain exportable to an encrypted `.dtagency` Vault outside Safari's origin storage.

See:

- [`docs/architecture/`](docs/architecture/) for storage/domain decisions;
- [`docs/architecture/strategic-programming.md`](docs/architecture/strategic-programming.md) for the programming philosophy and change rules;
- [`docs/storage-lab.md`](docs/storage-lab.md) for the manual iPhone storage regression protocol;
- [`src/vault/README.md`](src/vault/README.md) for the production Vault format and restore rules.
