# Data layer

Adapters for durable local persistence.

Implemented modules:

- `db/` — IndexedDB database definition, schema versions and migrations.
- `repositories/` — domain-oriented persistence APIs; UI never accesses IndexedDB directly.
- `opfs/` — binary asset storage and media lifecycle helpers.
- `storage/` — storage integrity and reconciliation helpers.
- `app-meta.ts` — typed installation metadata stored in `appMeta`.
- `bootstrap.ts` — idempotent local application bootstrap and persistence-state inspection.

Planned modules:

- `import-export/` — neutral serialization boundaries.

Rules:

- Keep transactions short.
- Do not await unrelated asynchronous APIs inside IndexedDB transactions.
- Validate external input before persistence.
- Never expose raw database handles to feature/UI code.
- Bootstrap may inspect storage persistence but must not request persistent storage automatically.
- Installation metadata is local-only and must not be used as an external account or tracking identifier.
