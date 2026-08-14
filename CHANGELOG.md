# Changelog

## 0.6.0

- Added nutrition pack schema 2 with ten bilingual food groups, 1,200 structured recipe-ingredient relationships, meal/dietary/allergen tags, and pinned USDA source food IDs for reproducible offline menus.
- Added local pantry records for exact foods or broad food groups, optional available amounts, additive IndexedDB schema v4 migration, recovery-point preservation, and backup v4 round trips.
- Corrected estimated-recipe micronutrients so a nutrient stays unknown when any contributing ingredient lacks that value, instead of publishing a misleading partial total.
- Kept already installed schema 1 packs compatible while adding manifest, foreign-key, relationship, and source-metadata validation for schema 2.
- Kept backup v1/v2/v3 imports compatible by migrating them to an empty pantry without modifying historical nutrition or workout snapshots.

## 0.5.0

- Added fast recent/favorite/default-serving food flows, editable meal entries, water tracking, custom recipe CRUD and serving-based recipe logging with immutable nutrient snapshots.
- Added explicit nutrition-target provenance and confirmation, exact saved-barcode fallback, micronutrient completeness warnings, and a store-owned boundary for all nutrition pack and provider operations.
- Added measured bundle/PWA budgets, route/vendor splitting, lazy barcode scanning, complete offline-route checks, deterministic media auditing, scheduled online video health checks, and full SQLite pack verification before deployment.

## 0.4.0

- Added multi-day programs, full routine editing, freestyle and editable live workouts, and explicit save recovery while preserving completed history.
- Added explainable exact-variant double progression, plate-loading guidance, progress calendar, exact-variant trends and PRs, and accessible data alternatives.

## 0.3.0

- Added personal-data schema v3 for programs, recipes, water entries, food preferences, and local recovery points without rewriting existing records.
- Added backup v3 metadata and validation, v1/v2 migration, consistent transactional export, pre-restore recovery, active-workout restore protection, and one-click undo; a failed workout write no longer blocks later export or restore operations.
- Hardened offline nutrition-pack compatibility, failure recovery, worker request handling, and network-provider boundaries so an installed usable pack survives failed updates.
- Improved small-screen workout usability, keyboard navigation, localized accessibility labels, selection state, chart summaries, and mobile dialog behavior.
- Added an executable module-boundary audit plus a release roadmap and Codex change/checkpoint templates for safer incremental updates.

## 0.2.1

- Corrected workout tracking semantics for per-hand, bodyweight-added, assisted, timed, distance, and reps-only variants; sessions now snapshot reviewed tracking behavior.
- Corrected assisted pull-up requirements, timed plank targets, exact-variant previous values, completed-set history, RIR/RPE bounds, and misleading aggregate progress metrics.
- Added transactional onboarding persistence and visible workout autosave status with rollback on a failed browser-storage write.
- Added locale-aware nutrition validation, stopped treating missing provider macros as zero, and require completion of missing core nutrients before diary logging.
- Validate backup data before creating a ZIP and reject invalid active-session relationships.
- Added keyboard-safe dialogs, exposed selection/progress accessibility state, synchronized the document language, and re-prompted deferred PWA updates after a workout ends.

## 0.2.0

- Added one direct, click-to-load instructional video for all 199 reviewed equipment variants; removed search-result guidance links.
- Added privacy-enhanced YouTube playback, creator attribution, offline/text fallback, and direct-video content gates.
- Added the optional SQLite/OPFS nutrition pack with 13.835 foods, 24.907 Vietnamese aliases, 300 Vietnamese recipe estimates, FTS5 search, progress, checksum verification, and safe retry after interrupted installs.
- Expanded meal nutrient snapshots to macros plus available vitamins and minerals without silently treating missing values as zero.
- Added explicit persistent-storage permission, nutrition-pack removal, provider/source metadata, and offline food search UI.
- Migrated IndexedDB, contracts, catalog, and backup to v2 with v1 import/migration and round-trip coverage; backups deliberately exclude the reproducible pack.
- Updated the GitHub Pages workflow to verify the release pack before deployment.

## 0.1.0

- Initial local-first PWA foundation.
- Modular catalog, workout, nutrition, progress, media, storage, backup, and UI boundaries.
- Added public-domain reference images for key equipment variants with explicit source/license metadata.
- Added custom routines, live set logging, barcode food lookup, progress charts, and checksummed backup/restore.
- Added installable PWA icons, branded social preview, safe deferred updates, and a GitHub Pages workflow.
- Locked the release to metric input and preserved routine targets in live sessions.
