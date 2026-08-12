# Changelog

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
