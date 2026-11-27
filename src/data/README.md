# Data layer

Adapters for durable local persistence.

Implemented modules:

- `db/` — IndexedDB database definition, schema versions and migrations.
- `repositories/` — domain-oriented persistence APIs; UI never accesses IndexedDB directly.
- `opfs/` — ordinary media storage plus a separate encrypted private-document namespace.
- `storage/` — read-only media integrity scan plus explicit, re-checking storage reclamation (see ADR-005).
- `external/` — runtime configuration and the validated Nominatim place-discovery adapter.
- `storage-persistence.ts` / `backup-ledger.ts` — adapters for the archive-health use case.
- `app-meta.ts` — typed installation metadata stored in `appMeta`.
- `bootstrap.ts` — idempotent local application bootstrap: interrupted-restore recovery, installation metadata and stale Vault staging sweep.

Planned modules:

- `import-export/` — neutral serialization boundaries.

Rules:

- Keep transactions short.
- Do not await unrelated asynchronous APIs inside IndexedDB transactions.
- Validate external input before persistence.
- Never expose raw database handles to feature/UI code.
- Integrity scans are read-only; destructive reconciliation must be explicit and re-check current references before deletion.
- Persistent storage is requested only on user action or right after a backup is saved, never automatically at bootstrap.
- Installation metadata is local-only and must not be used as an external account or tracking identifier.
