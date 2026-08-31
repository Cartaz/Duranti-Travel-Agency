# Pre-3D strategic closure — 2026-08-31

## Decision

All nine pre-3D `N` findings are closed on `chatgpt/pre-3d-close-all-findings`.

The branch is ready for integration review. Starting the 3D renderer is still gated on merging this remediation into `main` and obtaining a green `main` CI run; branch success is necessary evidence, not a substitute for integration validation.

## Closure matrix

| Finding | Root cause | Structural remediation | Regression evidence |
| --- | --- | --- | --- |
| N1 — reservation attachment atomicity | OPFS creation and reservation linking were orchestrated as separate application mutations, permitting crash windows and compensating cleanup. | The reservation data workflow now owns file write, media metadata, reservation link and previous-media tombstone as one semantic mutation; OPFS orphan cleanup remains recoverable rather than application-orchestrated rollback. | `tests/storage/reservation-attachment-atomicity.test.ts` plus reservation attachment browser journey. |
| N2 — `Block.content` representation leak | `reservationId` and `placeId` were parsed and written independently by multiple modules. | `src/domain/block-content.ts` is the single owner of persisted block-reference encoding/validation. Callers consume semantic accessors instead of knowing the record shape. | `tests/domain/block-content.test.ts`, `tests/storage/block-content-ownership.test.ts`. |
| N3 — application service locator | Presentation components could resolve the entire application registry and acquire undeclared dependencies. | A single Provider remains, but `useApplicationServices(...)` requires explicit capability keys and returns only that typed subset. This avoids multiplying Contexts while making dependencies local and reviewable. | `tests/storage/application-service-scope.test.ts` and TypeScript compilation of every migrated consumer. |
| N4 — hard-coded Nominatim operation | The public Nominatim endpoint was effectively built into the application release, conflicting with the provider's requirement that apps be switchable without a software update. | Endpoint selection moved to non-pre-cached runtime configuration with HTTPS validation and a deliberate fallback. Rate limiting, deduplication, caching and attribution remain encapsulated by the discovery adapter. | `tests/storage/runtime-config-contract.test.ts`, `tests/storage/nominatim-concurrency.test.ts`. |
| N5 — duplicated temporal validation | Reservation and itinerary flows owned parallel local-datetime/timezone parsing rules. | `src/application/shared/temporal-input.ts` owns the shared local datetime and IANA timezone contract; feature-specific range/business rules remain in their respective applications. | `tests/domain/temporal-input.test.ts`. |
| N6 — non-reproducible browser tooling | CI installed Playwright outside the locked dependency graph. | Playwright is a locked development dependency; CI uses the repository lockfile and only installs the required browser binary. | `tests/storage/toolchain-contract.test.ts`, `npm ci`, browser CI. |
| N7 — closure evidence and gate drift | Remediation state, validation evidence and the 3D gate were spread across historical audits and transient CI observations. | This document is the canonical pre-3D closure record and the architecture index points to it. Historical audits remain immutable context rather than competing current state. | Final branch CI plus the integration gate below. |
| N8 — unindexed place reverse references | Safe place deletion scanned `blocks` and `media`, making reference integrity increasingly expensive and hiding missing schema support. | IndexedDB v2 adds only `blocks.content.placeId` and `media.placeId` indexes. v1 remains declared, rows are unchanged, and Vault format v1 accepts DB snapshot v1 then normalizes it to current schema semantics. | `tests/storage/database-contract.test.ts`, `tests/storage/place-reference-index.test.ts`, `tests/vault/database-schema-compatibility.test.ts`, and a browser test that creates DB v1, seeds rows, opens v2, then queries both new indexes. |
| N9 — speculative 3D dependency | Three.js entered the dependency graph before a renderer module owned or used it. | `three` / `@types/three` were removed. They may return only with the renderer that justifies and encapsulates them. | `tests/storage/toolchain-contract.test.ts`. |

## N8 persistence contract

Database v2 is intentionally an index-only migration:

```text
DB v1 rows
   |
   | IndexedDB/Dexie schema upgrade
   v
DB v2 rows (same shape)
   +-- blocks.content.placeId index
   +-- media.placeId index
```

No `.upgrade()` row transformer exists because no persisted value changes representation. The production database retains the v1 declaration and adds v2 as the target schema. The `.dtagency` cryptographic Vault framing remains format version 1; database snapshot version 1 is an accepted legacy input, while unknown schema versions fail closed.

This matches Dexie's versioning model: indexes belong in `stores(...)`, nested indexes use dotted key paths, and schema/index changes are introduced through a new database version. See:

- https://dexie.org/docs/Version/Version.stores%28%29
- https://dexie.org/docs/Version/Version

## N4 external-service constraint

The public Nominatim service is permitted only for moderate, explicitly user-triggered usage under its policy. DTAgency keeps the existing one-request-per-second coordination, caching and attribution, and now allows the endpoint to be replaced without a software release.

Policy: https://operations.osmfoundation.org/policies/nominatim/

## Validation evidence

The first full branch validation after N8 and its real browser migration test is GitHub Actions run `33365997224` on commit `6a4feef8603e626e8ab4a1b23e27aea3ae726c3f`.

It completed successfully with:

- `npm ci` from the committed lockfile;
- `npm audit --audit-level=high` with no reported vulnerabilities;
- repository architecture/persistence policy checks;
- 94/94 Node domain/storage/Vault tests;
- TypeScript project build and Vite production build;
- Chromium installation from the locked Playwright toolchain;
- all browser persistence/application/Vault journeys passing.

A prior browser run correctly failed because its old v1-only baseline guardrail rejected DB v2. The test was not weakened: it was replaced with an actual v1→v2 browser migration that seeds legacy rows, opens the production database, verifies row preservation and queries the two new indexes.

## 3D gate

Before introducing the renderer or re-adding Three.js:

1. merge this remediation branch through normal review;
2. require the resulting `main` commit to pass the same build, policy and browser pipeline;
3. introduce 3D dependencies only in the renderer slice that owns them;
4. keep the existing accessible/non-3D travel-book interaction as the behavioral fallback.

No `N` finding is intentionally deferred into the 3D milestone.
