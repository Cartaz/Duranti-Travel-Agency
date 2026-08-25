## Summary

Describe the user-visible or architectural outcome of this change.

## Strategic Programming review

- [ ] I identified the future complexity this change creates or removes.
- [ ] I checked whether this changes IndexedDB, OPFS, encryption, Vault or another persisted contract.
- [ ] Existing installations and backups remain compatible, or the migration path is explicit and tested.
- [ ] Failure and interruption paths cannot silently lose user data.
- [ ] The dependency direction is at least as clean as before; new cross-feature coupling has not been introduced casually.
- [ ] Data access uses the narrowest useful repository query and existing indexes where appropriate.
- [ ] State synchronization is explicit; no forced remount, DOM query, timer or observer was introduced as a shortcut without documented justification.
- [ ] Type changes reduce invalid states or repeated runtime parsing rather than adding ceremony.
- [ ] Tests cover affected critical invariants when the relevant test harness exists.
- [ ] Documentation or an ADR was updated if this modifies an architectural contract.
- [ ] `npm run build` passes, including repository policy checks.

## Data compatibility

State explicitly: **none**, or describe schema/storage/Vault compatibility and migration implications.

## Known follow-ups

List intentional deferred work. Do not hide temporary workarounds here; document them at the implementation site as well.
