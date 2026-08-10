# Storage module rules

- This is the only module allowed to import Dexie or access IndexedDB.
- Migrations are transactional and additive before any destructive cleanup release.
- Preserve current and two previous backup versions.
- Never delete or rewrite user records during seed/catalog upgrades.
- Every migration needs upgrade, failed-upgrade, and backup round-trip tests.
