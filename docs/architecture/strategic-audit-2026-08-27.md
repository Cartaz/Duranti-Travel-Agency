# Strategic programming audit — 2026-08-27

Status: **3D blocked pending P0/P1 remediation**.

Scope: current `main` after the Travel Book reader milestone, including application/domain boundaries, IndexedDB/Dexie persistence, OPFS, Vault import/restore, local encryption, cross-aggregate ownership, UI composition, query proportionality, third-party place discovery, and automated regression coverage.

## Executive assessment

DTAgency has a strong architectural baseline: application ports are real, persistent compatibility contracts are guarded, Vault restore is journaled and recoverable, reservation/expense ownership is transactional, historical references are treated deliberately, and repository policy tests catch dependency inversions.

The audit nevertheless found several issues that should be resolved before adding the 3D renderer. The most important concern partial writes, restore validation, unnecessarily broad access to encrypted data, and concurrency-sensitive ordering. Adding a renderer before resolving these would increase presentation complexity while known persistence invariants remain weaker than the project philosophy requires.

## P0 — stop-the-line

### A1. Day creation from a template is not atomic

`DayTemplateApplication.createTripDayFromTemplate` creates the day, updates its `templateId`, and then inserts template blocks one by one through independent repository writes. Its catch block performs compensating tombstone/purge cleanup, but a tab/process interruption cannot execute that cleanup.

Failure mode: an interrupted template creation can persist a day with no blocks or only a prefix of the intended template. All records live in IndexedDB, so this workflow can and should be one transaction-owned data operation instead of application-level compensation.

Required remediation:

- introduce a narrow transaction port such as `createDayFromTemplate(...)` owned by the data layer;
- allocate and validate the complete mutation before entering the transaction;
- insert the day and all blocks atomically;
- add a failure regression contract proving no partial day survives;
- remove compensating purge logic once the atomic path is in place.

Strategic rule: protect user data; fail recoverably; eliminate workarounds at the source.

## P1 — high priority before 3D

### A2. Vault import validates table identity but not full domain shape or referential integrity

The Vault importer strongly validates cryptographic framing, manifest identity, table inventory, primary keys, entity base fields, and block basics. For most entity tables, however, rows are only checked with `assertEntityBase`; only blocks receive an additional shape validator.

Consequences:

- impossible dates, statuses, currencies or roles can enter the live database through restore;
- malformed encrypted traveler-document rows are not rejected at the table-validation stage;
- invalid media kinds, paths or sizes and invalid reservation, itinerary or template shapes can be committed;
- cross-table references are not validated before replacement.

An authenticated archive protects integrity of bytes, not semantic validity. A Vault exported by a buggy older build, a hand-built test archive, or a future incompatible producer can therefore restore semantically invalid v1 state.

Required remediation:

- implement table-specific v1 validators for every persisted entity;
- validate relevant cross-table references and ownership rules before staging is considered commit-ready;
- keep historical-reference policy explicit rather than requiring every reference target to be active;
- add negative Vault fixtures for malformed rows and invalid reference graphs.

Strategic rule: compatibility must be explicit; invalid states should be hard to represent; recovery paths require the strongest tests.

### A3. Traveler-document queries read and decrypt the entire document table for one traveler

`TravelerDocumentApplication.listForTraveler` calls global `listMetadata()` and filters in application code. `listUnlockedForTraveler` calls global `list()`, which decrypts all eligible traveler documents before filtering to a single traveler, despite `travelerId` already being an IndexedDB index.

This is both a proportionality violation and an avoidable expansion of sensitive-data exposure in memory.

Required remediation:

- add `listMetadataByTraveler(travelerId)` and `listByTraveler(travelerId)` repository ports using the existing `travelerId` index;
- decrypt only the requested traveler's records;
- add a query contract proving unrelated traveler documents are not read or decrypted.

Strategic rule: query by intent; minimize sensitive data handled by each operation.

### A4. Ordering allocation is vulnerable to concurrent duplicate positions and sequences

Creation paths compute `max + 1` and persist later in separate operations:

- `DayApplication.createTripDay` computes `Day.sequence` from `listByTrip`;
- `PlannerApplication.createPlannerBlock` computes `Block.position` from `listByDay`;
- manual itinerary creation similarly allocates a position before a separate write.

The compound indexes `[tripId+sequence]` and `[dayId+position]` are not uniqueness constraints. Two tabs or overlapping writes can therefore allocate the same value.

Required remediation:

- move allocation plus insert into transaction-owned repository operations;
- re-read siblings inside the write transaction;
- define deterministic repair or normalization for pre-existing duplicate positions;
- add concurrent-write browser contracts.

Strategic rule: cross-record invariants belong with the transaction that enforces them.

## P2 — medium priority

### A5. OPFS write paths do not verify the final stored file size

Vault restore's file writer re-opens a written file and verifies its byte length. Normal media writes and private encrypted-document writes do not perform an equivalent final verification. They correctly abort and clean up on reported write errors, and integrity scanners can later detect discrepancies, but the normal write path can return success without an explicit post-write size check.

Required remediation: share or replicate the verified-write primitive in media and private-document OPFS stores, preserving encryption boundaries.

### A6. Bootstrap durability and recovery state is computed and discarded

`bootstrapApplication` returns storage persistence (`persistent`, `best-effort`, `unsupported`, `unknown`) and Vault recovery outcome. `main.tsx` awaits bootstrap but discards the returned state.

Users therefore receive no visible indication that their browser storage is best-effort, and an automatic interrupted-restore recovery is not surfaced. This is an observability gap for a local-data-first product.

Required remediation: expose a small bootstrap/readiness capability to presentation and show actionable, non-blocking status where appropriate.

### A7. Nominatim rate limiting is not serialized

The adapter maintains a module-level `lastRequestStartedAt`, but concurrent callers can observe the same timestamp, wait concurrently, then issue requests together. The current UI makes this unlikely in one component, but the adapter contract itself does not guarantee the one-request-per-second policy it intends to enforce; multiple tabs are also independent.

Required remediation: serialize calls in-process with a promise queue or mutex and document that cross-tab coordination is not guaranteed, or add a simple cross-tab lease if the provider remains shared across tabs.

### A8. Traveler documents can be created without application-level parent validation

The traveler-document application receives no traveler port and does not confirm that `travelerId` identifies an active traveler before creating a document. The UI route normally supplies a valid traveler, but the use case itself permits an orphan document.

Required remediation: add a narrow traveler-existence port and validate the parent before create; preferably enforce the check in the write transaction if the document repository owns the mutation.

### A9. Trip date validation is weaker than day date validation

Trip creation and update checks ordering of `startDate` and `endDate` strings but does not validate that supplied values are actual `YYYY-MM-DD` calendar dates. Day creation has a proper calendar validator.

Required remediation: centralize a date-only domain validator and reuse it across trip, day, and other date-only fields.

### A10. Presentation feature coupling is not guarded

`DayPlannerPage` composes editors and components by importing from expenses, itinerary, places and reservations feature directories. This is not a current domain/data dependency inversion, but it creates a presentation-level feature graph and the policy tests do not guard it.

The planner page is also a major complexity hotspot. Strategic-programming guidance explicitly identifies large UI pages that combine loading, orchestration, persistence actions and rendering as decomposition candidates.

Required remediation: define whether planner is intentionally the presentation composition root. If yes, make that explicit in architecture rules; otherwise move reusable editors and views behind a shared presentation boundary and add a guard against arbitrary feature-to-feature imports.

### A11. Browser CI is contract-heavy rather than journey-heavy

Playwright validates persistence and integration harnesses and application contracts effectively, but it does not yet cover the major user journeys through the real application UI.

Required remediation: add a small number of high-value real-UI journeys, especially:

- create trip → day → template/planner content → reload;
- create reservation plus attachment → update/remove → reload;
- Vault backup → staged restore → replace → reload;
- encrypted traveler document configure/unlock/add attachment → reload/lock;
- Travel Book chapter/media navigation.

## P3 — low priority or planned debt

### A12. Safe place deletion scans unindexed block and media references

Reservations and itineraries use indexed `placeId` lookups, while block `content.placeId` and `Media.placeId` require table scans because those fields are not indexed in schema v1. For a rare destructive catalog operation this is acceptable today and does not justify a schema migration by itself. Revisit when schema v2 already has a justified migration reason.

### A13. Generic repository active `count()` loads the table

`Repository.count()` calls `list()` when excluding tombstones. Avoid using it on large or scoped user-facing paths; add semantic counts only when a real caller needs them.

### A14. PWA manifest currently has no icons

This is install-quality debt rather than an architectural defect. Resolve before treating the PWA install experience as production-polished.

## Strong areas confirmed

- Dependency direction across domain, application, data and composition is enforced both by repository policy and a recursive architecture test.
- The v1 database and Vault format are explicitly gated against casual schema-version changes.
- Vault restore uses staged input, an OPFS backup, a durable restore journal, atomic database replacement, target fingerprints, interruption recovery, and post-restore verification.
- Sensitive traveler-document payloads and attachments are encrypted with explicit versioned envelopes and AAD and are re-locked after restore.
- Reservation block, derived itinerary and owned attachment metadata mutations use transaction-owned workflows.
- Expense and block ownership uses transaction-owned writes and deletes.
- Trip-traveler membership validates parent lifecycle inside the transaction and detects duplicate logical memberships.
- Place deletion checks active references inside the same transaction before tombstoning the canonical place.
- Media restore refuses to reactivate metadata when the backing OPFS file is missing, and media/private-document integrity scanners exist for reconciliation.
- Travel Book remains a read model: no duplicate Book, Chapter or Page persistence was introduced, and media bytes stay behind the application boundary.
- The 3D renderer has not yet contaminated application or domain contracts.

## Guardrail gaps to add

1. Atomic day-from-template transaction contract.
2. Full Vault v1 semantic-table validators plus negative fixtures.
3. Traveler-document scoped-query and decrypt contract.
4. Concurrent sequence and position allocation contracts.
5. Verified OPFS write contract shared by media and private documents.
6. Parent-existence contract for traveler documents.
7. Valid calendar date contract for trips.
8. Explicit presentation feature-dependency policy.
9. Real UI Playwright journeys for the highest-value workflows.

## 3D gate

Do **not** begin the Three.js reader milestone until A1–A4 are resolved and their regression tests are green on `main`. A5–A11 should then be addressed in focused slices; A12–A14 may remain documented debt unless their usage profile changes.

The reason is strategic rather than aesthetic: the renderer will add CPU/GPU lifecycle, responsive fallback, motion/accessibility and resource-management complexity. Persistence and recovery invariants should be stronger before adding that new complexity surface.
