# ADR 0002: Separate the nutrition pack from personal IndexedDB data

- Status: Accepted
- Date: 2026-08-10

## Context

Gym Local needs a large, optional, searchable nutrition dataset while keeping personal data local, backups small, and upgrades recoverable. A full food database does not belong in routine application bundles or user backups.

## Decision

- Personal records remain in Dexie/IndexedDB. Database schema v2 adds only a small `nutritionPacks` installation-status table.
- The downloaded read-only food catalog is a versioned SQLite file owned by the nutrition module and stored in OPFS.
- Installing a pack is always initiated by a user click. The app never requests persistent storage during startup.
- Backup format v2 includes nutrient snapshots and source metadata, but excludes the reproducible SQLite pack.
- Restore replaces user tables transactionally and deliberately leaves the installed pack untouched.
- Backup v1 remains importable; import fills missing `videoGuides` with an empty list and upgrades settings metadata to current schema versions.

## Consequences

- Backups remain portable and small even when the optional nutrition pack is hundreds of megabytes.
- Users can remove or reinstall the public food dataset independently of their private logs.
- Pack compatibility is checked with an explicit manifest schema, application version, byte size, and SHA-256 checksum.
- Browsers without suitable OPFS/worker support fall back to saved/custom foods and online barcode lookup; no private user data is sent.
