# ADR 0010: Explainable offline menu ranking

## Status

Accepted — 2026-08-14

## Context

Menu suggestions must work without an account or network and must distinguish “I have this exact food” from “I have something in this food group.” Users also need to see why a recipe was suggested and what is still missing. Keeping ranking inside UI components would make the behavior difficult to test or update safely.

## Decision

- The nutrition-pack worker performs read-only schema-2 queries and returns recipes, ingredients, and tags. It does not access personal pantry data.
- `packages/nutrition` owns a pure deterministic ranking function. UI calls its public API and never reads SQLite directly.
- Exact food matches rank above broad food-group matches. Optional quantities contribute a 0–1 availability ratio; an undersupplied required ingredient is reported as incomplete.
- Ranking order is: all required ingredients available, required coverage, exact matches, group matches, optional calorie-target distance, protein, then stable recipe ID.
- Meal slot, dietary tags, and excluded allergens are hard filters. Each result includes per-ingredient match type, availability ratio, missing-required count, and estimated per-serving nutrients.
- Schema 1 packs remain searchable and usable for logging, but menu suggestions require schema 2.

## Consequences

- Suggestions are reproducible, explainable, offline, and independently testable.
- A future ranking revision can remain isolated in the nutrition module and be versioned without changing personal records or SQLite ownership.
- Broad groups intentionally express flexibility; they never claim that a specific catalog food is present.
