# ADR 0004: Validate nutrition records and isolate browser adapters

- Status: Accepted
- Date: 2026-08-12

## Context

Locale-formatted numbers, missing provider nutrients, interrupted pack updates, and invalid backup payloads can otherwise turn unknown values into zero or produce a file that cannot be restored. The current nutrition worker also crosses the repository boundary by combining domain logic, network access, SQLite, and OPFS ownership.

## Decision

- Nutrition drafts are parsed and validated in the nutrition domain before they become `FoodItem` or `MealEntry` records. Storage validates finite persisted values again at its boundary.
- A provider result with missing calories, protein, carbohydrate, or fat remains an incomplete candidate. The user must complete the values or choose another result before logging it.
- Missing micronutrients remain unknown and daily summaries report data coverage; unknown is never converted to zero.
- Backup export validates the current payload before serialization, and restore validates and migrates before replacing user data transactionally.
- Only provider adapters perform network requests. Only storage adapters own IndexedDB, OPFS, SQLite, migrations, and atomic pack activation.
- Nutrition pack updates use a validated staging file and retain the last working pack until the replacement has passed an open-and-search smoke test.

## Consequences

- React pages call feature controllers and never access a provider or browser database directly.
- Pack or manifest network failure cannot disable an already installed pack.
- Provider and storage errors use typed, localizable error codes.
- Backup v3 and database v3 will add recovery metadata without rewriting historical meals.

