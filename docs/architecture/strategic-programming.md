# Strategic Programming in DTAgency

Strategic Programming is the default engineering philosophy for DTAgency. It is not a separate cleanup phase and it is not optional polish after feature work. Every implementation decision must consider both the immediate feature and the cost it creates for future changes.

## Core principle

Prefer a slightly more deliberate solution today when it creates a simpler, safer and more reusable system tomorrow. Avoid local shortcuts that move complexity into later work.

A strategic change should improve at least one of these properties without materially degrading the others:

- clarity of system boundaries;
- preservation and recoverability of user data;
- testability;
- compatibility across app and schema versions;
- locality of change;
- type safety and invalid-state prevention;
- observability of failures;
- ability to replace infrastructure behind stable contracts;
- performance proportional to the data actually requested.

## Mandatory decision rules

### 1. Protect user data before convenience

Local data is the product. Changes to IndexedDB, OPFS, encryption, Vault, migrations, deletion or restore behavior must be designed for interruption, partial failure and version skew.

No schema version increase may be treated as complete until the migration path and backup compatibility consequences have been reviewed and tested.

### 2. Keep compatibility explicit

Persisted identifiers, storage namespaces, cryptographic framing and version markers are compatibility contracts. They must never be renamed or repurposed only for cosmetic consistency.

A rename that affects persisted data requires an explicit migration and rollback/recovery plan.

The user-facing product name is **DTAgency**. The production Vault file extension is **`.dtagency`**.

### 3. Make architectural boundaries real

The intended dependency direction is:

```text
UI / features
    ↓
application use cases
    ↓
domain contracts and invariants
    ↑
data / browser adapters
```

Feature code should not gain new direct dependencies on browser storage primitives. New cross-feature orchestration should move toward application-level use cases instead of building a feature-to-feature dependency graph.

### 4. Prefer deep modules

A module may be internally sophisticated when it hides that complexity behind a small, stable interface. Avoid shallow helpers that merely redistribute complexity across many callers.

The Vault recovery subsystem is an example of justified internal complexity. UI pages that combine loading, orchestration, validation, persistence and rendering are candidates for decomposition because they expose rather than hide complexity.

### 5. Eliminate workarounds at the source

Do not solve state synchronization through forced remounts, DOM queries, timing delays or observers when the source operation can return enough information to update application state explicitly.

When a workaround is temporarily unavoidable, record why it exists, what invariant it protects and the condition for removing it.

### 6. Query by intent, not by table dump

Repository APIs should express domain queries such as `listByTrip` or `listByDay` and use existing indexes. Avoid loading an entire table and filtering in application code when the persistence layer can perform the query directly.

### 7. Prefer types that make invalid states harder to express

Use discriminated unions, narrow domain types and validation boundaries where they remove repeated runtime checks or ambiguous data shapes. Do not introduce ceremonial wrapper types that add no real constraint.

### 8. Tests are part of the architecture

Tests are required first around the areas where regressions have the highest cost:

1. Vault compatibility and restore;
2. IndexedDB migrations and transactional workflows;
3. OPFS lifecycle and reconciliation;
4. security/encryption boundaries;
5. domain invariants;
6. critical end-to-end journeys.

A refactor that changes a critical invariant should add or strengthen the test that proves the invariant.

### 9. Fail visibly and recoverably

Failed writes must never disappear silently. Errors should preserve the original failure when cleanup also fails, and partial cross-store operations need explicit recovery semantics.

### 10. Avoid speculative architecture

Strategic does not mean maximal abstraction. Do not add frameworks, indirection, workers, state managers or distributed patterns without a concrete complexity they eliminate.

## Change checklist

Before merging any meaningful change, answer:

1. What future complexity does this change create or remove?
2. Does it alter a persisted contract or data format?
3. Can interruption or partial failure lose or orphan user data?
4. Is the dependency direction becoming cleaner or more coupled?
5. Can the behavior be tested without requiring the entire application?
6. Does the implementation use the narrowest useful data query?
7. Is a workaround being introduced where a direct state/data flow would be clearer?
8. Are errors actionable and data-safe?
9. Does the change preserve compatibility with existing installations and backups?
10. Is the added abstraction solving a demonstrated problem rather than a hypothetical one?

## Stop-the-line conditions

A change must not be merged until resolved when it:

- can make an existing backup unrestorable without an explicit migration policy;
- changes storage schema without a tested upgrade path;
- risks deleting or overwriting user data on an unhandled partial failure;
- silently catches a failed persistence operation;
- creates a new dependency from domain code to UI/browser infrastructure;
- introduces a known fragile workaround into a critical persistence or recovery path;
- bypasses encryption boundaries for sensitive traveler documents.

## Refactoring policy

Prefer incremental refactoring adjacent to active work over rewrites. Preserve working behavior, add tests around the boundary, introduce the improved abstraction, migrate callers, then remove the old path.

The target is not architectural purity. The target is a codebase in which adding the next feature is usually easier than adding the previous one.
