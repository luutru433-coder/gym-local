# ADR 0005: Personal-data schema v3 and recoverable restore

- Status: Accepted
- Date: 2026-08-12

## Context

Programs, recipes, water logs, food preferences, and restore recovery are durable user data. They must be independently updateable without coupling the optional public nutrition pack to personal history. A failed or mistaken restore must not leave the single local profile empty or partially replaced.

## Decision

- IndexedDB schema v3 adds `programs`, `recipes`, `waterEntries`, `foodPreferences`, and `recoveryPoints` tables. Existing tables and IDs remain unchanged.
- Backup v3 includes all personal tables except recovery points and the reproducible nutrition pack. Import accepts backup v1, v2, and v3 through explicit sequential migration functions.
- Export reads personal tables from one read-only transaction and validates the complete snapshot before creating a ZIP.
- Restore is refused while a workout is active. Otherwise storage creates a pre-restore recovery point and replaces all personal tables in one transaction.
- Storage retains the two newest recovery points. Undo consumes the selected recovery point transactionally and never changes the installed nutrition pack.
- New collections default to empty when importing v1 or v2. Migration never synthesizes programs, recipes, water, or preferences from existing history.

## Consequences

- React and backup code use a single versioned `PersonalDataSnapshot` contract.
- Database upgrade, failed upgrade, v1/v2/v3 backup migration, restore rollback, and undo require automated tests.
- Catalog, template, and formula version metadata may advance without overwriting user routines or historical snapshots.
- Any future personal table must explicitly decide whether it belongs in backup and recovery snapshots.
