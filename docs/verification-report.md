# Verification report — 2026-08-22

## Checkpoint N5 — mobile/offline release candidate

- The exact `pnpm run verify` gate passed: architecture audit, ESLint with zero warnings, TypeScript project references, content/license audits, 149 tests across 18 files, production PWA build, and performance budgets. The packaged pnpm runtime reported only that its global-virtual-store setting differs from the existing `node_modules`; verification itself completed successfully.
- `pnpm content:validate`, `pnpm nutrition:verify-pack`, and `pnpm run verify:affected` passed independently.
- Planner component tests render at 320 px and 390 px, keep nutrition labels Vietnamese even when the profile locale is English, cover confirmed-target gating, and exercise generate/save/log controls. Physical iPhone Home Screen, camera permission, and offline-relaunch checks remain release-device steps.
- The PWA build transformed 2,744 modules, precached 38 entries / 3,206.6 KiB, and passed budgets at 202.3 KiB entry and 609.6 KiB initial graph. The SQLite pack remains outside the service-worker precache.
- Active-workout tests continue to prove that a waiting PWA update is not activated until the workout ends.
- A live 390 px Pages smoke test confirmed the Vietnamese nutrition screen, manifest statistics, planner filters, schema-3 requirement, saved-plan empty state, and no console errors. The test also exposed and led to a regression-covered in-place pack-update action; update failure keeps the prior pack ready instead of forcing a reload.
- The same live flow installed schema 3 over an existing schema-2 pack and found a target-confirmation integration defect; the planner now compares confirmed estimated targets with the current profile inputs and has a matching-profile regression test.
- GitHub Pages run `32578319677` passed the full gate and deployed commit `79fc2db`. A live 390 px update retained the installed schema-3 pack, the saved algorithm-1 plan, and three existing diary rows. Algorithm 2 then generated and saved a 7×3 plan for a confirmed 2,765 kcal target: all seven days reached 2,623–2,758 kcal, 119.4–123.5 g protein, 369–408.6 g carbohydrate, and 74.8–83.8 g fat, with no target-range warning. The page had no horizontal overflow and no browser console warning/error.

## Checkpoint N4 — deterministic weekly plans and personal-data v5

- IndexedDB schema 5 migration, rollback hooks, meal-plan CRUD, personal snapshot/restore, and append-only idempotent day/week logging passed. Logging failure rolls back both diary rows and food-preference updates in one transaction.
- Backup v5 round trips saved plan snapshots and imports backup v1–v4 by adding an empty `mealPlans` list without changing historical nutrition, workouts, custom recipes, pantry, or the independently installed pack.
- Planner tests cover deterministic 7×3 generation, optional snacks, hard allergen/diet filters, no repeated recipe/signature or consecutive main protein, weekly finite-pantry allocation without mutation, target bands, warnings, and unknown micronutrients remaining unknown. Algorithm 2 additionally verifies deterministic 0.5–2.5 portion scaling and consistent nutrient, ingredient, pantry, shopping, saved-plan, and diary snapshots.

## Checkpoint N3 — complete Việt–Á catalog and atomic release

- Pack schema 3 contains exactly 800 active dishes: Việt Nam 480; Trung Hoa/Nhật/Hàn/Thái 50 each; Đài Loan/Ấn Độ 30 each; other Southeast Asia 60. Coverage is breakfast 160, lunch 640, dinner 480, snack 160, vegetarian 480, vegan 320.
- All active dishes have unique IDs, names, and measured ingredient signatures, 5,210 ingredient rows, 3,200 Vietnamese/English preparation steps, source/license/review metadata, dietary/allergen tags, and no unresolved placeholders.
- Content is split into eight independently generated cuisine files. A repeat generation produced byte-identical content and SQLite output.
- The worker stages a new filename, validates it before pointer activation, retains one previous ready file, and removes only the obsolete older rollback file. Failure tests preserve the working pack.

## Checkpoint N2 — schema 3, reviewed Vietnamese search, and legacy redirects

- The verified pack contains 14,335 total foods, 47,328 Vietnamese aliases, and 11,373 reviewed Vietnamese display names. The remaining 2,962 insufficiently translated USDA rows are explicitly `unreviewed` and absent from normal FTS/search instead of receiving a misleading generic Vietnamese label.
- Exactly 300 immutable schema-2 recipe IDs are deprecated and redirected; none is reused by an active recipe.
- The SQLite schema passed the database-schema-validator policy check, foreign-key/integrity validation, accented/unaccented Vietnamese FTS checks, source-license gates, manifest count checks, byte-size validation, and SHA-256 validation.
- Artifact: `gym-local-nutrition-2026.08.1.sqlite3`, 37,552,128 bytes, SHA-256 `190d69434927b583ac231594bd3c2253a6375b654fe1047ae17cce67f919e881`.

## Checkpoint N1 — Vietnamese nutrition boundary

- Nutrition pages use Vietnamese presentation regardless of profile locale; workout localization remains unchanged.
- Nutrient labels, current pantry/menu ingredient names, source mapping, and allergen metadata have regression coverage. Internal English contract fields remain stable for old backups and provider adapters.

## 2026-08-14 — Nutrition pack compressed-transfer hotfix

- Reproduced the production failure: GitHub Pages served the 24,334,336-byte SQLite pack with `Content-Encoding: gzip` and a 7,165,575-byte transfer `Content-Length`.
- Version 0.6.1 skips only the unreliable preflight length comparison for encoded responses; decoded byte count, manifest size, SHA-256, SQLite integrity, schema, and content validation remain mandatory before activation.

## 2026-08-14 — Offline pantry and menu checkpoint

- Nutrition pack schema 2 verified with 13,835 foods, 24,907 Vietnamese aliases, 300 recipes, 1,200 ingredient links, foreign-key integrity, and pinned USDA ingredient records.
- IndexedDB schema 4 and backup v4 passed additive migration, rollback, recovery-point, restore, and v1/v2/v3 import coverage.
- Menu ranking passed exact-food, broad-group, quantity, meal-slot, dietary, allergen, deterministic ranking, and immutable logging tests.
- A real 23.2 MiB schema-2 pack was installed in the local browser; three pantry groups produced 12 suggestions without console errors. The 390 px iPhone layout had no horizontal overflow, and pantry/allergen touch controls are at least 44 px high.
- The iPhone/PWA install card was verified at 390 × 844 with no horizontal overflow. Install-environment tests cover standalone mode, Safari iOS, non-Safari iOS, native browser prompts, and generic browser guidance.
- The exact `pnpm run release:check` gate passed with architecture, lint, TypeScript, content/license audits, 119 tests across 15 files, production PWA build, performance budgets, and 199/199 direct-video metadata coverage. The schema-2 SQLite artifact independently passed integrity/count/search/checksum verification at SHA-256 `278caa98bb378d70c93c572f87e9100f95836677313d4d34b5ff9878d9941974`.

## Local checkpoint 0.5.0

- The complete verification pipeline passed on the combined worktree: architecture audit, ESLint with zero warnings, TypeScript project references, content/license validation, 103 Vitest tests across 12 files, production build, and enforced performance/PWA budgets.
- Nutrition/storage/backup coverage includes recipe, water, preference and exact-barcode behavior; transactional meal/recent writes; v3 round trips; v1/v2/v3 import compatibility; immutable historical food/meal/recipe nutrient snapshots; and missing micronutrients remaining unknown rather than becoming zero.
- Browser acceptance passed on a fresh local profile at 320 px and 1280 px for onboarding, custom food, favorite/default serving, meal logging/edit controls, water logging, recipe creation, multi-day program creation, program-day launch, live-workout controls, and progress calendar. No horizontal page overflow or browser console warning/error was observed.
- Static media audit passed for all 199 reviewed variants with 199 direct videos, traceable attribution/license metadata, complete offline text fallback, and zero issues. The connected YouTube oEmbed health check passed 199/199 without downloading videos or thumbnails.
- Vite built 2,731 modules without a chunk-size warning. The measured entry chunk is 173.0 KiB, initial JavaScript graph 577.2 KiB, and PWA precache 3,132.5 KiB; all core routes are cached while source maps, the SQLite pack, remote video URLs, and social-preview media are excluded.
- Deployment now stages the nutrition pack in a temporary file and verifies byte size, SHA-256, SQLite integrity, schema, source counts, and FTS search before copying it into the Pages artifact.

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
