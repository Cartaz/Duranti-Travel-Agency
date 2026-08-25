# ADR-004 — Vault schema compatibility before database v4

- Status: accepted
- Date: 2026-08-25

## Context

DTAgency treats the external encrypted Vault as the authoritative disaster-recovery mechanism for browser-managed local storage. Production Vault v1 currently records the database schema version and accepts only a snapshot whose schema version exactly matches the running application.

That behavior is safe for corruption prevention but is not sufficient for long-lived backups: increasing the IndexedDB schema version without an import migration would make previously valid backups unrestorable by the new application.

## Decision

**DTAgency must not increase the production database schema beyond version 3 until backward-compatible Vault snapshot migration exists and is covered by regression tests.**

Before `DB_VERSION` can become 4, the repository must contain:

1. an explicit Vault snapshot migration boundary separate from live Dexie migrations;
2. support for importing at least the immediately previous production schema snapshot;
3. a committed non-sensitive golden fixture representing a valid previous-schema Vault or a deterministic fixture builder that exercises the same authenticated format;
4. an automated test proving that the previous snapshot is migrated to the current model before live restore;
5. an automated test proving that unsupported future schema versions fail before mutating live IndexedDB or OPFS;
6. documentation of which Vault schema versions are supported by the release.

Vault file-format version and database schema version remain separate concepts. A database migration does not automatically require a new Vault envelope version when the existing envelope can safely carry the migrated snapshot.

## Compatibility rule

Persisted storage identifiers, authenticated AAD strings, magic bytes and legacy OPFS namespaces remain unchanged unless a dedicated compatibility migration explicitly replaces them. Product branding changes must not silently alter authenticated or persisted identifiers.

The user-visible backup filename extension is `.dtagency`; filename extension changes are independent from the authenticated Vault payload format.

## Consequences

- Schema v4 work is intentionally blocked until the restore path is durable across upgrades.
- Future schema work must design live migration and backup migration together.
- Old backups become a first-class regression artifact rather than an informal manual expectation.
- Internal legacy compatibility identifiers may remain visible in implementation code even though the product is called DTAgency.

## Rejected alternative

Accepting only the exact running schema and asking users to recreate backups after every upgrade was rejected because it makes recovery depend on upgrade timing and undermines the Vault's role as durable disaster recovery.
