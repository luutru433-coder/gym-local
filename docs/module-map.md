# Gym Local module map

Use this map before changing behavior. A change starts in the primary owner and crosses a module only through its `@gym/*` public entry point.

| Capability | Primary owner | Browser adapter | UI composition | Minimum verification |
| --- | --- | --- | --- | --- |
| Exercise names, equipment, instructions, tracking semantics, and guide metadata | `packages/catalog` | `packages/media` for remote media policy | `features/catalog` | catalog tests and content gates |
| Routine templates, session mutations, set types, and progression rules | `packages/workouts` | `packages/storage` for persistence | `features/routines`, `features/workout` | workout tests; full verify when snapshots change |
| Previous values, volume, e1RM, PR, muscle sets, and charts | `packages/progress` | `packages/storage` supplies sessions | `features/progress` | progress calculation matrix |
| Food validation, nutrient math, recipes, targets, and provider result mapping | `packages/nutrition` | nutrition providers for network; `packages/storage` for SQLite/OPFS | `features/nutrition` | nutrition tests and pack audit |
| IndexedDB, OPFS, SQLite, migrations, and transactions | `packages/storage` | owned here | called through app store/controllers | migration, failure, and backup round-trip tests |
| Backup parsing, migration, checksum, and CSV serialization | `packages/backup` | browser download is composed by the app | `features/settings` | current and two previous backup versions |
| Accessible visual primitives and design tokens | `packages/ui` | none | all features | component, accessibility, and visual tests |
| PWA update lifecycle and application routing | `apps/web/src/app`, `apps/web/src/pwa` | service worker registration | app shell | active-workout update and offline E2E |

Personal-data ownership in schema v3:

- `programs` and `routines`: workout programming; backup and recovery included.
- `recipes`, `waterEntries`, and `foodPreferences`: nutrition; backup and recovery included.
- `recoveryPoints`: storage-only safety data; deliberately excluded from backup.
- `nutritionPacks`: reproducible public data status; deliberately excluded from backup and restore.

## Feature layout

Each feature should keep the page as a small composition root:

```text
features/example/
  ExamplePage.tsx
  useExampleController.ts
  example-view-model.ts
  components/
  __tests__/
```

- Controllers may call public `@gym/*` APIs and application-store commands.
- Components receive serializable view data and callbacks; they do not call storage or providers.
- Shared domain behavior belongs in a package, not a React hook.
- Shared visual behavior belongs in `@gym/ui`, not in a feature stylesheet.
- Visible text and accessible labels use typed bilingual message keys.

## Codex handoff checklist

1. Copy `docs/codex-change-template.md` and name the owning module and non-goals.
2. Add the smallest regression test that proves the requested behavior.
3. Change public contracts only when the domain shape truly changes; add an ADR and compatibility path.
4. Run the checks from the table and `pnpm run verify:affected`.
5. For storage, backup, catalog, or cross-module changes, run `pnpm run verify` and update `docs/verification-report.md`.
6. Record user-visible behavior in `CHANGELOG.md` and create a checkpoint before starting the next module.
