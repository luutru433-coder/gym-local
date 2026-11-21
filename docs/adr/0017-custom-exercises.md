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
- Editing keeps both IDs and increments `contentVersion`. Sessions keep their own name and tracking-profile snapshots, so editing or deleting never rewrites history. Once an exercise has logged sets its equipment and load-entry mode can no longer be edited, because the variant ID (and so its history and prefilled loads) stays the same; deleting such an exercise marks it `deprecated`, which hides it from every picker but keeps it resolvable for muscle totals and trends. Editing the muscles of an exercise re-labels its past sets in muscle totals, like a catalog correction would. Deleting is blocked while a routine or the active workout references the exercise.

## Consequences

- Catalog updates cannot overwrite custom exercises: they live in personal tables and are never seeded.
- A deleted custom exercise with logged sets stays in the database and in backups as `deprecated`; one that was never logged is removed.
- Per-hand and per-side custom exercises get `ambiguous` laterality, so repetition volume is not calculated for them, matching unreviewed catalog behaviour.
- Creating, editing, and deleting load with the exercise library through `@gym/catalog/custom` and `@gym/storage/custom-exercises`, so only the migration and lookups are added to the entry chunk and the 220 KiB budget is unchanged.
- A v6 backup cannot be restored by an app older than this release.
