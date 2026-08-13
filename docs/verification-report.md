# Verification report — 2026-08-13

## Local checkpoint 0.4.0

- The exact `pnpm run verify` pipeline passed: architecture boundaries, ESLint with zero warnings, TypeScript project references, content validation/audit, 90 Vitest tests across 10 files, and the production build.
- Multi-day program CRUD, active-program selection, routine editing, and transactional day advancement are covered by storage, backup, and App tests. Standalone and freestyle sessions cannot advance a selected program accidentally.
- Live workouts support safe exact-variant add, swap, reorder, and removal; completed work remains immutable. Save failures retain the attempted edit and expose retry without poisoning later writes.
- Exact-variant double progression is advisory and explainable. Warm-ups, incomplete sets, and other equipment variants are excluded; assistance, duration, distance, reps-only, and external-load directions retain their snapshotted semantics.
- The 28-day calendar, exact-variant trend/PR views, variant volume, and visible tabular alternatives are bilingual and responsive. Progress and live-workout scoped accessibility tests pass.
- The PWA precache contains 41 core entries (4,573.27 KiB). Remote exercise videos and the optional nutrition SQLite pack remain outside the core cache.
- The known non-blocking chunk warning remains: initial app 570.41 kB, nutrition route 503.00 kB, and progress route 387.95 kB before gzip. Route/vendor splitting remains scheduled for Release 4.

## Local checkpoint 0.3.0

- Frozen-lockfile installation completed with pnpm 11.16.0. The exact `pnpm run verify` pipeline passed: architecture audit, ESLint with zero warnings, TypeScript project references, content validation/audit, 70 Vitest tests across 9 files, and the production build.
- Content-contract validation passed 7 tests. The audits confirmed 199 reviewed equipment variants, 199 direct variant-specific videos, valid source/license/review metadata, exactly 300 Vietnamese recipe estimates, and no unresolved placeholders.
- The SQLite integrity/FTS verifier passed for 13,835 foods, 24,907 Vietnamese aliases, and 300 recipes with SHA-256 `4f844b93c1c8d0540c34038cbc5b69096c92a3982fe884b2ac877c5df7bdc88f`.
- IndexedDB v3 migration and rollback, backup v1/v2/v3 migration and round trip, exact byte/count validation, consistent export, active-workout restore refusal, pre-restore recovery, undo, and nutrition-pack preservation are covered by automated failure-path tests.
- SQLite/OPFS and nutrition-pack network operations are owned by `packages/storage`; the executable architecture audit found no direct database/API access in the UI or nutrition module.
- A regression test proves that an optimistic workout save rolls back on failure and that the failed write cannot poison later export/restore operations.
- Browser acceptance at 320 px and 390 px passed without horizontal page overflow. The workout timer remains visible, three set inputs fit on one row, touch targets meet 44 px, and the mobile dialog fills but does not exceed the viewport.
- Vite built 2,725 modules. The PWA precache contains 37 core entries (4,505.27 KiB); the 16.4 MB nutrition SQLite file and remote video URLs are absent.
- The known non-blocking chunk warning remains: initial app 559.32 kB, nutrition route 503.00 kB, and progress route 380.08 kB before gzip. Route/vendor splitting remains scheduled for Release 4.

## Local checkpoint 0.2.1

- ESLint completed with zero warnings.
- TypeScript project references completed without errors.
- Vitest passed 49 tests across 9 files; content-contract tests passed 7 tests in 1 file.
- Content validation and audit passed all video, source, license, nutrition-pack, and generated-recipe gates.
- Production Vite/PWA build completed with 2,722 transformed modules and 37 precache entries.
- Build still reports the known chunk-size warning: initial app 551.48 kB, nutrition route 502.99 kB, and progress route 378.12 kB before gzip. Performance splitting remains scheduled for the hardening release.
- New regression coverage proves locale-aware nutrition input, incomplete-provider handling, pre-export backup validation, transactional onboarding, failed-workout-save rollback, reviewed load semantics, exact-variant previous values, modal keyboard focus, document language, and deferred-update re-prompting.

## Automated checks

- Frozen-lockfile dependency install passed with pnpm 11.16.0 and supply-chain policy verification.
- ESLint completed with zero warnings.
- TypeScript project references completed without errors.
- Content validation passed for HTTPS/source/license/review metadata and catalog contracts.
- Exercise audit passed for 199 reviewed variants, 199 direct video guides, unique variant coverage, creator attribution, and zero search-result media URLs.
- Nutrition content audit passed for the Vietnamese dictionary, exactly 300 recipe estimates, ingredient provenance, pack schema, checksum metadata, and source licenses.
- Vitest passed 24 tests across 9 files, including catalog, workouts, nutrition mapping, media safety, IndexedDB v1→v2 migration, pack preservation, backup v1 import, backup v2 nutrient round-trip, progress, and onboarding persistence.
- Production Vite/PWA build passed. The service-worker precache contains 37 core entries (4,462.15 KiB); remote video and the 16.4 MB SQLite data file are not precached.

## Nutrition pack

- SQLite integrity/FTS verifier passed.
- File: `gym-local-nutrition-2026.04.sqlite3`
- Size: 16,445,440 bytes
- SHA-256: `4f844b93c1c8d0540c34038cbc5b69096c92a3982fe884b2ac877c5df7bdc88f`
- Coverage: 13,835 foods, 24,907 Vietnamese aliases, 300 Vietnamese recipe estimates.
- Sources: USDA Foundation 04/2026, SR Legacy 04/2018, and FNDDS 2021–2023 plus project-authored Vietnamese recipe estimates.

## Release behavior verified in code/tests

- The PWA defers service-worker activation while a workout is active.
- Persistent browser storage is requested only after an explicit user click.
- A partial nutrition pack is removed independently after interrupted installation and can be retried without touching personal tables.
- Backup restore preserves the installed pack while replacing only user-owned records.
- The Pages workflow downloads the canonical GitHub Release asset, checks SHA-256, and only then uploads the deploy artifact.

## Production UI smoke test

- A fresh profile reached the catalog with 50 movement families.
- The horizontal chest-press family displayed six separate equipment variants: barbell, cable, band, machine, Smith machine, and dumbbell.
- Switching to the machine variant changed the guide to the machine-specific creator/video; clicking play created exactly one `youtube-nocookie.com` iframe with the expected direct video ID and title.
- The real 16.4 MB pack installed into browser OPFS and reported version `2026.04`.
- Explicit offline search for `ức gà` returned USDA foods and Vietnamese recipe estimates; selecting a result displayed kcal, fiber/sugar, minerals, and available vitamins with USDA/CC0 attribution.

## Remote release checks

- Public repository: <https://github.com/luutru433-coder/gym-local>
- Nutrition release: <https://github.com/luutru433-coder/gym-local/releases/tag/nutrition-v2026.04>
- The release asset downloaded back from GitHub as 16,445,440 bytes with SHA-256 `4f844b93c1c8d0540c34038cbc5b69096c92a3982fe884b2ac877c5df7bdc88f`.
- Pages workflow run `31349834535` passed the full verification suite, verified the release asset checksum, and completed both build and deploy jobs for app commit `bf68d790203bd05aa6eb0c07054f13f016206ab1`.
- Live app: <https://luutru433-coder.github.io/gym-local/> returned HTTP 200 with title `Gym Local`; the deployed nutrition manifest also returned HTTP 200.
- A fresh live-browser profile completed onboarding and reached all five main navigation areas. The live catalog reported 50 movement families; horizontal chest press showed six equipment variants, switching to the machine selected the Tim Bullici machine guide, and play created one privacy-enhanced iframe for direct video ID `gNBU7hmW2EU`.

## Remaining physical-device checks

- Physical iPhone Home Screen/offline relaunch and camera accept/decline require the target device and remain listed in `docs/release-checklist.md`.
