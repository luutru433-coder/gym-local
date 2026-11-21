# ADR 0017: User-created custom exercises

## Status

Accepted.

## Context

Only the bundled catalog variants could be logged. A `customVariants` table and backup collection have existed since database v1, but nothing wrote to them, and a variant alone cannot be shown or searched: muscles, pattern, and description live on its `Movement`, which was catalog-only.

## Decision

- A custom exercise is one user-owned `Movement` plus one `ExerciseVariant`, using the existing contracts unchanged. IDs are generated with the reserved prefixes `custom_movement_` and `custom_variant_`, so they can never collide with stable catalog IDs; storage rejects other IDs.
- Database v6 adds a `customMovements` store (additive; no existing record is rewritten). The upgrade bumps the stored schema/backup versions and gives recovery snapshots an empty `customMovements` list inside one transaction.
- Backup v6 adds the `customMovements` collection and its manifest count. Backups v1–v5 migrate with an empty list. A backup whose `custom_variant_` record points at a movement that is not in the backup is rejected.
- The catalog module resolves custom exercises through the same lookups as bundled ones (`getMovement`, `getVariant`, `getVariantsForMovement`, `getTrackingProfile`, `searchCatalog`) after the app registers them with `setCustomExercises`; bundled IDs always win. The tracking profile is derived from the chosen load-entry mode, so volume, e1RM, and progress direction follow the same rules as the catalog.
- The name is typed once and stored for both locales. Custom exercises are `reviewStatus: "draft"`, have no instructions beyond an optional note, no video, and no animation (muscle diagram only, per ADR 0016).
- Editing keeps both IDs and increments `contentVersion`. Sessions keep their own name and tracking-profile snapshots, so editing or deleting never rewrites history. Deleting is blocked while a routine or the active workout references the exercise.

## Consequences

- Catalog updates cannot overwrite custom exercises: they live in personal tables and are never seeded.
- History of a deleted custom exercise stays in sessions under its snapshot name, but the exercise can no longer be picked.
- Per-hand and per-side custom exercises get `ambiguous` laterality, so repetition volume is not calculated for them, matching unreviewed catalog behaviour.
- The migration, backup schema, and catalog lookups must load with the app shell, which adds about 5 KiB to the entry chunk; the entry budget in `scripts/performance-report.mjs` moves from 220 to 226 KiB.
- A v6 backup cannot be restored by an app older than this release.
