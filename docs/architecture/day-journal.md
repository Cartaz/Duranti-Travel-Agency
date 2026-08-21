# Day journal

A travel day can carry two different kinds of prose:

- `summary` is the short overview used in lists and page headings;
- `journalText` is the optional long-form memory of what actually happened.

`journalText` is stored directly on the existing `Day` entity as an optional field. No IndexedDB schema migration is required because day records are persisted as objects and older records simply omit the property.

The day service trims empty journal text and enforces a 20,000-character limit. The day form keeps the diary under progressive disclosure so planning fields remain compact, while the day planner renders saved journal text before the itinerary using preserved line breaks.

The trip-day list exposes only a small “Diario scritto” status instead of an excerpt, avoiding another dense text preview in the travel overview.

The next media milestone should associate photos/videos with `tripId` and `dayId` using the existing `Media` entity and OPFS storage rather than embedding binary data in `Day`.