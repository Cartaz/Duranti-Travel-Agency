# ADR-004 — Vault compatibility before database v2

- Status: accepted
- Date: 2026-08-25

## Context

DTAgency treats the external encrypted Vault as the authoritative disaster-recovery mechanism for browser-managed local storage. Before any meaningful production data exists, persistence has been reset to one clean DTAgency v1 baseline: database schema v1, Vault format v1 and DTAgency-only storage/cryptographic identities.

The current Vault records the database schema version and accepts only a snapshot whose schema version exactly matches the running application. That is correct for the v1 baseline, but a future database schema change must not make valid user backups unrestorable.

## Decision

**DTAgency must not increase `DB_VERSION` beyond 1 until backward-compatible Vault snapshot migration exists and is covered by regression tests.**

Before `DB_VERSION` can become 2, the repository must contain:

1. an explicit Vault snapshot migration boundary separate from live Dexie migrations;
2. support for importing the production v1 database snapshot into the new current model;
3. a committed non-sensitive v1 golden fixture or deterministic fixture builder exercising the authenticated format;
4. an automated test proving that a v1 snapshot is migrated before live restore;
5. an automated test proving that unsupported future schema versions fail before mutating live IndexedDB or OPFS;
6. documentation of the Vault/database snapshot versions supported by the release.

Vault envelope version and database schema version remain separate concepts. A database migration does not automatically require a new Vault envelope version when the existing authenticated envelope can safely carry the migrated snapshot.

## Baseline rule

The DTAgency v1 identifiers are authoritative:

- IndexedDB name: `dtagency`;
- OPFS root: `dtagency/`;
- Vault magic: `DTAVLT01`;
- private-document magic: `DTADOC01`;
- Vault manifest identity: `dtagency-vault`;
- authenticated Vault AAD namespace: `dtagency|vault|v1|...`;
- local encrypted-data AAD namespace: `dtagency|encrypted-*|v1|...`;
- production Vault extension: `.dtagency`.

No predecessor persistence identifiers are supported by the baseline. Once meaningful user data exists, these identifiers become compatibility contracts and future changes require explicit migration and regression tests.

## Consequences

- Schema v2 work is intentionally blocked until restore compatibility is implemented.
- Future schema work must design live migration and backup migration together.
- Production v1 becomes the first golden compatibility artifact.
- There is no compatibility layer for pre-release persistence identities.

## Rejected alternative

Keeping pre-release identifiers indefinitely was rejected because there is no meaningful user data requiring compatibility and doing so would create permanent migration burden without user benefit.
