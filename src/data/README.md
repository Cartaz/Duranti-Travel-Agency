# Data layer

Adapters for durable local persistence.

Planned modules:

- `db/` — IndexedDB database definition, schema versions and migrations.
- `repositories/` — domain-oriented persistence APIs; UI never accesses IndexedDB directly.
- `opfs/` — binary asset storage, streaming reads/writes and cleanup.
- `storage/` — persistence permission, quota diagnostics and storage health.
- `import-export/` — neutral serialization boundaries.

Rules:

- Keep transactions short.
- Do not await unrelated asynchronous APIs inside IndexedDB transactions.
- Validate external input before persistence.
- Never expose raw database handles to feature/UI code.
