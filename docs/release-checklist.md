# Release checklist

1. Finish or safely pause any active workout in the test profile.
2. Run `pnpm install --frozen-lockfile` and `pnpm release:check`.
3. Run `pnpm nutrition:verify-pack`; compare file size and SHA-256 with `public/nutrition-pack-manifest.json`.
4. Confirm content audit reports at least 180 reviewed variants and direct video coverage for every reviewed variant.
5. Verify backup v3 export/restore, backup v1/v2 import, IndexedDB v1→v2→v3 migration, pre-restore recovery/undo, active-workout refusal, and nutrition-pack preservation.
6. Inspect the PWA bundle report; the SQLite pack and remote videos must not enter the service-worker precache.
7. Upload the SQLite file to release `nutrition-v2026.04`, then deploy the exact verified commit.
8. Confirm the Pages workflow downloads the release asset, validates SHA-256, and publishes successfully.
9. Verify install, offline relaunch, deferred update, pack install/search/remove, and recovery after an interrupted pack download.
10. On the target iPhone, verify Home Screen install and accept/decline camera permission for barcode scanning.
11. Update `CHANGELOG.md`, `docs/verification-report.md`, source metadata, and release notes.
