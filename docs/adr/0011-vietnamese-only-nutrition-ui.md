# ADR 0011: Vietnamese-only nutrition presentation

## Status

Accepted for checkpoint N1.

## Context

The application remains bilingual, but mixed English labels and imported food names made the personal nutrition workflow difficult to scan. Storage and provider contracts must keep their stable English field names for compatibility.

## Decision

- Nutrition pages always render Vietnamese labels, independently of the profile locale. Workout and other features keep their existing Việt/Anh behavior.
- Imported foods expose a reviewed Vietnamese display name. Schema-3 normal search excludes unreviewed translations; English source names remain internal aliases and provenance.
- Nutrient keys remain stable in contracts and snapshots, while the UI maps them to “Năng lượng”, “Chất đạm”, “Chất bột đường”, “Chất béo”, “Chất xơ”, “Axit folic”, and the corresponding Vietnamese micronutrient names.

## Consequences

Backups and older records remain compatible, and nutrition copy can be reviewed without changing workout localization or database fields.
