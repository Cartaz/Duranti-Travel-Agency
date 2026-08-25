# DTAgency repository rules

These rules apply to every code, documentation and architecture change in this repository.

## Product identity

- The application is called **DTAgency** in UI, documentation, comments, errors, generated filenames and new code.
- Production Vault files use the **`.dtagency`** extension.
- The current persistence baseline is DTAgency v1. Do not introduce predecessor storage names, OPFS namespaces, cryptographic markers, MIME identities or authenticated format identifiers.
- From the first release containing meaningful user data onward, persisted identifiers become compatibility contracts and may change only through an explicit, tested migration.

## Engineering philosophy

DTAgency follows **Strategic Programming**. Read `docs/architecture/strategic-programming.md` before making non-trivial changes.

Every change must optimize for long-term simplicity and data safety, not only immediate feature completion.

### Required behavior

- Preserve user data and backup recoverability above implementation convenience.
- Keep dependency direction explicit and move orchestration toward application use cases and domain contracts.
- Prefer small stable interfaces that hide complexity.
- Use repository queries that express intent and exploit indexes rather than loading full tables and filtering them in feature code.
- Prefer explicit state/data flow over forced remounts, DOM synchronization, timers or observers.
- Strengthen types when doing so removes invalid states or repeated runtime parsing.
- Add tests around critical invariants before or with risky refactors.
- Treat schema versions, storage identifiers, cryptographic framing and backup formats as compatibility contracts once released with meaningful user data.
- Make failures visible, actionable and recoverable.
- Refactor incrementally; avoid rewrites unless incremental migration is demonstrably less safe.

### Prohibited shortcuts

Do not introduce:

- silent persistence failures;
- unversioned schema changes;
- destructive storage renames after user data exists without a tested migration;
- new domain dependencies on React, browser storage or UI code;
- feature-to-feature coupling when an application-level use case is the correct owner;
- full-table scans when a suitable indexed query can be exposed;
- speculative frameworks or abstraction layers without a demonstrated complexity they remove.

## Definition of done

For a meaningful change, verify:

1. build/typecheck passes;
2. repository policy checks pass;
3. affected invariants are covered by tests;
4. persisted-data and Vault compatibility have been considered explicitly;
5. documentation/ADR is updated when the change creates or modifies an architectural contract;
6. no temporary workaround is left unexplained.

If a task conflicts with these rules, stop and redesign the implementation rather than weakening the rule locally.
