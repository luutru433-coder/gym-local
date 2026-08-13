# ADR 0007: Snapshot-safe nutrition workflows and measured release gates

- Status: Accepted
- Date: 2026-08-13

## Context

Gym Local already stores recipes, water entries, and food preferences in personal-data schema v3, but those records need complete local-first workflows. Nutrition-pack updates, remote barcode lookup, exercise video availability, and growing JavaScript bundles also need observable release gates without moving private data or rich media into the application bundle.

## Decision

- Recipe ingredients and meal entries keep immutable nutrient and name snapshots. Editing or deleting a current food or recipe never rewrites historical diary entries.
- Adding a meal and recording its recent/default-serving preference is one IndexedDB transaction. Favorites, recency, and use counts only rank saved foods and never change nutrient data.
- Optional micronutrients are aggregated only when every contributing snapshot has a known value. Unknown values remain unknown and are never converted to zero.
- Estimated nutrition targets store their formula version, inputs, calculation time, source, and explicit confirmation time. A formula or input change requires review before the target is used again.
- UI modules reach personal storage, the optional SQLite pack, and remote barcode lookup only through public store/domain actions. Camera code is loaded only after the user explicitly requests permission.
- The existing database schema v3 and backup v3 already contain recipes, water, preferences, and target provenance, so this release adds behavior and round-trip coverage without a schema or backup version bump. Backup v1, v2, and v3 remain importable.
- Production builds fail when entry, route, vendor, worker, initial-graph, or PWA-precache budgets are exceeded. Core route assets must be precached; source maps, the downloadable SQLite pack, remote video URLs, and social-preview media must not be precached.
- Static media auditing is deterministic and mandatory. Network video availability is a separate scheduled/manual metadata-only check and never downloads media or changes editorial review dates automatically.
- Deployment stages the nutrition pack outside the artifact, validates byte size, SHA-256, SQLite integrity, schema, counts, and search, then copies the verified file into the deploy artifact.

## Consequences

- Food deletion may remove the current preference, but historical meals and recipe ingredient snapshots remain readable.
- Diary totals clearly distinguish missing micronutrients from measured zero values.
- A profile update cannot silently activate a recalculated nutrition target.
- Performance and content regressions produce machine-readable reports that Codex and CI can compare between checkpoints.
