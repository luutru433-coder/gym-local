# ADR 0006: Exact-variant progression and non-destructive live editing

- Status: Accepted
- Date: 2026-08-13

## Context

Gym Local must suggest useful next-session targets without a server or coach, while keeping machine, cable, Smith, barbell, dumbbell, and other equipment histories independent. A live workout also needs flexible add, remove, reorder, and swap controls without silently deleting completed work.

## Decision

- Double-progression suggestions read only finished sessions and completed working sets whose immutable `variantId` exactly matches the requested variant.
- Warm-up, incomplete, and differently equipped variants never contribute to a success streak, previous value, PR, or suggested load.
- A suggestion is advisory output with an explanation and evidence references. It never writes to a routine, active session, or historical session automatically.
- Progress direction comes from the snapshotted tracking profile. Normal external load increases when the configured success streak reaches the top of the target range; assisted load decreases. Reps, duration, and distance progress within their own compatible units.
- Plate guidance is a pure display calculation. It does not change the entered total load and clearly separates bar weight from per-side plates.
- Switching equipment after any completed set preserves the old block and creates a new exact-variant block. Completed exercise blocks and completed sets cannot be destructively removed from a live session; the UI may hide or reorder only unfinished work through domain helpers.
- Freestyle sessions use the same session and variant snapshots as routine sessions, so persistence, backup, progress, and recovery behavior remains identical.
- The optional `settings.activeProgramId` selects the program displayed as active, while `WorkoutSession.programId` snapshots whether a workout was actually launched from that program. Only that snapshotted program may advance when its matching current routine is completed. Editing/selecting another program or running the same routine standalone cannot advance it accidentally. Older sessions, settings, and backups without these fields remain valid.

## Consequences

- Every progression and progress test must include a competing equipment variant to prove that histories remain isolated.
- Live-workout mutation tests must prove that completed work survives equipment swaps and removal attempts.
- Catalog updates may improve future tracking metadata, but existing session snapshots remain authoritative.
- Future progression algorithms must be new explicit rule types; they cannot reinterpret historical data in place.
