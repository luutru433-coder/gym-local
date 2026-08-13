# Product hardening roadmap

This roadmap turns the competitive review into small, verifiable releases. Keep the product local-first, single-profile, bilingual, and free to run. Each release must leave a green checkpoint that can be reviewed or reverted independently.

## Non-negotiable acceptance rules

- History, previous values, volume, and PRs are calculated only for the exact equipment variant.
- Every reviewed exercise variant has one direct, reviewed instructional video plus an offline text fallback.
- User routines, programs, sessions, custom exercises, recipes, meals, water logs, and body metrics survive catalog and app updates.
- Core workout, nutrition logging, progress, backup, and restore work without an account. Network failures never erase an installed nutrition pack.
- UI pages use feature controllers/view models and reusable primitives; they never call IndexedDB, OPFS, SQLite, or remote APIs directly.
- Vietnamese and English labels, keyboard operation, screen-reader names, 320 px layout, reduced motion, empty/loading/error states, and failed-save recovery are release gates.

## Release 1 — Correctness foundation

Status: completed in checkpoint `0c173d8`.

- Reviewed tracking semantics for every load mode and effort type.
- Exact-variant previous values and progress calculations.
- Transactional onboarding and reliable live-workout saves.
- Strict nutrition input/provider validation and honest missing nutrients.
- Backup validation before ZIP creation.
- Dialog, language, selection-state, and deferred-PWA-update accessibility fixes.

## Release 2 — Safe local platform

Status: completed for checkpoint 2.

- IndexedDB schema v3 for programs, recipes, water, food preferences, and recovery points.
- Backup v3 with v1/v2/v3 import, collection counts, consistent export snapshot, pre-restore recovery, and one-click undo.
- Atomic nutrition-pack install/update: stage, verify checksum/schema, activate, retain the previous usable pack after failure.
- Enforce module boundaries so only storage owns IndexedDB/OPFS/SQLite and only providers perform network requests.
- Mobile and accessibility hardening: no page overflow at 320/390 px, visible workout timer, 44 px targets, focus-safe full-screen mobile dialogs, localized labels, and chart summaries.
- Keep service-worker updates deferred during an active workout.

Release gate: full verification, migration/round-trip/failure tests, production build, updated ADR/changelog/report, and a local checkpoint.

## Release 3 — Workout feature parity

Status: completed for checkpoint 3.

- Program model and multi-day routine editor with reorder, duplicate, superset, rest, RIR, and variant selection.
- Freestyle workout and safe add/remove/reorder/swap exercise during a live session.
- Rest timer controls, set types, notes, warm-up sets, previous exact-variant values, plate guidance, and explicit save/error feedback.
- Rule-based offline double progression using only completed working sets for the exact variant; suggestions are explainable and never auto-write history.
- Progress calendar, muscle volume, exact-variant trends and PRs, body metrics, personal records, CSV export, and accessible table alternatives.

Release gate: workout/progress unit tests, persistence reload tests, mobile live-session smoke test, full verification, and a local checkpoint.

## Release 4 — Nutrition and content parity

Status: completed for checkpoint 4; deployment verification follows from the exact checkpoint commit.

- Full downloadable offline food pack with Vietnamese aliases, branded foods where licensing permits, visible source/version/checksum/size, atomic update, and old-pack fallback.
- Fast recent/favorite/serving flows, daily meal editor, barcode fallback, custom foods, recipes, water logging, micronutrient detail, and nutrient-completeness warnings.
- Targets show formula inputs and calculation date and require confirmation when profile inputs change.
- Automated direct-video health checks, attribution/review metadata, offline text fallback, and zero missing reviewed variants.
- Route/vendor splitting, virtualization for large result lists, worker-based expensive operations, and measured performance budgets.

Release gate: offline install/search/update failure E2E, nutrition persistence/backup round trips, content/license audits, video health report, production performance report, full verification, checkpoint, and deployment from the verified commit.

## Deferred by product decision

- Accounts, cloud sync, social feed, coaching marketplace, wearables, and multiple user profiles.
- Physical-machine identity or gym-location-specific PR separation. Equipment-variant separation remains mandatory.
- Bundled or scraped third-party video. Rich media stays online-only with explicit source and license/review metadata.
