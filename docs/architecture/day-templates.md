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

## Safety rules

A template stores only planner structure and generic content. It does not fabricate or copy trip-specific records.

- reservation/activity/restaurant/accommodation/transport blocks start with empty content;
- place blocks start empty;
- expenses are not pre-populated with amounts or payers;
- headings, text and checklist prompts may contain generic reusable copy.

A template-backed day records the selected ID in `Day.templateId`.

## Creation and rollback

The normal day service creates and validates the new day first. The template service then writes the template reference and creates the planner blocks in their declared order.

If block creation fails, blocks created by that operation are soft-deleted and purged, followed by the new day. This prevents a partially-applied template from appearing as an active day.

## Future custom templates

User-created templates can reuse the same service boundary. Before a day is saved as a reusable template, trip-specific identifiers such as reservation IDs, place IDs, expense values and other linked-record references must be stripped rather than copied into the template definition.
