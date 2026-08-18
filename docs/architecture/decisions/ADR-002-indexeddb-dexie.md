# ADR-002: Dexie over raw IndexedDB

- Status: Accepted
- Date: 2026-08-18

## Decision

Use Dexie 4.x as the production IndexedDB abstraction while keeping IndexedDB as the underlying persistence technology.

## Rationale

Safari/iOS is the primary runtime. Dexie documents Safari-specific workarounds and current Safari support, while providing declarative schemas, migrations and transaction helpers. Native IndexedDB remains available underneath and the domain layer is isolated from the implementation.

## Rules

- Keep transactions short.
- Never await OPFS, media processing or network work inside a transaction.
- Use explicit schema versions and append-only migrations.
- Never change entity primary keys.
- Keep repositories as the only persistence entry point for application code.
