# ADR 0003: Review and snapshot exercise tracking semantics

- Status: Accepted
- Date: 2026-08-12

## Context

An equipment label is not enough to decide how a set should be entered or compared. A dumbbell exercise may be bilateral or unilateral, an assisted machine improves as assistance decreases, and timed isometrics must not be represented as repetitions. Deriving every metric from `weightKg * reps` produces misleading volume, history, and personal records.

## Decision

- Every reviewed exercise variant owns explicit tracking semantics for effort, load, laterality, volume, and the supported PR metric.
- A session snapshots those semantics so later catalog changes cannot reinterpret a completed workout.
- History and PR identity is the immutable exercise variant ID. The same variant is intentionally shared across locations; different equipment variants never share load history or PR values.
- Previous values come only from the most recent completed session containing that exact variant.
- Bodyweight-dependent metrics require a bodyweight snapshot. Missing historical bodyweight is reported as unavailable rather than inferred.
- Assisted load is ordered in the opposite direction from lifted load: less assistance is better.
- Legacy set values remain unchanged. In particular, old plank repetitions are not silently converted into seconds.

## Consequences

- Catalog changes require tracking-semantics validation and content review.
- Progress calculators return typed metrics and an exclusion reason instead of forcing every exercise into kilograms or e1RM.
- New optional snapshots remain readable by existing backup v2 readers; the next backup format will preserve them explicitly.
- UI labels and inputs are selected from the snapshot rather than from equipment-name heuristics.

