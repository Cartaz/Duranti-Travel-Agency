# Duranti-Travel-Agency

Private offline-first travel planner & journal. Plan trips, save ideas, places, bookings, budgets and documents, then turn every journey into a rich multimedia travel book with a playful 3D book experience.

## Current milestone: Storage Lab

Before building the full travel-book experience, the repository contains a barebone storage proof of concept for the target device (iPhone 16 / iOS / Safari Web App).

The lab tests IndexedDB, OPFS, persistent storage, storage estimates and an encrypted user-controlled Duranti Vault. See [`docs/storage-lab.md`](docs/storage-lab.md) for the manual device test protocol.

The architectural rule is strict: browser-managed origin storage is operational storage, never the only backup. Important data must be exportable to an encrypted Vault that lives outside Safari's origin storage.
