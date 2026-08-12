# Codex update playbook

Use one narrowly scoped change request at a time. Start from `docs/codex-change-template.md`, identify the owning module below, and keep unrelated modules unchanged.

| Change | Primary owner | Required checks |
| --- | --- | --- |
| Add or correct an exercise/equipment option | `packages/catalog` | `pnpm content:validate`, `pnpm content:audit`, catalog tests |
| Change media hosts or links | `packages/media`, `packages/catalog` | media allowlist tests and content checks |
| Change routine/session behavior | `packages/workouts` | workout tests; full verify if snapshots change |
| Change calories, macro, or food lookup | `packages/nutrition` | nutrition tests; bump formula version when math changes |
| Change PR, e1RM, or charts | `packages/progress` | progress tests; never merge equipment variants |
| Change IndexedDB tables | `packages/contracts`, `packages/storage` | ADR, schema version bump, migration and backup round-trip tests |
| Change backup structure | `packages/contracts`, `packages/backup` | backup version decision, current/two-previous compatibility tests |
| Change visual components only | `packages/ui`, `apps/web` | lint, typecheck, interaction smoke test, mobile review |

## Safe sequence

1. Record the user-visible result and explicit non-goals.
2. Read the root `AGENTS.md` and any nested `AGENTS.md` for the owning module.
3. Update contracts first only when the domain model truly changes.
4. Add or update the smallest relevant test before modifying adjacent modules.
5. Run `pnpm run verify:affected`; run `pnpm run verify` for any cross-module, storage, backup, or release change.
6. Update `CHANGELOG.md` and source/review metadata when user-visible behavior or content changes.

## Long-running changes

- Work on a `codex/*` branch and create a verified checkpoint at least every 30 minutes and at every stable release boundary.
- A checkpoint is a Conventional Commit made only after the currently affected lint, typecheck, tests, and content gates pass.
- Record the exact checks and known warnings in `docs/verification-report.md` before checkpointing.
- Do not mix two schema migrations, two unrelated feature owners, or generated artifacts in one checkpoint.
- If a later step fails, continue from the newest green checkpoint rather than rewriting or discarding user data.

Generated folders (`dist`, `apps/web/dev-dist`) and personal data are never source files. Do not commit local backups, exported CSV files, or browser storage.
