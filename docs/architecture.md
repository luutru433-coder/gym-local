# Architecture

Gym Local is a modular monolith compiled into one static PWA. `apps/web` is the composition root. Domain packages own behavior and publish narrow entry points; adapters own browser storage, workers, and network access.

## Dependency direction

`apps/web -> feature packages -> contracts`

`storage`, `backup`, media policy, and external nutrition providers implement narrow boundaries. Features do not import another feature's internal files or database tables. The UI never opens IndexedDB, OPFS, SQLite, or a remote API directly.

## Storage split

- Personal profile, programs, routines, workouts, meals, recipes, water, preferences, pantry, saved meal plans, progress, settings, recovery points, and nutrition-pack status live in Dexie/IndexedDB schema v5.
- The optional public food catalog is an immutable, query-only SQLite schema v1–v3 stored in OPFS through the official SQLite WASM SAH-pool worker. Seven-day planning requires schema 3; older packs remain readable for search and logging.
- The pack worker and download provider live in `packages/storage`; `packages/nutrition` accesses them only through the public `@gym/storage` entry point.
- Backups include personal records and nutrient snapshots, but exclude the reproducible nutrition pack.
- Restore snapshots the current personal tables, replaces them transactionally, supports one-click undo, and preserves the installed pack.
- A partial pack left by a closed browser is removed independently on the next startup so installation can be retried.

## Media split

- Exercise metadata and one direct guide per reviewed variant are versioned in the repository.
- Remote images and YouTube audiovisual content load only after user interaction and are not stored in offline caches.
- A blocked or unavailable video falls back to bilingual text, setup cues, and a direct source link.

## Independent versions

- App: `0.7.0`
- Database schema: `5`
- Catalog: `3`
- Routine templates: `2`
- Nutrition formula: `1`
- Backup: `5`
- Nutrition pack schema: `3`

Historical workout, meal, and saved-plan records store snapshots so catalog, source, formula, pack, and algorithm updates do not rewrite the past. See ADRs 0011–0015 for the schema-3 Việt–Á catalog and seven-day planning decisions.
