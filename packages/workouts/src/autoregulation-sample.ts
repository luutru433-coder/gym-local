/**
 * Sample run for the autoregulation engine (ADR 0023): a simulated lifter whose real
 * strength, fatigue and recovery are hidden from the engine and deliberately follow
 * different formulas (Brzycki rep curve, slower chest recovery, larger fatigue penalty).
 * Not shipped in the app; `pnpm autoregulation:sample` writes docs/autoregulation-sample-run.md.
 */
import {
  AUTOREG, DEFAULT_TAU_HOURS, blockWeek, calibrateFatigueDrop, calibrateTau, distributeSetDelta, estimateBaseline,
  muscleRecovery, needsEarlyDeload, nextSetCapacity, performanceScore, prescribeSet, readinessFactor, setFatigueUnits,
  volumeDecision,
  type MuscleLoadEvent, type ObservedSet, type RecoveryMuscle, type ScoredSet, type SorenessScore, type VariantSessionRecord
} from "./autoregulation";

interface SimExercise {
  id: string;
  primary: RecoveryMuscle;
  secondary: RecoveryMuscle[];
  true1rm: number;
  trueDrop: number;
  stepKg: number;
  minReps: number;
  maxReps: number;
  restSeconds: number;
  startLoadKg: number;
}

const EXERCISES: SimExercise[] = [
  { id: "bench press", primary: "chest", secondary: ["triceps", "shoulders"], true1rm: 80, trueDrop: 0.04, stepKg: 2.5, minReps: 6, maxReps: 10, restSeconds: 150, startLoadKg: 55 },
  { id: "barbell row", primary: "back", secondary: ["biceps"], true1rm: 70, trueDrop: 0.025, stepKg: 2.5, minReps: 8, maxReps: 12, restSeconds: 120, startLoadKg: 47.5 },
  { id: "squat", primary: "quadriceps", secondary: ["glutes", "hamstrings"], true1rm: 110, trueDrop: 0.05, stepKg: 2.5, minReps: 6, maxReps: 10, restSeconds: 180, startLoadKg: 75 },
  { id: "dumbbell curl", primary: "biceps", secondary: ["forearms"], true1rm: 35, trueDrop: 0.03, stepKg: 2, minReps: 10, maxReps: 15, restSeconds: 90, startLoadKg: 20 }
];

const TRUE_TAU: Partial<Record<RecoveryMuscle, number>> = { chest: 40 };
const TRUE_RECOVERY_PENALTY = 0.12;
const TOTAL_WEEKS = 5;
const TRAINING_DAYS = [0, 2, 4];
const START = Date.UTC(2026, 10, 2, 11);
/** Week 3, Wednesday: a bad night. Real strength is 6% down and the check-in says so. */
const BAD_DAY = { week: 3, day: 2, factor: 0.94, checkIn: { sleep: 1, energy: 2, soreness: 3 } };

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const trueRepsToFailure = (loadKg: number, capacity: number) => Math.max(0, Math.floor(37 - 36 * loadKg / capacity + 1e-9));
const trueEffort = (rir: number) => rir <= 0 ? 1.5 : rir <= 1 ? 1.2 : rir <= 2 ? 1 : rir <= 3 ? 0.8 : 0.6;
const loadsFor = (exercise: SimExercise) => Array.from({ length: 120 }, (_, index) => (index + 1) * exercise.stepKg);
const fmt = (value: number, digits = 1) => value.toFixed(digits).replace(/\.0+$/, "");

export interface SampleSetTrace {
  week: number; day: number; exercise: string; set: number;
  priorE1rmKg?: number; capacityE1rmKg?: number; loadKg: number; prescribedReps: number; targetRir: number;
  repsDone: number; trueRir: number; inRange: boolean; readiness?: number;
}

export interface PolicyMetrics {
  sets: number;
  inRangePercent: number;
  unplannedFailurePercent: number;
  meanRepError: number;
  withinOneRepPercent: number;
  meanTrueRir: number;
  meanRirGap: number;
}

function metrics(traces: SampleSetTrace[], hardOnly = true): PolicyMetrics {
  const rows = hardOnly ? traces.filter((row) => row.targetRir < AUTOREG.deloadRir) : traces;
  const mean = (pick: (row: SampleSetTrace) => number) => rows.reduce((sum, row) => sum + pick(row), 0) / rows.length;
  return {
    sets: rows.length,
    inRangePercent: Math.round(mean((row) => row.inRange ? 100 : 0)),
    unplannedFailurePercent: Math.round(mean((row) => row.trueRir <= 0 && row.targetRir >= 1 ? 100 : 0)),
    meanRepError: Math.round(mean((row) => Math.abs(row.prescribedReps - row.repsDone)) * 100) / 100,
    withinOneRepPercent: Math.round(mean((row) => Math.abs(row.prescribedReps - row.repsDone) <= 1 ? 100 : 0)),
    meanTrueRir: Math.round(mean((row) => row.trueRir) * 100) / 100,
    meanRirGap: Math.round(mean((row) => Math.abs(row.trueRir - row.targetRir)) * 100) / 100
  };
}

interface TrueState {
  oneRm: Record<string, number>;
  events: MuscleLoadEvent[];
}

function trueCapacity(state: TrueState, exercise: SimExercise, at: Date, dayFactor: number): number {
  const recovery = muscleRecovery(state.events, at, TRUE_TAU).find((item) => item.muscle === exercise.primary)!.recovery;
  return state.oneRm[exercise.id] * dayFactor * (1 - TRUE_RECOVERY_PENALTY * (1 - recovery));
}

function recordTrueLoad(state: TrueState, exercise: SimExercise, at: Date, trueRirs: number[]): void {
  const iso = at.toISOString();
  state.events.push({ at: iso, muscle: exercise.primary, units: trueRirs.reduce((sum, rir) => sum + setFatigueUnits(Math.min(10, rir), "primary"), 0) });
  exercise.secondary.forEach((muscle) => state.events.push({ at: iso, muscle, units: trueRirs.reduce((sum, rir) => sum + setFatigueUnits(Math.min(10, rir), "secondary"), 0) }));
  if (trueRirs.filter((rir) => rir <= 3).length >= 2) state.oneRm[exercise.id] *= 1.004;
}

function sorenessFrom(recovery: number): SorenessScore {
  return recovery >= 0.95 ? 1 : recovery >= 0.85 ? 2 : recovery >= 0.7 ? 3 : 4;
}

export interface WeekSummary {
  week: number;
  deload: boolean;
  targetRir: number;
  muscles: Array<{ muscle: RecoveryMuscle; weeklySets: number; soreness: SorenessScore; performance: number; action: string; setDelta: number; tauHours: number }>;
  exercises: Array<{ exercise: string; firstSet: string; engineFreshE1rmKg?: number; trueOneRmKg: number; fatigueDrop: number }>;
  earlyDeload: boolean;
}

export interface SampleRun {
  engine: PolicyMetrics;
  baseline: PolicyMetrics;
  engineTraces: SampleSetTrace[];
  weeks: WeekSummary[];
  markdown: string;
}

function runEngine(seed: number): { traces: SampleSetTrace[]; weeks: WeekSummary[] } {
  const random = prng(seed);
  const truth: TrueState = { oneRm: Object.fromEntries(EXERCISES.map((exercise) => [exercise.id, exercise.true1rm])), events: [] };
  const history: Record<string, VariantSessionRecord[]> = Object.fromEntries(EXERCISES.map((exercise) => [exercise.id, []]));
  const engineEvents: MuscleLoadEvent[] = [];
  const tau: Partial<Record<RecoveryMuscle, number>> = {};
  // One slot per exercise per training day, so a muscle's weekly set change can land on single days.
  let slots = EXERCISES.flatMap((exercise) => TRAINING_DAYS.map((day) => ({ id: `${exercise.id}@${day}`, sets: 3 })));
  const traces: SampleSetTrace[] = [];
  const weeks: WeekSummary[] = [];
  const recoveryByWeek: RecoveryMuscle[][] = [];
  const lastWeekFresh: Record<string, number> = {};

  for (let week = 1; week <= TOTAL_WEEKS; week += 1) {
    const plan = blockWeek(week, TOTAL_WEEKS);
    const scored: Record<string, ScoredSet[]> = {};
    const worstSoreness: Partial<Record<RecoveryMuscle, SorenessScore>> = {};
    const weeklySets: Partial<Record<RecoveryMuscle, number>> = {};
    const weekFresh: Record<string, number> = {};
    const firstSets: Record<string, string> = {};
    for (const day of TRAINING_DAYS) {
      const at = new Date(START + ((week - 1) * 7 + day) * 86_400_000);
      const bad = week === BAD_DAY.week && day === BAD_DAY.day;
      const dayFactor = (bad ? BAD_DAY.factor : 1) * (0.98 + random() * 0.04);
      const engineRecovery = muscleRecovery(engineEvents, at, tau);
      const trueRecovery = muscleRecovery(truth.events, at, TRUE_TAU);
      for (const exercise of EXERCISES) {
        if (week > 1 || day > 0) {
          const soreness = sorenessFrom(trueRecovery.find((item) => item.muscle === exercise.primary)!.recovery);
          worstSoreness[exercise.primary] = Math.max(worstSoreness[exercise.primary] ?? 1, soreness) as SorenessScore;
        }
        const setCount = Math.max(1, Math.ceil(slots.find((slot) => slot.id === `${exercise.id}@${day}`)!.sets * plan.setFactor));
        const baseline = estimateBaseline(history[exercise.id], at);
        const readiness = readinessFactor({
          primaryMuscleRecovery: [engineRecovery.find((item) => item.muscle === exercise.primary)!.recovery],
          checkIn: bad ? BAD_DAY.checkIn : undefined
        });
        const prior = baseline ? baseline.e1rmKg * readiness.factor : undefined;
        const drop = calibrateFatigueDrop(history[exercise.id]).dropPerSet;
        const target = { minReps: exercise.minReps, maxReps: exercise.maxReps, rir: plan.targetRir };
        const done: ObservedSet[] = [];
        const trueRirs: number[] = [];
        let capacityTrue = trueCapacity(truth, exercise, at, dayFactor);
        let currentLoad = history[exercise.id].at(-1)?.sets[0]?.loadKg;
        for (let index = 0; index < setCount; index += 1) {
          const capacity = nextSetCapacity({ priorE1rmKg: prior, completedSets: done, restSeconds: exercise.restSeconds, fatigueDropPerSet: drop });
          const prescription = capacity
            ? prescribeSet({ capacityE1rmKg: capacity.e1rmKg, target, availableLoadsKg: loadsFor(exercise), currentLoadKg: currentLoad })
            : undefined;
          const loadKg = prescription?.loadKg ?? exercise.startLoadKg;
          const prescribedReps = prescription?.reps ?? exercise.maxReps;
          // The lifter stops when it feels like the target RIR; the feeling is off by one rep a third of the time.
          const roll = random();
          const feelError = roll < 1 / 6 ? -1 : roll > 5 / 6 ? 1 : 0;
          const toFailure = trueRepsToFailure(loadKg, capacityTrue);
          const repsDone = Math.max(0, Math.min(toFailure, toFailure - plan.targetRir - feelError));
          const trueRir = toFailure - repsDone;
          const inRange = repsDone >= exercise.minReps && repsDone <= exercise.maxReps;
          traces.push({ week, day, exercise: exercise.id, set: index + 1, priorE1rmKg: prior, capacityE1rmKg: capacity?.e1rmKg, loadKg, prescribedReps, targetRir: plan.targetRir, repsDone, trueRir, inRange, readiness: readiness.factor });
          if (index === 0 && day === 0) firstSets[exercise.id] = `${fmt(loadKg)} kg × ${prescribedReps}`;
          if (repsDone >= 1) {
            done.push({ loadKg, reps: repsDone, rir: plan.targetRir, restBeforeSeconds: index ? exercise.restSeconds : undefined });
            (scored[exercise.primary] ??= []).push({ targetMinReps: exercise.minReps, targetMaxReps: exercise.maxReps, targetRir: plan.targetRir, loadKg, reps: repsDone, rir: plan.targetRir });
          }
          trueRirs.push(trueRir);
          capacityTrue *= 1 - exercise.trueDrop * trueEffort(trueRir);
          currentLoad = loadKg;
        }
        weeklySets[exercise.primary] = (weeklySets[exercise.primary] ?? 0) + done.length;
        const fresh = nextSetCapacity({ priorE1rmKg: undefined, completedSets: done, fatigueDropPerSet: drop })?.freshE1rmKg;
        if (fresh && weekFresh[exercise.id] === undefined) weekFresh[exercise.id] = fresh;
        history[exercise.id].push({ finishedAt: at.toISOString(), sets: done });
        const iso = at.toISOString();
        engineEvents.push({ at: iso, muscle: exercise.primary, units: done.reduce((sum, set) => sum + setFatigueUnits(set.rir!, "primary"), 0) });
        exercise.secondary.forEach((muscle) => engineEvents.push({ at: iso, muscle, units: done.reduce((sum, set) => sum + setFatigueUnits(set.rir!, "secondary"), 0) }));
        recordTrueLoad(truth, exercise, at, trueRirs);
      }
    }
    const summary: WeekSummary = { week, deload: plan.deload, targetRir: plan.targetRir, muscles: [], exercises: [], earlyDeload: false };
    const recoveryMuscles: RecoveryMuscle[] = [];
    for (const exercise of EXERCISES) {
      const muscle = exercise.primary;
      const soreness = worstSoreness[muscle] ?? 1;
      const change = lastWeekFresh[exercise.id] && weekFresh[exercise.id] ? weekFresh[exercise.id] / lastWeekFresh[exercise.id] - 1 : undefined;
      const performance = performanceScore(scored[muscle], change);
      tau[muscle] = calibrateTau(tau[muscle] ?? DEFAULT_TAU_HOURS[muscle], soreness);
      let action = "deload";
      let setDelta = 0;
      if (!plan.deload) {
        const decision = volumeDecision({ soreness, performance, weeklySets: weeklySets[muscle] ?? 0 });
        action = decision.action;
        setDelta = decision.setDelta;
        if (decision.action === "recovery_session") recoveryMuscles.push(muscle);
        const mine = slots.filter((slot) => slot.id.startsWith(`${exercise.id}@`));
        const changed = distributeSetDelta(mine, setDelta);
        slots = slots.map((slot) => changed.find((item) => item.id === slot.id) ?? slot);
      }
      summary.muscles.push({ muscle, weeklySets: weeklySets[muscle] ?? 0, soreness, performance, action, setDelta, tauHours: tau[muscle]! });
      summary.exercises.push({ exercise: exercise.id, firstSet: firstSets[exercise.id], engineFreshE1rmKg: weekFresh[exercise.id], trueOneRmKg: Math.round(truth.oneRm[exercise.id] * 10) / 10, fatigueDrop: calibrateFatigueDrop(history[exercise.id]).dropPerSet });
      if (weekFresh[exercise.id]) lastWeekFresh[exercise.id] = weekFresh[exercise.id];
    }
    recoveryByWeek.push(recoveryMuscles);
    summary.earlyDeload = !plan.deload && needsEarlyDeload(recoveryByWeek);
    weeks.push(summary);
  }
  return { traces, weeks };
}

/** The app's current rule, simplified: one load for every set, up one step after two sessions with all sets at the top. */
function runBaseline(seed: number): SampleSetTrace[] {
  const random = prng(seed);
  const truth: TrueState = { oneRm: Object.fromEntries(EXERCISES.map((exercise) => [exercise.id, exercise.true1rm])), events: [] };
  const load: Record<string, number> = Object.fromEntries(EXERCISES.map((exercise) => [exercise.id, exercise.startLoadKg]));
  const streak: Record<string, number> = {};
  const misses: Record<string, number> = {};
  const traces: SampleSetTrace[] = [];
  for (let week = 1; week < TOTAL_WEEKS; week += 1) {
    for (const day of TRAINING_DAYS) {
      const at = new Date(START + ((week - 1) * 7 + day) * 86_400_000);
      const bad = week === BAD_DAY.week && day === BAD_DAY.day;
      const dayFactor = (bad ? BAD_DAY.factor : 1) * (0.98 + random() * 0.04);
      for (const exercise of EXERCISES) {
        let capacityTrue = trueCapacity(truth, exercise, at, dayFactor);
        const trueRirs: number[] = [];
        let allTop = true;
        let missed = false;
        for (let index = 0; index < 3; index += 1) {
          random();
          const toFailure = trueRepsToFailure(load[exercise.id], capacityTrue);
          // Stops at the top of the range, and one rep short of failure when that still makes the minimum.
          const repsDone = Math.min(exercise.maxReps, toFailure - 1 >= exercise.minReps ? toFailure - 1 : toFailure);
          const trueRir = toFailure - repsDone;
          const inRange = repsDone >= exercise.minReps;
          traces.push({ week, day, exercise: exercise.id, set: index + 1, loadKg: load[exercise.id], prescribedReps: exercise.maxReps, targetRir: 1, repsDone, trueRir, inRange });
          allTop &&= repsDone >= exercise.maxReps;
          missed ||= !inRange;
          trueRirs.push(trueRir);
          capacityTrue *= 1 - exercise.trueDrop * trueEffort(trueRir);
        }
        recordTrueLoad(truth, exercise, at, trueRirs);
        streak[exercise.id] = allTop ? (streak[exercise.id] ?? 0) + 1 : 0;
        misses[exercise.id] = missed ? (misses[exercise.id] ?? 0) + 1 : 0;
        if (streak[exercise.id] >= 2) { load[exercise.id] += exercise.stepKg; streak[exercise.id] = 0; }
        else if (misses[exercise.id] >= 2) { load[exercise.id] = Math.round(load[exercise.id] * 0.9 / exercise.stepKg) * exercise.stepKg; misses[exercise.id] = 0; }
      }
    }
  }
  return traces;
}

/** Alpha Progression's published worked examples, run through this engine for comparison. */
export function alphaProgressionVectors(): Array<{ example: string; published: string; ours: string; match: boolean }> {
  const at = new Date("2026-11-10T10:00:00Z");
  const last = (sets: Array<[number, number]>): VariantSessionRecord[] => [{ finishedAt: "2026-11-07T10:00:00Z", sets: sets.map(([loadKg, reps]) => ({ loadKg, reps })) }];
  const show = (loadKg: number, reps: number) => `${fmt(loadKg)} × ${reps}`;
  const next = (history: VariantSessionRecord[] | undefined, done: ObservedSet[], target: { minReps: number; maxReps: number; rir: number }, loads: number[], currentLoadKg: number) => {
    const prior = history ? estimateBaseline(history, at)?.e1rmKg : undefined;
    const capacity = nextSetCapacity({ priorE1rmKg: prior, completedSets: done })!;
    const result = prescribeSet({ capacityE1rmKg: capacity.e1rmKg, target, availableLoadsKg: loads, currentLoadKg });
    return show(result.loadKg, result.reps);
  };
  const exactly = (reps: number, rir = 0) => ({ minReps: reps, maxReps: reps, rir });
  const shoulder = last([[20, 10], [20, 8], [20, 4]]);
  const rows = [
    { example: "2: DB shoulder press, target 12, weights 18/20; last 20×10, 20×8, 20×4; today's set 1", published: "18 × 14", ours: next(shoulder, [], exactly(12), [18, 20], 20) },
    { example: "3a: same; set 1 done 20×12; set 2", published: "20 × 10", ours: next(shoulder, [{ loadKg: 20, reps: 12 }], exactly(12), [18, 20], 20) },
    { example: "3b: same; set 1 done 18×10; set 2", published: "18 × 10", ours: next(shoulder, [{ loadKg: 18, reps: 10 }], exactly(12), [18, 20], 18) },
    { example: "4: sumo deadlift, target 6 @ 2 RIR; set 1 done 90×7 @ 0 RIR; set 2 (2.5 kg steps assumed)", published: "90 × 5", ours: next(undefined, [{ loadKg: 90, reps: 7, rir: 0 }], exactly(6, 2), [80, 82.5, 85, 87.5, 90, 92.5], 90) },
    { example: "5: barbell bench, target 10; last 80×10 ×3; set 1 done 85×10; set 2 (2.5 kg steps assumed)", published: "85 × 9", ours: next(last([[80, 10], [80, 10], [80, 10]]), [{ loadKg: 85, reps: 10 }], exactly(10), [80, 82.5, 85, 87.5], 85) }
  ];
  return rows.map((row) => ({ ...row, match: row.published === row.ours }));
}

export function runAutoregulationSample(seed = 20261122): SampleRun {
  const { traces, weeks } = runEngine(seed);
  const baselineTraces = runBaseline(seed);
  const engine = metrics(traces);
  const baseline = metrics(baselineTraces);
  const lines: string[] = [];
  const table = (head: string[], rows: Array<Array<string | number>>) => {
    lines.push(`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), "");
  };
  lines.push("# Autoregulation engine: sample run", "",
    "Generated by `pnpm autoregulation:sample` from `packages/workouts/src/autoregulation-sample.ts` (seed " + seed + "). Do not edit by hand.", "",
    "A simulated lifter trains 3 days a week for 5 weeks (4 hard weeks, then a deload). The lifter's real strength, fatigue and recovery are hidden from the engine and follow different formulas on purpose: a Brzycki rep curve (the engine assumes Epley), chest recovery of 40 h (engine default 30 h), a 12% strength loss when fully fatigued (engine assumes 10%), a different set-to-set drop per exercise (engine starts at 3% for all), ±2% day-to-day noise, and a feel for RIR that is one rep off a third of the time. This shows the engine's inputs and outputs and that it stays coherent when its assumptions are wrong. It is not evidence about muscle growth in a real person.", "");
  lines.push("## Hidden lifter", "");
  table(["Exercise", "Primary muscle", "True 1RM (kg)", "True drop per set", "Rep range", "Load step (kg)", "Week-1 load (kg)"],
    EXERCISES.map((exercise) => [exercise.id, exercise.primary, exercise.true1rm, `${fmt(exercise.trueDrop * 100)}%`, `${exercise.minReps}-${exercise.maxReps}`, exercise.stepKg, exercise.startLoadKg]));
  lines.push("## How close the prescriptions were", "",
    "Hard weeks only (weeks 1-4), " + engine.sets + " working sets. The lifter's own feel for RIR is off by one rep on a third of the sets, so a gap of about 0.33 reps is unavoidable.", "");
  table(["Measure", "Result"], [
    ["Sets where the reps done were within 1 of the reps prescribed", `${engine.withinOneRepPercent}%`],
    ["Mean gap between prescribed reps and reps done", engine.meanRepError],
    ["Mean gap between the planned RIR and the real RIR", engine.meanRirGap],
    ["Sets with reps inside the rep range", `${engine.inRangePercent}%`],
    ["Sets that ended at failure without being planned to", `${engine.unplannedFailurePercent}%`]
  ]);
  lines.push("## Next to the app's current rule", "",
    "The current rule is simplified: three sets at one load aiming for the top of the range, one step up after two sessions with every set at the top, 10% down after two sessions under the minimum. Under it the simulated lifter stops at the top of the range, or one rep before failure when that still reaches the minimum; that behaviour is an assumption of this run. With sensible starting loads and that lifter, the current rule also keeps every set in range, so this run does not show the engine hitting rep ranges better. What differs is what gets planned: effort follows a plan (RIR 4 down to 1, then a deload) instead of sitting near 1 RIR every week, and weekly sets move with soreness and performance instead of staying fixed.", "");
  table(["Measure", "Autoregulation engine", "Current rule"], [
    ["Working sets in 4 weeks", engine.sets, baseline.sets],
    ["Sets with reps inside the rep range", `${engine.inRangePercent}%`, `${baseline.inRangePercent}%`],
    ["Sets that ended at failure", `${engine.unplannedFailurePercent}%`, `${baseline.unplannedFailurePercent}%`],
    ["Mean real RIR per set", engine.meanTrueRir, baseline.meanTrueRir]
  ]);
  lines.push("## Week by week", "");
  for (const week of weeks) {
    lines.push(`### Week ${week.week}${week.deload ? " (deload)" : ""}: target RIR ${week.targetRir}${week.earlyDeload ? " — early deload flagged" : ""}`, "");
    table(["Exercise", "Monday set 1", "Engine fresh e1RM (kg)", "True 1RM after week (kg)", "Learned drop per set"],
      week.exercises.map((row) => [row.exercise, row.firstSet, row.engineFreshE1rmKg ?? "-", row.trueOneRmKg, `${fmt(row.fatigueDrop * 100)}%`]));
    table(["Muscle", "Sets this week", "Soreness (1-4)", "Performance (1-4)", "Decision", "Set change next week", "Recovery constant (h)"],
      week.muscles.map((row) => [row.muscle, row.weeklySets, row.soreness, row.performance, row.action, row.setDelta > 0 ? `+${row.setDelta}` : row.setDelta, row.tauHours]));
  }
  lines.push("## One session set by set: the bad night (week 3, Wednesday)", "",
    "Check-in sleep 1, energy 2, soreness 3. Real strength that day is about 6% down. `Prior` is baseline × readiness; `Capacity` is what the engine expects for that set after the sets already done.", "");
  table(["Exercise", "Set", "Readiness", "Prior e1RM", "Capacity e1RM", "Prescribed", "Done", "Real RIR"],
    traces.filter((row) => row.week === BAD_DAY.week && row.day === BAD_DAY.day).map((row) => [row.exercise, row.set, fmt(row.readiness ?? 1, 3), row.priorE1rmKg ? fmt(row.priorE1rmKg) : "-", row.capacityE1rmKg ? fmt(row.capacityE1rmKg) : "-", `${fmt(row.loadKg)} × ${row.prescribedReps} @ ${row.targetRir} RIR`, `${fmt(row.loadKg)} × ${row.repsDone}`, row.trueRir]));
  lines.push("## Alpha Progression's published examples through this engine", "",
    "Alpha Progression does not publish its formula, so these are a comparison, not a target. Each rep target is passed as a one-value range, and a set with no RIR logged is read as taken to failure. Its example 1 (several sessions) is not replayed.", "");
  table(["Published example", "Alpha Progression", "This engine", "Same"], alphaProgressionVectors().map((row) => [row.example, row.published, row.ours, row.match ? "yes" : "no"]));
  lines.push("Where they differ, Alpha Progression holds the weight and lets reps fall below a one-value target, while this engine changes the weight to land on the target. Gym Local routines use rep ranges (for example 8-12), where this engine also holds the weight until reps leave the range.", "");
  return { engine, baseline, engineTraces: traces, weeks, markdown: lines.join("\n") };
}
