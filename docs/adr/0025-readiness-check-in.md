# ADR 0025: Pre-workout check-in and warm-up feel on the session

## Status

Accepted.

## Context

The autoregulation engine (ADR 0024) takes an optional check-in (sleep, energy, soreness, 1-5) and an optional warm-up feel when it estimates the day's strength. The workout screen passed neither, so the estimate before the first set used muscle recovery alone. ADR 0024 listed the fields needed as separate work.

## Decision

- `WorkoutSession.checkIn?: { sleep, energy, soreness }`, integers 1-5. 3 is a normal day; soreness 5 means none. Absent when the questions were skipped.
- `SessionExercise.warmupFeel?: "worse" | "expected" | "better"`. It belongs to the exercise, not the session, because a warm-up says something about that movement only.
- Both are optional and added the way ADR 0020 added set timing: no database version bump, no migration, no backup version bump. The backup schema checks their types (answers outside 1-5 or an unknown feel are rejected). Sessions without them behave exactly as before.
- The workout screen shows the three questions at the top of a workout, preset to 3, with Save and Skip. They can be answered, edited or cleared for as long as the session is active; once a set is done an unanswered card is no longer offered. The warm-up question appears on a load-and-reps exercise once one of its warm-up sets is done.
- `adviseSet` passes both to `readinessFactor`. Sizes are the engine's, unchanged: 1.5% per point of the mean answer away from 3 (at most 3% either way), +1.3% for a lighter warm-up, 2.6% down for a heavier one, total factor kept within 0.85-1.05. The reason under a suggestion names which inputs moved it.
- Values are read defensively: malformed answers on a stored session are ignored instead of throwing.

## Consequences

- The answers are stored on the session, so a later change can replay them (for example to learn how much a poor night really costs this user). Nothing reads them after the workout yet.
- The check-in is self-reported and coarse; the sample run in ADR 0024 showed it catching about a third of a bad day, with the rest corrected after the first set.
- That a questionnaire and the warm-up adjust the day's load is published by JuggernautAI; the scale and the sizes are ours (ADR 0024).
- Still separate work: soreness feedback per muscle after a session, weekly set changes, blocks and deloads, and the home screen's next-session plan.
