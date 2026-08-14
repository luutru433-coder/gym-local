# ADR 0008: Structured nutrition pack v2

## Status

Accepted — 2026-08-14

## Context

The first offline nutrition pack exposed foods and Vietnamese aliases, but its 300 recipe estimates were flattened into food rows. The app could search and log a recipe, but could not reliably answer which pantry foods or food groups satisfied its ingredients. Rebuilding recipes with heuristic USDA matches could also silently select a different source record.

## Decision

- Nutrition pack schema 2 adds stable `food_groups`, `food_group_members`, `recipes`, `recipe_ingredients`, and `recipe_tags` tables.
- Every recipe ingredient pins an immutable USDA food ID in reviewed project content. The pack build fails when that source record is missing or no longer matches the ingredient query.
- Optional recipe nutrients are present only when every ingredient has a known value for that nutrient. Unknown values remain `NULL`; they are never presented as zero.
- The manifest declares food-group and recipe-ingredient counts, and publication validation checks integrity, foreign keys, relationship cardinality, metadata, and checksum.
- App 0.6 accepts both schema 1 and schema 2 packs so an already installed offline pack remains usable during an app update. Menu suggestions are enabled only by schema 2 relationship data.
- Rich source datasets and the generated SQLite file remain reproducible release assets rather than personal-data backup content.

## Consequences

- Menu matching can be deterministic and explainable without network access.
- Catalog pack upgrades do not touch personal meals, recipes, pantry entries, or workout history.
- Schema 1 rollback remains available, but structured menu features require installing schema 2.
- Adding or renaming a food-group ID is a contract change and requires another ADR and compatibility review.
