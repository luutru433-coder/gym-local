# Gym Local repository guidance

## Product invariants

- The app is local-first, single-profile, bilingual Vietnamese/English, and usable without an account.
- Workout, nutrition, catalog, progress, media, storage, backup, and UI are separate modules.
- Never mix performance history or PR values between equipment variants.
- Never overwrite user routines, sessions, custom exercises, or nutrition history during catalog updates.
- Rich media is online-only; core text, routines, logs, and backups must work offline.
- Never scrape or bundle media without an explicit source and license.

## Architecture rules

- Import another module only through its `@gym/*` public entry point.
- UI must not access IndexedDB or external APIs directly.
- Only `packages/storage` owns database access and migrations.
- Only provider modules may perform network requests.
- Contract or schema changes require an ADR and migration/round-trip tests.
- Stable catalog IDs are immutable; deprecate and redirect instead of reusing IDs.

## Verification

- Run `pnpm run verify:affected` for scoped changes.
- Run `pnpm run verify` for contracts, storage, backup, release, or cross-module changes.
- Content changes must pass `pnpm content:validate` and update source/review metadata.
- Review against `docs/code-review.md` before considering a task complete.

## Update safety

- Do not activate a PWA update while a workout session is active.
- Use additive expand-migrate-contract database changes.
- Preserve compatibility with the current and two previous backup versions.
- Add a changelog entry for user-visible behavior, schema, formulas, or catalog changes.
