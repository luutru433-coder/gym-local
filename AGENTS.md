# Gym Local repository guidance

## Packet execution

- Use `gpt-5.6-sol` for repository implementation and automated-verification tasks. Stop if that model is unavailable.
- One Codex task handles exactly one coordinate packet.
- Read the root and applicable nested `AGENTS.md`, `docs/ai/master-plan.md`, the packet, and `docs/ai/review-procedure.md` before changing files.
- Do not edit outside the packet's `allowed_paths`; do not widen scope implicitly.
- Stop at any packet stop gate and write a blocker report instead of continuing.
- Run every required automated command in the packet. A packet is incomplete without an immutable candidate commit, an in-scope diff, a schema-valid handoff, automated verification with `status: PASS`, and no triggered safety stop gate.
- Cold review, owner review, independent review, manual review, named reviewers, and physical-device review are optional evidence only. They never complete, block, or authorize a candidate or merge, and an unperformed optional check must never be reported as passed.

## Product invariants

- The app is local-first, single-profile, usable without an account, and keeps workout UI bilingual while nutrition presentation remains Vietnamese-only.
- Workout, nutrition, catalog, progress, media, storage, backup, and UI remain separate modules and interact only through public `@gym/*` entry points.
- Never mix performance history or PR values between equipment variants.
- Catalog or pack updates never overwrite user routines, sessions, custom exercises, nutrition history, pantry, or saved plans.
- Text, workout data, and installed animation packs work offline; external video is optional and online-only.
- Never scrape or bundle media without machine-valid source, redistribution-right, attribution, and provenance metadata.
- Only `packages/storage` owns database access and migrations; UI does not access IndexedDB, OPFS, or external APIs directly.
- Stable IDs are immutable. Contract or schema changes require an ADR and compatibility tests.

## Verification

- Run `pnpm run verify:affected` for scoped packets and `pnpm run verify` for contract, storage, backup, release, or cross-module packets.
- Content packets also run `pnpm content:validate` and `pnpm content:audit` and update source/review metadata.
- Required command evidence must be recorded exactly in the handoff; optional manual or device evidence has no gate effect.
- Automated tests must preserve the rule that a PWA update is not activated during an active workout.
