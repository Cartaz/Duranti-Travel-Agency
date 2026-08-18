# Duranti Storage Lab

The first implementation milestone is deliberately a storage-only proof of concept. It must be tested on the target device: iPhone 16, Safari/Web App on iOS.

## What this PoC tests

- IndexedDB as application data storage.
- Origin Private File System (OPFS) availability and a 100 MB write probe.
- `navigator.storage.persist()` / `navigator.storage.persisted()`.
- Storage usage/quota reporting.
- Offline/online state.
- Encrypted `.duranti-test` export/import using PBKDF2-SHA-256 and AES-256-GCM.

## Manual protocol

1. Run the app over HTTPS and add it to the iPhone Home Screen.
2. Open **Storage Lab** and press **Create test data**.
3. Close the Web App completely and reopen it. The record must remain.
4. Press **Request persistent storage** and record whether `Persistent grant` becomes `YES`.
5. Press **Add 100 MB to OPFS** and verify that the page remains responsive and the usage estimate changes.
6. Export the encrypted test vault and save it somewhere outside Safari, preferably in **Files → On My iPhone → Duranti**.
7. Verify that the exported file cannot be read as plaintext JSON containing the test payload without the password.
8. Use iOS **Settings → Apps → Safari → Clear History and Website Data**. This is destructive for the test origin; only proceed after verifying the vault exists outside Safari.
9. Reopen the Web App. The internal test data may be gone. That is expected and is the reason the external Vault exists.
10. Import the `.duranti-test` file and verify that the test record is restored.
11. Repeat the test with real image/video selection only after the basic flow passes.

## Acceptance criteria

The storage architecture is acceptable only if:

- normal relaunch preserves application data;
- offline relaunch preserves application data;
- persistent storage can be requested and its result is observable;
- OPFS can hold representative media data on the target device;
- the encrypted Vault survives Safari website-data deletion because it was saved outside origin storage;
- an imported Vault restores the application state;
- an incorrect Vault password fails without modifying existing data;
- a corrupt/incomplete Vault fails safely without modifying existing data.

## Important limitation

No browser-managed origin storage is considered a permanent backup. `persistent` storage protects against normal storage eviction; it does not make the data immune to deliberate user deletion of website data.
