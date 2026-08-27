# Strategic programming audit — remediation closure

Date: 2026-08-27

Status: **A1–A14 addressed; strategic remediation gate green.**

This note closes the findings recorded in `strategic-audit-2026-08-27.md`. The original audit remains unchanged as the historical record of the risks that were found; this document records the resulting remediation state.

## Gate result

Final integrated commit: `6fa16bec4850a67b493d42dbcf2b980fc5f105c8`

GitHub Actions run: `33120408428`

The integrated gate passed:

- repository architecture/policy checks;
- dependency security audit at the configured threshold;
- 83 Node regression tests;
- TypeScript build;
- Vite/PWA production build;
- Chromium installation and browser harness startup;
- 4/4 Playwright browser tests, including real application journeys and ordering concurrency contracts.

## Closed P0 / P1 findings

### A1 — atomic day creation from template

Day plus template blocks are created through a transaction-owned mutation. The previous application-level compensating purge path is no longer the integrity mechanism. A failure regression proves that a partial day is not left behind.

### A2 — Vault semantic and referential validation

Vault v1 staging now validates persisted table shapes and relevant reference graphs before replacement can be committed. Negative fixtures cover invalid dates/statuses, missing ownership parents and malformed encrypted traveler-document records while preserving the explicit historical/tombstoned-reference policy.

### A3 — scoped traveler-document reads and decrypts

Traveler-document metadata and unlocked records are queried by traveler through the existing `travelerId` index. Unrelated traveler documents are not read/decrypted for a scoped request.

### A4 — concurrent ordering allocation and duplicate repair

Day sequence, planner block position and manual itinerary position allocation are transaction-owned. Concurrent browser contracts exercise overlapping appends. Pre-existing duplicate ordering values are repaired deterministically before allocation; block repair also preserves the linked derived-itinerary ordering invariant.

## Closed P2 findings

### A5 — verified OPFS writes

Normal media and encrypted private-document writes now use a shared verified-write boundary: write, close, reopen and verify final byte size, with caller cleanup on failure.

### A6 — bootstrap durability and recovery visibility

Bootstrap persistence/recovery state is projected into presentation notices instead of being discarded. Best-effort/unknown durability is actionable through the Vault route, and actual interrupted-restore recovery is surfaced non-blockingly.

### A7 — serialized Nominatim requests

The public Nominatim adapter uses an in-process promise queue, rechecks cache inside the queue and documents the deliberate cross-tab limitation.

### A8 — traveler-document parent validation

Traveler-document creation validates an active traveler through a narrow application port before encryption/persistence. Regression coverage proves that no document write occurs for a missing/tombstoned parent.

### A9 — shared date-only validation

Trip and day date-only values use the same real-calendar `YYYY-MM-DD` validation boundary rather than relying on string ordering alone.

### A10 — explicit presentation composition policy

Feature-to-feature presentation imports are forbidden by repository policy unless the exact importer/module pair is in the explicit composition allowlist. Planner/day-template composition exceptions are documented rather than implicit.

### A11 — real UI browser journeys

Playwright now exercises the real application UI for high-value workflows, including planner persistence across reload and trip archive/restore. The planner journey synchronizes on the actual IndexedDB commit before reload, avoiding a false-green based only on React local state.

## Closed / deliberately bounded P3 findings

### A12 — unindexed place-reference scans

Schema v1 is intentionally retained; adding indexes solely for a rare destructive place-delete check would force an unjustified Vault/schema migration. The two unavoidable unindexed scans (`Block.content.placeId` and `Media.placeId`) now use cursor-backed Dexie filters/counts and no longer materialize entire tables with `toArray()`. Indexed reservation and itinerary references continue to use their indexes.

This remains O(n) in schema v1 by design, but its memory behavior is bounded. If schema v2 is justified for broader product reasons, these two references are candidates for indexing then.

### A13 — generic active count

The unused generic repository `count()` method was removed. New counting requirements must be expressed as semantic, scoped repository queries rather than falling back to `list().length`.

### A14 — PWA icons

The manifest now declares a local scalable DTAgency install icon with `any maskable` purpose. The asset is versioned under `public/` and included in the production PWA build/precache.

## Strategic conclusion

The persistence, recovery, ordering, sensitive-data and architectural guardrails identified by the audit are now stronger than at audit time, and the full integrated CI gate is green.

The audit-based freeze on starting the Three.js/3D reader milestone can therefore be removed. Any 3D work should continue to preserve the existing rule that rendering remains a presentation concern and must not introduce new application/domain persistence contracts merely to support visual effects.
