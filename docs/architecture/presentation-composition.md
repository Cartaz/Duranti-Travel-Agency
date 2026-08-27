# Presentation feature composition

DTAgency treats feature directories as workflow-owned presentation modules, not as a general-purpose component library. A feature must not import arbitrary components from another feature merely because the component is convenient to reuse.

## Planner exception

The day planner is an intentional presentation composition root. Its job is to render one day as a coherent workspace while application behavior remains behind `useApplicationServices()` and application ports.

Two planner pages may therefore compose the following existing presentation modules:

- `DayPlannerPage.tsx`: expense editor, itinerary day summary, place Maps URL helper and reservation editor;
- `GuidedDayPlannerPage.tsx`: day media gallery and day-template saver.

This exception is narrow and presentation-only. It does not permit planner code to import another feature's persistence adapter, composition module or service bridge, and it does not make cross-feature imports generally acceptable.

## Guardrail

`scripts/check-repo-policy.mjs` rejects feature-to-feature imports unless the exact importing file and module path are present in the presentation composition allowlist. New coupling therefore requires an explicit architecture decision rather than growing accidentally.

If a component becomes genuinely reusable across multiple independent feature roots, move it behind `src/ui/` (or another deliberately shared presentation boundary) instead of expanding the allowlist mechanically.
