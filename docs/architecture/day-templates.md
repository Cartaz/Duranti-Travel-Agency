# Day templates

Day templates reuse the existing `Template` entity and IndexedDB `templates` table. No database version change is required.

## Built-in templates

The first built-in presets are:

- Giornata di viaggio
- Visita città
- Museo o attività
- Escursione

The day-creation form also keeps a `Pagina vuota` option, which follows the previous creation flow and does not persist a template reference.

Built-in templates use stable IDs and `category: "day"`. They are seeded lazily when the day-template service is first opened.

## Personal templates

An editable day can be saved as a personal reusable template from the day page. Personal templates use IDs beginning with `custom-day-` and the same `category: "day"` contract as built-in presets, so they automatically appear in the new-day picker.

The save form asks for a name and optional description. A day must contain at least one supported planner block, and active day-template names are unique case-insensitively.

Personal templates can be managed from the new-day picker. The management panel supports inline rename and confirmed deletion. Built-in template IDs are rejected by the management service even if an invalid caller bypasses the UI, so presets remain immutable.

Deletion uses the repository tombstone instead of purging the template record. This removes the template from future choices while leaving historical `Day.templateId` references untouched on days that were already created from it. If a deleted template was selected in the current creation form, the picker automatically falls back to `Pagina vuota`.

## Safety rules

A template stores only reusable planner structure. It does not fabricate or copy trip-specific records.

When a personal template is created:

- `text` and `heading` blocks preserve only their reusable text;
- checklist item text is preserved, checked state is reset and template-safe item IDs are used;
- `place` blocks are retained only as empty place placeholders;
- transport, accommodation, restaurant and activity blocks are retained only as empty reservation placeholders;
- expense blocks are retained only as empty expense placeholders;
- reservation IDs, place IDs, expense IDs, amounts, payers, booking references and other block-specific record links are never copied;
- day journal text, photos and videos are outside the template definition.

The same whitelist is applied again when any template is instantiated. Checklist IDs are regenerated for every new day. This prevents stale or manually-corrupted template metadata from reintroducing linked-record identifiers during application.

A template-backed day records the selected ID in `Day.templateId`.

## Creation and rollback

The normal day service creates and validates the new day first. The template service then writes the template reference and creates the planner blocks in their declared order.

If block creation fails, blocks created by that operation are soft-deleted and purged, followed by the new day. This prevents a partially-applied template from appearing as an active day.

## Schema compatibility

Personal template metadata and management use fields already present on `Template` and `Day`. No IndexedDB index changes are required, so the existing database version remains compatible.
