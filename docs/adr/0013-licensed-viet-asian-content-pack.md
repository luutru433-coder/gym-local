# ADR 0013: Licensed Việt–Á content and atomic pack releases

## Status

Accepted for checkpoint N3.

## Context

Offline distribution requires reproducible nutrient data and clear redistribution rights. Recipe text, images, and media copied from cooking websites would introduce license and provenance risks.

## Decision

- The released ingredient corpus is built from pinned USDA FoodData Central CC0 exports. Taiwan FDA and Korea RDA remain supported contract sources but are not imported until a pinned, reviewed redistribution input is added to the pipeline.
- The project authors its own short Vietnamese recipe names and preparation instructions from measured, pinned ingredients. It does not scrape or copy recipes, images, or media.
- The pack contains exactly 480 Vietnamese and 320 other Asian dishes with deterministic cuisine, meal-slot, dietary, allergen, ingredient-signature, and source gates.
- Installation validates size, SHA-256, SQLite integrity, schema, counts, relationships, and Vietnamese FTS before atomically activating the new pack. The previous ready pack remains available for rollback.

## Consequences

Each cuisine/source content file can evolve independently, but any new external dataset needs explicit license review and deterministic source pinning before release.
