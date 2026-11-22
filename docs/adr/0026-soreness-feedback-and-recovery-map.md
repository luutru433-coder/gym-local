# ADR 0026: Soreness feedback on the session and the engine's recovery on the home map

## Status

Accepted.

## Context

The autoregulation engine (ADR 0024) estimates each muscle's recovery from exponentially decaying fatigue and can tune a muscle's time constant from soreness (`calibrateTau`). The app asked for no soreness, so the constant never moved. The home screen's recovery map used a separate fixed rule (36 h + 4 h per set, capped at 96 h), so the map and the set suggestions on the workout screen could disagree about the same muscle.

## Decision

- `WorkoutSession.soreness` is a new optional field: a score 1-4 per muscle group. 1 not sore, 2 sore but gone well before the next session, 3 gone just in time, 4 still sore at the next session. The scale is the one RP Hypertrophy publishes; what each score does to the time constant is ours.
- The home recovery map asks about the latest finished session of the last 10 days, one row per primary muscle of its completed working sets (warm-ups excluded, secondary muscles not asked). Answers are optional, can be changed, and tapping the chosen answer clears it. They are written to that finished session through the existing history edit path; no other field changes.
- `personalTauHours` replays all answers in date order through `calibrateTau`: score 4 lengthens that muscle's time constant by 10%, score 1 shortens it by 5%, 2 and 3 leave it, bounded to 12-60 h. The value is derived on read and not stored, so editing or deleting a session or an answer recalculates it.
- `buildAdviceContext` uses these time constants, so the workout screen's readiness and the home map share one estimate.
- The home map shows the engine's recovery (`recoveryOverview`): ready from 85% recovered (the engine's `readyAt`), fatigued below 60% (ours), recovering between. Hours left come from the engine. The weekly working-set count per muscle is unchanged.
- No database version bump and no backup version bump: the field is optional and unindexed. Backup validation accepts integer scores 1-4 and rejects others. Readers ignore a malformed score.
- Muscle recovery aggregates across equipment variants by design (a muscle is tired whatever trained it). Performance history, e1RM and records stay per exact variant.

## Consequences

- The map changes for the same history: fatigue now depends on how hard the sets were and fades continuously, instead of a fixed window per set count.
- One answer moves a time constant by at most 10%, so the estimate adapts slowly. It is an estimate for planning, not a medical judgement, and the card says so.
- `muscleRecoveryMap` in `@gym/progress` is now used only for the weekly set counts on the card.
- Still not in the app: weekly set changes from soreness and performance, blocks and deloads, and the home next-session plan.
