# ADR 0012: Nutrition pack schema 3 and immutable legacy redirects

## Status

Accepted for checkpoint N2.

## Context

Schema 2 contained 300 generated combinations with insufficient cuisine, preparation, translation-review, and lifecycle metadata. Reusing those IDs would silently change historical meaning.

## Decision

- Schema 3 adds source dataset/license/review fields, translation status, cuisine/region/dish metadata, preparation time, meal/diet/allergen tags, Vietnamese preparation steps, and recipe redirects.
- All 300 `vi_recipe_NNN` IDs are deprecated and redirect to new immutable IDs. Active IDs are never reused.
- The application continues to read schema 2 for search and logging; seven-day planning requires schema 3.
- The deterministic pipeline owns SQLite, manifest, statistics, byte size, and SHA-256. Generated SQLite files are never edited manually.

## Consequences

Catalog upgrades cannot rewrite user history. Older installed packs remain usable while new planning behavior has an explicit data-quality gate.
