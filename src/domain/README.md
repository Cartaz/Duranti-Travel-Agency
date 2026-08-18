# Domain layer

Pure application concepts only. No React, IndexedDB, OPFS, browser globals or network calls.

Planned modules:

- `trip.ts` — trip lifecycle and invariants.
- `traveler.ts` — reusable traveler profiles.
- `day.ts` — day plans and ordered blocks.
- `block.ts` — block discriminated unions and template contracts.
- `place.ts` — saved places and map-provider references.
- `media.ts` — media metadata and asset references.
- `template.ts` — reusable planning templates.
- `link.ts` — external references.
- `document.ts` — sensitive document metadata.
- `errors.ts` — domain-level errors.
