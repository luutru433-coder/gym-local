# Release checklist

1. Finish or safely pause any active workout in the test profile.
2. Run `pnpm install --frozen-lockfile` and `pnpm release:check`; retain `dist/reports/performance-report.json` and `reports/media-health-report.json`.
3. Run `pnpm nutrition:verify-pack`; compare file size and SHA-256 with `public/nutrition-pack-manifest.json`.
4. Confirm `pnpm media:health` reports exactly one direct video, traceable source/license metadata, and complete offline text guidance for every reviewed variant. For a connected release, run `pnpm media:health:online` and review every unavailable link; this checks metadata only and downloads no media.
5. Verify backup v3 export/restore, backup v1/v2 import, IndexedDB v1→v2→v3 migration, pre-restore recovery/undo, active-workout refusal, and nutrition-pack preservation.
6. Inspect the generated performance report. Every budget must pass, all route files must be precached, and the SQLite pack, remote video URLs, source maps, and social preview must remain outside the service-worker precache.
7. Upload the manifest-named SQLite file to its matching `nutrition-vYYYY.MM` release, then deploy the exact verified commit.
8. Confirm the Pages workflow downloads to a temporary staging file, validates byte size, SHA-256, SQLite integrity/schema/counts/search, and only then copies the pack into the deploy artifact.
9. Verify install, offline relaunch, deferred update, pack install/search/remove, and recovery after an interrupted pack download.
10. On the target iPhone, verify Home Screen install and accept/decline camera permission for barcode scanning.
11. Update `CHANGELOG.md`, `docs/verification-report.md`, source metadata, and release notes.
