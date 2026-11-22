# ADR 0024: Autoregulation engine

- Status: Accepted. The engine was merged first; the workout screen uses it for set suggestions (see "In the app"). Check-in, soreness, weekly set changes and blocks are not in the app yet.
- Date: 2026-11-22

## Context

The owner asked for training that adjusts itself for muscle growth: estimate today's strength instead of relying on past records, track fatigue within a session and between sessions, change the number of sets from feedback, use RIR/RPE and estimated 1RM, adjust before, during and after a session, model muscle recovery, and consider velocity-based training. Four apps were researched first (Alpha Progression, RP Hypertrophy, JuggernautAI, Fitbod; one sourced report each, kept outside the repository).

What the research settled:

- None of the four publishes its formulas or thresholds. They publish inputs, outputs and the direction of adjustments. So nothing here is a copy of an app's engine; each rule below says whether it comes from something a maker published or is our own.
- No app covers the whole request. Alpha Progression re-plans load and reps after every set but does not change volume or model recovery. RP Hypertrophy changes volume from soreness and performance but estimates nothing during the session. JuggernautAI adjusts from readiness and warm-ups but is built for squat, bench and deadlift. Fitbod models recovery per muscle but its strength model needs data from many users, which a personal offline app does not have.
- None of the four takes bar velocity as an input to its main engine. JuggernautAI has a separate camera app.

Today the app has double progression per exact variant (ADR 0006), an ease-back after days off, and a recovery map with a fixed linear window (36 h + 4 h per set). Sets already store optional `rir`, `rpe`, `targetRir`, `startedAt`, `workSeconds` and `restBeforeSeconds` (ADR 0020).

## Decision

Add `@gym/workouts/autoregulation`: pure functions over plain data, with no catalog, storage or clock access. Same inputs always give the same outputs. Invalid numbers throw `RangeError` instead of producing a prescription. Units are kg, whole reps, seconds and hours; RIR is 0-10 in 0.5 steps.

It replaces population data with the owner's own log: every constant is a starting default that is re-learned from his sets or his soreness answers.

### Pipeline

| Stage | When | Function | Inputs | Outputs |
| --- | --- | --- | --- | --- |
| Baseline strength | before | `estimateBaseline` | completed working sets of the exact variant (load, reps, RIR or RPE), session dates, now | e1RM (0.1 kg), sessions used, days since last, detraining factor, confidence |
| Readiness | before, warm-up | `readinessFactor` | recovery (0-1) of the primary muscles; optional check-in (sleep, energy, soreness, 1-5); optional warm-up feel (worse, expected, better) | factor 0.85-1.05 and its three parts |
| Capacity for the next set | during | `nextSetCapacity` | prior (baseline × readiness), today's completed sets, rest before the next set, personal drop per set | today's fresh e1RM, e1RM left for the next set, share retained |
| Prescription | before, during | `prescribeSet` | capacity, rep range, target RIR, loads the equipment allows, current load | load, reps, expected reps to failure, expected RIR, action (start, keep, raise, lower), in-range flag, feasible flag (false when no available load allows one rep), reason in vi/en |
| Personal fatigue | after | `calibrateFatigueDrop` | history of the exact variant | drop per set, number of set pairs behind it |
| Muscle recovery | after, before | `setFatigueUnits`, `muscleRecovery`, `calibrateTau` | per set: RIR and primary/secondary role; per muscle: load events, time constant; soreness 1-4 | per muscle: fatigue units, recovery 0-1, hours until ready; updated time constant |
| Performance | weekly | `performanceScore` | each set's targets against reps and RIR logged; change in fresh e1RM since last week | score 1-4 |
| Volume | weekly | `volumeDecision`, `distributeSetDelta` | soreness 1-4, performance 1-4, weekly sets, bounds; sets per exercise | action (add, hold, remove, recovery session), set change, reason; sets per exercise |
| Block | weekly | `blockWeek`, `needsEarlyDeload` | week number, block length, lowest RIR; recovery sessions per week | target RIR, deload flag, set factor; early-deload flag |
| Tempo | during | `tempoSlowdown` | `workSeconds` and reps of the first and the current set at one load | seconds per rep relative to the first set |

### Rules and where each comes from

"Published" means a maker states it about its app or method. "Ours" means chosen here; the number is a default.

| Rule | Value | Source |
| --- | --- | --- |
| e1RM = load × (1 + (reps + RIR) / 30) | Epley | Published: JuggernautAI's help centre gives this formula to lifters and Fitbod names Epley as a starting point; neither says it is the engine's formula. Alpha Progression's example 1 (20 kg × 15 about equal to 25 kg × 6) fits it. Adding RIR to reps: Alpha Progression's glossary says reserve must be modelled; the way to do it is ours. |
| Sets with reps + RIR over 20 are not used for e1RM | 20 | Ours. |
| RIR of a set: logged, else 10 − RPE, else the target, else 0 | | 10 − RPE: published mapping (Alpha Progression glossary, JuggernautAI). Fallback order: ours; reading an unrated set as failure under-estimates strength, which errs toward lighter loads. |
| Baseline: best set of each of the last 5 sessions, each session weighted half the one before | 5, 0.5 | Direction published by Fitbod (strongest and most recent sessions count most); the weights are ours. |
| Detraining: after 7 days without the variant, 0.5% per day, at most 20% | 7, 0.5%, 20% | The one-week start is in Fitbod's patent; the rate and floor are ours. |
| Readiness, recovery part: up to −10% when a primary muscle is fully fatigued | 10% | Ours. |
| Readiness, check-in: 1.5% per point of the mean answer away from 3 | ±3% | That a questionnaire moves the day's load: published by JuggernautAI. The scale and size are ours. |
| Readiness, warm-up feel: better +1.3%, worse −2.6% | | Published example by JuggernautAI: 190 kg becomes 192.5 kg or 185 kg. Applying those ratios generally is ours. |
| Within the session, each of today's sets counts 3 times the pre-session estimate | 3 | That targets are re-derived after every set: published by Alpha Progression. The weight is ours. |
| Capacity drops per completed set | 3% at 2 RIR and 120 s rest | That the next set may be lower: published by Alpha Progression. The size is ours and is re-learned per exercise once 6 pairs of consecutive sets exist that are both rated or both unrated (median, with the effort and rest multipliers divided out, kept within 1-8%). |
| Harder sets and shorter rests cost more | ×1.5 at 0 RIR to ×0.6 at 4+ RIR; ×0.75 at 180 s to ×1.75 at 30 s | Ours. No app documents using rest time. |
| Load choice: among the loads the equipment has, reps at the target RIR (nearest whole rep) must fall in the rep range; keep the current load when it does | switch penalty 0.5 | Published by Alpha Progression (available weights are a hard limit, rep target a soft one, no reload for a negligible gain). The cost function is ours. |
| Fatigue units per set | 1.25 at 0 RIR to 0.7 at 4+ RIR; secondary muscle half | The half weight for secondary muscles is what the app already uses. The effort weights are ours. |
| Recovery = 1 − fatigue / 10, fatigue decays exponentially; ready at 85% | time constant 30 h for chest, back, quadriceps, hamstrings, glutes; 20 h for the rest | A 0-100% recovery per muscle from sets, reps and load: published by Fitbod, which does not publish its curve. Fitbod's blog gives 48-72 h as the physiological range; after 8 hard sets these constants give ready at about 50 h for the large muscles and about 34 h for the small ones. The curve and constants are ours. |
| Soreness re-learns the time constant | still sore when trained again: +10%; never sore: −5%; within 12-60 h | That people recover at different rates and the model needs correcting: published by Fitbod, which uses manual edits. Learning it from soreness is ours. |
| Soreness and performance scales, 1-4 | | Published by RP as its manual method (article "Training Volume Landmarks"). |
| Set change: both 1 → +2; 1-2 mix → +1; soreness 3 or performance 3 → hold; performance 4 → recovery session | | Published RP table (it says +2 to 3 for both 1; the lower value is used). Soreness 4 → −1 set follows the direction RP documents for the app (fewer sets when soreness has not healed); the size is ours. |
| Performance is computed from the log, not asked | | Ours. RP's app asks for workload; here missed reps, RIR against target and the e1RM trend give the score. Score 4 from the e1RM trend needs the week's mean to fall 5%, about two reps, because one rep of RIR error already moves a single estimate about 2.5%; the threshold is ours. |
| Weekly sets per muscle stay within 6-20 | 6, 20 | 6: RP's published maintenance volume. 20: top of Fitbod's published 10-20 range. Only RP's quadriceps numbers were verified, so per-muscle bounds stay configurable. Only an "add" decision can raise sets; a muscle below 6 is not pushed up while it is sore. |
| Sets per exercise stay within 2-6 | | Ours. |
| RIR falls 1 per week to the last hard week; last week is a deload | lowest RIR 1 by default | Published RP method (for example 4, 3, 2, 1). RP ends at 0; ending at 1 is ours. |
| Deload: half the sets, RIR 5 | | One third-party observation of Alpha Progression (sets halved, 5+ RIR); RP documents fewer sets and lighter weights. |
| Early deload: recovery session for one muscle two weeks running, or for two muscles in one week | | Ours; RP documents a recovery session or deload when performance drops. |
| Tempo slowdown is reported, never used for a decision | | Ours. The set stopwatch includes set-up and pauses and is not bar speed. |

### Velocity-based training

Not adopted. It needs bar speed from a sensor or camera, which an offline web app on an iPhone does not have, and none of the four apps feeds velocity into its main engine. The set stopwatch gives seconds per rep, which is kept as information only until real logs show whether it tracks RIR.

### What is left out on purpose

- Exercise selection by recovery (Fitbod). The owner's routines stay as he wrote them; the engine changes load, reps and sets only.
- Anything learned from other users.
- Fitbod's newer 1RM formula: its preprint does not say, in what was read, whether weight is in lb or kg.
- Cross-variant estimates. History stays exact-variant (ADR 0006).

## Sample run

`pnpm autoregulation:sample` runs a simulated lifter for a 5-week block and writes `docs/autoregulation-sample-run.md`. The lifter's real formulas differ from the engine's on purpose (another rep curve, slower chest recovery, another fatigue size per exercise, day-to-day noise, an imperfect feel for RIR). It shows every input and output and that the engine stays coherent when its assumptions are wrong. It is a simulation, not evidence about a real person, and it does not show the engine keeping reps in range better than the current rule does.

Known gaps the run shows:

- The engine's e1RM trend is only roughly right. Over the four hard weeks it rose 7.0% on the bench press (real 4.1%), 3.3% on the row (real 3.7%), 7.3% on the squat (real 3.6%) and 0% on the curl (real 3.1%): with a fixed Epley curve and RIR logged as the target, the estimate moves with the rep count as well as with strength. A personal rep-curve constant, learned the same way as the fatigue drop, is the next refinement.
- The learned set-to-set drop moved from the 3% default toward each exercise's real value on three of four exercises (bench 4.4% against a real 4%, row 2.3% against 2.5%, squat 5.4% against 5%) and away from it on the curl (1.6% against 3%); it is noisy with few sessions, because one rep of RIR error moves an estimate about 2.5%.
- The check-in moved the bad day's load by about 2% against a real 6% loss; the rest was caught after the first set.
- With a one-value rep target the engine changes the weight where Alpha Progression holds it; with rep ranges it holds the weight.

## In the app

`@gym/workouts/autoregulation-plan` adapts sessions and the catalog to the engine, and the workout screen calls it for every unfinished working set:

- It applies only to rep-based exercises that progress by entered load, for sets with a rep target, once the exact variant has history or a set done today. Everything else keeps the previous "same as last time" suggestion, as does a first-ever exercise.
- The suggestion fills the empty weight and reps exactly as before and never overwrites what was typed; a typed weight is kept and only the reps are fitted to it. Nothing is logged on the user's behalf.
- Before the first set it uses the baseline and the recovery of the exercise's primary muscles at the start of the workout. After each finished set (including a corrected RIR) the next set is planned again from today's sets and the planned rest.
- A set with no logged RIR and no target RIR is read as 2 RIR, and a set with no target RIR aims for 2 RIR. Using the same value on both sides means unrated history reproduces last time's first set instead of asking for fewer reps.
- Available loads are multiples of the step the screen already uses (2.5 kg for total-weight entry, 1 kg otherwise), because the app has no list of the gym's weights.
- The focus panel shows the suggestion with the expected reps left and the reason; during the rest it shows the plan for the next set.
- History, records, routines, the database and backups are unchanged. The module loads with the workout page, not at startup.
- The pre-workout check-in and the warm-up feel reach `readinessFactor` since ADR 0025.
- Soreness answers calibrate each muscle's time constant, and the home recovery map shows the engine's recovery, since ADR 0026.
- Weekly set changes, the block week and the deload reach the home next-session plan since ADR 0027.

## Consequences

- No schema, database or backup change. The engine and its adapter sit behind their own subpaths and load with the workout page, so the entry chunk is unchanged.
- The rest of the wiring is separate work and needs its own decisions:
  1. The loads each piece of equipment really has, and a new explicit progression rule type next to `double_progression` for the next-session plan on the home screen (ADR 0006 requires new rule types rather than reinterpreting history).
  2. Optional fields on `WorkoutSession` for the check-in, warm-up feel and soreness per muscle, added the way ADR 0020 added timing (optional, no version bump, backup types checked). Block start and length on the program.
  3. Screens: a pre-session card, a weekly review, and the recovery map on the new model. Every suggestion stays advisory with its reason, as today.
- The engine's volume and time-constant state is derived by replaying history plus those optional fields, so backups need no new store.
