# Verification report — 2026-08-10

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

## Device/repository checks

- GitHub publication, Release upload, and live Pages URL are completed as part of the release step and must be recorded here after the remote workflow succeeds.
- Physical iPhone Home Screen/offline relaunch and camera accept/decline remain device checks in `docs/release-checklist.md`.
