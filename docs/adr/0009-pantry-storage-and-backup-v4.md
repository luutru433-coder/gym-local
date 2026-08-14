# ADR 0009: Pantry storage and backup v4

## Status

Accepted — 2026-08-14

## Context

Offline menu suggestions need personal availability input. A pantry entry may mean an exact catalog food (for strict recipe matching) or a broad group such as meat or vegetables (for flexible matching). This data is personal, must work offline, and must survive restore and undo operations without becoming part of the replaceable nutrition catalog.

## Decision

- IndexedDB schema 4 adds a standalone `pantryItems` store owned only by `packages/storage`.
- An item is either an exact food with a localized name snapshot and optional group, or a reviewed stable food-group ID with a localized group-name snapshot. Amount in grams is optional because users may only know that an ingredient is available.
- Pantry records are included in personal snapshots, restore recovery points, and backup v4. The nutrition SQLite pack remains excluded because it is reproducible.
- Database migration v3→v4 creates an empty pantry and upgrades existing recovery snapshots additively. It does not alter foods, recipes, meals, workouts, or nutrition-pack files.
- Backup v1, v2, and v3 imports remain accepted and receive an empty pantry. Backup v4 validates pantry types, stable group IDs, finite amounts, byte count, checksum, and exact collection counts.

## Consequences

- Catalog updates cannot overwrite pantry choices or their display snapshots.
- Exact-food and broad-group matching remain distinguishable and explainable to the user.
- Changing the pantry contract or stable group IDs requires a new ADR and migration/round-trip coverage.
