# Duranti-Travel-Agency

Private offline-first travel planner & journal. Plan trips, save ideas, places, bookings, budgets and documents, then turn every journey into a rich multimedia travel book with a playful 3D book experience.

## Current milestone: App Shell

The storage/security foundation is now integrated in `main`: Dexie/IndexedDB, OPFS media lifecycle, encrypted traveler documents, integrity reconciliation and production Vault export/import/restore with crash recovery.

The active development milestone is the first real application shell for iPhone. The travel index becomes the default screen, while the original Storage Lab remains available as a diagnostic route for regression testing.

The architectural rule remains strict: browser-managed origin storage is operational storage, never the only backup. Important data must remain exportable to an encrypted `.duranti` Vault outside Safari's origin storage.

See:

- [`docs/architecture/`](docs/architecture/) for storage/domain decisions;
- [`docs/storage-lab.md`](docs/storage-lab.md) for the manual iPhone storage regression protocol;
- [`src/vault/README.md`](src/vault/README.md) for production Vault format and restore rules.
