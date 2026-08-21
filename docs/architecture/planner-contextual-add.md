# Contextual planner add flow

The day planner keeps the persisted block model unchanged but replaces the everyday ten-button add toolbar with a guided route wrapper.

## Interaction

- One fixed `+ Aggiungi alla giornata` control is shown above the bottom navigation.
- Primary choices describe travel intentions: `Spostamento`, `Attività`, `Mangiare`, `Dormire`.
- Secondary choices (`Luogo`, `Spesa`, notes/checklist/layout blocks) remain available under `Altre opzioni`.
- The legacy `DayPlannerPage` toolbar is hidden only inside the guided route; block editors and persistence remain unchanged.
- After `createPlannerBlock` succeeds, the planner remounts from persisted data and the newest block is scrolled into view.
- Archived trips do not expose the quick-add control.

## Data and safety

No schema or IndexedDB migration is required. The wrapper calls the existing canonical `createPlannerBlock` service, so trip/day ownership, archive checks, position assignment and block defaults remain centralized in the existing planner service.

The wrapper does not manufacture reservation or expense records itself. Dedicated editors continue to create those records through their existing atomic save paths after the user fills in the newly created block.
