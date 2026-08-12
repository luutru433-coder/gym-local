# Architecture

Gym Local is a modular monolith compiled into one static PWA. `apps/web` is the composition root. Domain packages own behavior and publish narrow entry points; adapters own browser storage, workers, and network access.

## Dependency direction

`apps/web -> feature packages -> contracts`

`storage`, `backup`, media policy, and external nutrition providers implement narrow boundaries. Features do not import another feature's internal files or database tables. The UI never opens IndexedDB, OPFS, SQLite, or a remote API directly.

## Storage split

- Personal profile, routines, workouts, meals, progress, settings, and nutrition-pack status live in Dexie/IndexedDB schema v2.
- The optional public food catalog is an immutable, query-only SQLite schema v1 stored in OPFS through the official SQLite WASM SAH-pool worker.
- Backups include personal records and nutrient snapshots, but exclude the reproducible nutrition pack.
- Restore replaces user tables transactionally and preserves the installed pack.
- A partial pack left by a closed browser is removed independently on the next startup so installation can be retried.

## Media split

- Exercise metadata and one direct guide per reviewed variant are versioned in the repository.
- Remote images and YouTube audiovisual content load only after user interaction and are not stored in offline caches.
- A blocked or unavailable video falls back to bilingual text, setup cues, and a direct source link.

## Independent versions

- App: `0.2.1`
- Database schema: `2`
- Catalog: `3`
- Routine templates: `2`
- Nutrition formula: `1`
- Backup: `2`
- Nutrition pack schema: `1`

Historical workout and meal records store snapshots so catalog, source, and formula updates do not rewrite the past. See `docs/adr/0002-nutrition-pack-and-backup-v2.md` for the storage/backup decision.
