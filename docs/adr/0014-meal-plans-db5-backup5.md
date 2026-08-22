# ADR 0014: Deterministic meal plans, DB5, and backup v5

## Status

Accepted for checkpoint N4.

## Context

A saved weekly plan must survive catalog and algorithm updates, while generation must remain local, explainable, and safe for pantry and diary history.

## Decision

- `generateOfflineMealPlan()` is a pure deterministic function with a versioned algorithm and seed. It requires a current confirmed target, treats diet/allergen filters as hard constraints, prevents repeated recipes and consecutive main proteins, and allocates pantry quantities across the whole week without mutating pantry data.
- The planner prioritizes daily kcal ±10%, protein 90–110%, carbohydrate/fat ±15%, then pantry coverage and diversity. The closest feasible plan carries warnings and a shopping-list snapshot; unknown micronutrients remain unknown.
- IndexedDB schema 5 adds `mealPlans`. Saved plans snapshot targets, filters, names, ingredients, nutrients, pack version, and algorithm version.
- Backup v5 includes meal plans and imports v1–v4 by adding an empty list only. The reproducible pack remains excluded.
- Logging a day or week is one append-only transaction keyed by saved-plan and planned-meal IDs, so retries cannot duplicate diary rows.

## Consequences

Saved personal plans are insulated from pack updates. Contract/schema changes require migration, rollback, and round-trip coverage.
