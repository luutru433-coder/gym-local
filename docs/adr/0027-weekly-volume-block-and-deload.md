# ADR 0027: Weekly set changes, block week and deload in the next-session plan

## Status

Accepted.

## Context

The engine (ADR 0024) can score performance, decide a muscle's set change from soreness and performance, and plan a block that ends in a deload. Soreness answers exist since ADR 0026. The home screen's next-session plan still used only double progression and the ease-back rules, so set counts and target effort never changed.

## Decision

- `planEngineSession` (`@gym/workouts/autoregulation-week`) takes the existing next-session plan and adds the engine's week to it. It runs only for an on-track plan; a first session or a return after 10+ days keeps the existing plan.
- Nothing new is stored. Everything is derived from finished sessions on each read, so there is no schema, database or backup change.
- Block week (ours): calendar weeks (Monday start) trained in a row up to the current one, cycling every 5: four hard weeks, then a deload. A week with no workout restarts the count at 1.
- Target RIR per week comes from `blockWeek`: 4, 3, 2, 1, then 5 in the deload. It replaces the routine's target RIR on working sets of the new session only.
- Set change per muscle, from the latest session of the last 14 days that trained it as a primary muscle: its soreness answer and `performanceScore` of its logged weight x reps sets go to `volumeDecision` (RP's published table) with the muscle's working sets of the last 7 days. No soreness answer, or no scorable sets, means no change.
- The change is applied to this session at one set per muscle at most (ours), on top of the sets planned the last time each exact variant was trained, within 2-6 sets per exercise; in block week 1 the count restarts from the routine. A score of 4 (targets missed) halves the muscle's sets for this session.
- Deload week: half the routine's working sets (at least 2) at RIR 5. `needsEarlyDeload` brings it forward when a muscle scored 4 in each of the last two 7-day windows, or two muscles did in the last one.
- An item's muscle is its movement's first primary muscle, so one exercise is never changed twice.
- The home card shows the block week, the target effort, each changed muscle with the reason, and that set counts need a soreness answer. The existing "apply adjustments on start" switch covers these changes; off, the routine starts unchanged. The routine and history are never rewritten, and every set stays editable.

## Consequences

- Without soreness answers the only visible change is the weekly target RIR and the deload.
- The block position follows the calendar, not a stored start date: skipping a week restarts it, which also stands in for a deload.
- Weekly e1RM change is not yet passed to `performanceScore`; it scores rep targets and logged RIR only.
