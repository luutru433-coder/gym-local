# ADR 0018: Supersets in live workouts

## Status

Accepted.

## Context

`RoutineItem.supersetGroup` has existed since the first routine editor, but the label was dropped when a session started: every exercise block was logged alone and every completed set started that block's rest timer.

## Decision

- `SessionExercise` gains an optional `supersetGroup` label, copied from the routine item when a session starts. Blocks that share a label form a superset; a label used by one block means nothing.
- No database or backup version bump. Sessions are stored as whole records, the field is optional, and backup v6 validation accepts it (session exercises were already `passthrough`, so earlier builds keep the field through a restore). Sessions without the field behave exactly as before.
- A round is one set from each member, in workout order. Completing a set moves to the next member later in the round that still has an open set and starts no rest timer. Completing the round's last set starts the rest timer with that block's `restSeconds` and makes the first member with an open set active. When members have different set counts, the remaining member simply rests after every set.
- Round logic lives in `@gym/workouts/superset`, loaded with the workout page; `updateSet` is unchanged, so set persistence, undo, history, and records are untouched and remain exact-variant.
- During a workout a block can be grouped with the next block or taken out of its group. This edits the session only, never the routine.

## Consequences

- Warm-up sets take part in rounds like any other set; they still do not count toward weekly working sets.
- The rest after a round is the rest of the block that ended it; there is no separate group-level rest value.
- Nothing is added to the startup entry chunk.
