# Travel Book read model

The first Travel Book milestone is a read-only presentation of data DTAgency already owns. It intentionally does **not** introduce persisted `Book`, `Chapter` or `Page` entities.

## Decision

A dedicated `TravelBookApplication` composes the existing trip and day read capabilities behind two narrow ports:

- `getTrip(tripId)`;
- `listTripDays(tripId)`.

It returns a presentation-neutral `TravelBook` read model whose ordered chapters are derived from `Day` records. The React reader consumes this model but does not orchestrate repositories, day services or persistence itself.

## Why this is strategic

The current data model already contains the narrative facts needed for the first reader: trip title/range plus each day's date, title, summary and `journalText`. Persisting another hierarchy now would duplicate ownership and immediately create synchronization and migration problems without enabling a user capability that cannot otherwise be delivered.

The read model creates one stable seam for future renderers. A later 3D book experience should consume or extend this application-level projection instead of reaching into planner feature code.

## Compatibility and data safety

This milestone changes no IndexedDB schema, OPFS namespace, cryptographic framing, Vault format or persisted identifier. The `day:<dayId>` chapter key is an in-memory presentation key only and is not a storage contract.

The book remains readable for archived trips because archival is a lifecycle state, not deletion. Missing trips fail visibly; no write or cleanup operation is performed by the reader.

## Deliberate exclusions

Media rendering is deferred from this first slice. Reading OPFS-backed photo/video files introduces object URL lifecycle, loading/error states and richer page composition. Those concerns should be added only after the narrative read-model boundary has proven useful, and they should extend the same application boundary rather than couple the book UI to the media feature.

No 3D framework is introduced yet. The 2D reader establishes navigation semantics and chapter content first, avoiding a renderer-specific domain model.
