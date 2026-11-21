import type { LocalizedText, MuscleGroup } from "@gym/contracts";

/**
 * Autoregulation engine (ADR 0024). Pure functions over plain data: no catalog,
 * storage or clock access, so every output is reproducible from its inputs.
 * Units: kg, whole reps, seconds, hours. RIR 0-10 in 0.5 steps.
 */

export const AUTOREG = {
  /** Epley constant: e1RM = load × (1 + reps / 30). */
  epleyReps: 30,
  /** Sets whose reps + RIR exceed this are too far from 1RM to estimate from. */
  maxEstimableReps: 20,
  /** Sessions blended into the baseline, newest first, each weighted half the one before. */
  baselineSessions: 5,
  /** Days without the exact variant before the baseline is discounted. */
  detrainAfterDays: 7,
  detrainPerDay: 0.005,
  detrainFloor: 0.8,
  /** Fraction of capacity lost per working set at RIR 2 with 120 s rest. */
  fatigueDropPerSet: 0.03,
  fatigueDropBounds: [0.01, 0.08] as const,
  /** Weight of each of today's sets against the pre-session estimate (weight 1). */
  observationWeight: 3,
  /** Capacity lost when a primary muscle is fully fatigued. */
  recoveryPenalty: 0.1,
  checkInPerPoint: 0.015,
  warmupBetter: 0.013,
  warmupWorse: -0.026,
  readinessBounds: [0.85, 1.05] as const,
  /** Fatigue units (effective sets) at which a muscle reads 0% recovered. */
  fatigueCapacity: 10,
  readyAt: 0.85,
  secondaryMuscleWeight: 0.5,
  tauBounds: [12, 60] as const,
  weeklySetBounds: { min: 6, max: 20 } as const,
  setsPerExercise: { min: 2, max: 6 } as const,
  switchLoadPenalty: 0.5,
  /** Week-over-week fall in mean fresh e1RM that counts as "could not match last week"; one rep of RIR error is about 2.5%. */
  e1rmDropForRecovery: 0.05,
  deloadRir: 5
} as const;

/** Default recovery time constants in hours (ours, calibrated per person from soreness). */
export const DEFAULT_TAU_HOURS: Record<Exclude<MuscleGroup, "full_body">, number> = {
  chest: 30, back: 30, quadriceps: 30, hamstrings: 30, glutes: 30,
  shoulders: 20, biceps: 20, triceps: 20, calves: 20, core: 20, forearms: 20
};

export type RirSource = "logged" | "rpe" | "target" | "assumed";
export type Confidence = "low" | "medium" | "high";

export interface ObservedSet {
  loadKg: number;
  reps: number;
  rir?: number;
  rpe?: number;
  targetRir?: number;
  restBeforeSeconds?: number;
  workSeconds?: number;
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RangeError(`autoregulation: ${message}`);
}
const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, [low, high]: readonly [number, number]) => Math.min(high, Math.max(low, value));

function checkSet(set: ObservedSet): void {
  check(Number.isFinite(set.loadKg) && set.loadKg > 0, "loadKg must be > 0");
  check(Number.isInteger(set.reps) && set.reps >= 0, "reps must be a whole number >= 0");
  if (set.rir !== undefined) check(set.rir >= 0 && set.rir <= 10 && Number.isInteger(set.rir * 2), "rir must be 0-10 in 0.5 steps");
  if (set.rpe !== undefined) check(set.rpe >= 1 && set.rpe <= 10 && Number.isInteger(set.rpe * 2), "rpe must be 1-10 in 0.5 steps");
  if (set.targetRir !== undefined) check(set.targetRir >= 0 && set.targetRir <= 10, "targetRir must be 0-10");
  if (set.restBeforeSeconds !== undefined) check(set.restBeforeSeconds >= 0 && Number.isFinite(set.restBeforeSeconds), "restBeforeSeconds must be >= 0");
  if (set.workSeconds !== undefined) check(set.workSeconds >= 0 && Number.isFinite(set.workSeconds), "workSeconds must be >= 0");
}

/** RIR used for a set: logged RIR, else 10 − RPE, else the set's target, else 0 (conservative). */
export function effectiveRir(set: ObservedSet): { rir: number; source: RirSource } {
  if (set.rir !== undefined) return { rir: set.rir, source: "logged" };
  if (set.rpe !== undefined) return { rir: 10 - set.rpe, source: "rpe" };
  if (set.targetRir !== undefined) return { rir: set.targetRir, source: "target" };
  return { rir: 0, source: "assumed" };
}

/** Epley e1RM with reps in reserve added to the reps done. Undefined when not estimable. */
export function e1rmFromSet(set: ObservedSet): number | undefined {
  checkSet(set);
  const total = set.reps + effectiveRir(set).rir;
  if (set.reps < 1 || total > AUTOREG.maxEstimableReps) return undefined;
  return set.loadKg * (1 + total / AUTOREG.epleyReps);
}

/** Reps to failure at a load for a given capacity (inverse Epley), never negative. */
export function repsToFailure(loadKg: number, e1rmKg: number): number {
  check(loadKg > 0 && Number.isFinite(loadKg) && e1rmKg > 0 && Number.isFinite(e1rmKg), "loadKg and e1rmKg must be > 0");
  return Math.max(0, AUTOREG.epleyReps * (e1rmKg / loadKg - 1));
}

// ---------- Baseline capacity per exact variant ----------

export interface VariantSessionRecord {
  finishedAt: string;
  /** Completed working sets of one exact variant, in the order performed. */
  sets: ObservedSet[];
}

export interface BaselineEstimate {
  e1rmKg: number;
  sessionsUsed: number;
  daysSinceLast: number;
  detrainFactor: number;
  confidence: Confidence;
}

/**
 * Recency-weighted e1RM from the best estimable set of each of the last sessions,
 * discounted after a week without the variant.
 */
export function estimateBaseline(history: VariantSessionRecord[], now: Date): BaselineEstimate | undefined {
  const sessions = history
    .map((record) => {
      const estimates = record.sets.map(e1rmFromSet).filter((value): value is number => value !== undefined);
      const measured = record.sets.some((set) => { const source = effectiveRir(set).source; return source === "logged" || source === "rpe"; });
      return { at: new Date(record.finishedAt).getTime(), best: estimates.length ? Math.max(...estimates) : undefined, measured };
    })
    .filter((item): item is { at: number; best: number; measured: boolean } => item.best !== undefined && item.at <= now.getTime())
    .sort((left, right) => right.at - left.at)
    .slice(0, AUTOREG.baselineSessions);
  if (!sessions.length) return undefined;
  // Time off counts from the last session that trained the variant at all, estimable or not.
  const lastTrained = Math.max(sessions[0].at, ...history.filter((record) => record.sets.length).map((record) => new Date(record.finishedAt).getTime()).filter((time) => time <= now.getTime()));
  let weight = 1;
  let total = 0;
  let weights = 0;
  for (const session of sessions) {
    total += session.best * weight;
    weights += weight;
    weight /= 2;
  }
  const daysSinceLast = Math.floor((now.getTime() - lastTrained) / 86_400_000);
  const detrainFactor = Math.max(AUTOREG.detrainFloor, 1 - AUTOREG.detrainPerDay * Math.max(0, daysSinceLast - AUTOREG.detrainAfterDays));
  const measured = sessions.filter((session) => session.measured).length;
  const confidence: Confidence = sessions.length >= 3 && measured >= 2 && daysSinceLast <= 14 ? "high" : sessions.length >= 2 ? "medium" : "low";
  return { e1rmKg: round1((total / weights) * detrainFactor), sessionsUsed: sessions.length, daysSinceLast, detrainFactor, confidence };
}

function effortMultiplier(set: ObservedSet): number {
  const { rir, source } = effectiveRir(set);
  if (source === "assumed" || source === "target") return 1;
  return rir <= 0 ? 1.5 : rir <= 1 ? 1.2 : rir <= 2 ? 1 : rir <= 3 ? 0.8 : 0.6;
}

function restMultiplier(restSeconds: number | undefined): number {
  return restSeconds === undefined ? 1 : clamp(1 + (120 - restSeconds) / 120, [0.75, 1.75]);
}

/** Personal set-to-set capacity drop at 2 RIR and 120 s rest: median over consecutive measured sets; default until 6 pairs exist. */
export function calibrateFatigueDrop(history: VariantSessionRecord[]): { dropPerSet: number; pairs: number } {
  const drops: number[] = [];
  for (const record of history) {
    for (let index = 1; index < record.sets.length; index += 1) {
      const [previous, current] = [record.sets[index - 1], record.sets[index]];
      if (effectiveRir(previous).source !== "logged" || effectiveRir(current).source !== "logged") continue;
      const [before, after] = [e1rmFromSet(previous), e1rmFromSet(current)];
      // Undo the effort and rest multipliers that nextSetCapacity applies on top of the drop.
      if (before && after) drops.push((1 - after / before) / (effortMultiplier(previous) * restMultiplier(current.restBeforeSeconds)));
    }
  }
  if (drops.length < 6) return { dropPerSet: AUTOREG.fatigueDropPerSet, pairs: drops.length };
  drops.sort((left, right) => left - right);
  const middle = drops.length / 2;
  const median = drops.length % 2 ? drops[Math.floor(middle)] : (drops[middle - 1] + drops[middle]) / 2;
  return { dropPerSet: clamp(median, AUTOREG.fatigueDropBounds), pairs: drops.length };
}

// ---------- Readiness (before the session and during warm-up) ----------

export type WarmupFeel = "worse" | "expected" | "better";

export interface ReadinessInput {
  /** Recovery 0-1 of the exercise's primary muscles. */
  primaryMuscleRecovery: number[];
  /** Optional 1-5 answers; 3 is normal. Soreness 5 = none. */
  checkIn?: { sleep: number; energy: number; soreness: number };
  warmupFeel?: WarmupFeel;
}

export interface ReadinessResult {
  factor: number;
  parts: { recovery: number; checkIn: number; warmup: number };
}

export function readinessFactor(input: ReadinessInput): ReadinessResult {
  input.primaryMuscleRecovery.forEach((value) => check(value >= 0 && value <= 1, "recovery must be 0-1"));
  const lowest = input.primaryMuscleRecovery.length ? Math.min(...input.primaryMuscleRecovery) : 1;
  const recovery = -AUTOREG.recoveryPenalty * (1 - lowest);
  let checkIn = 0;
  if (input.checkIn) {
    const answers = [input.checkIn.sleep, input.checkIn.energy, input.checkIn.soreness];
    answers.forEach((value) => check(Number.isInteger(value) && value >= 1 && value <= 5, "check-in answers must be 1-5"));
    checkIn = (answers.reduce((sum, value) => sum + value, 0) / 3 - 3) * AUTOREG.checkInPerPoint;
  }
  const warmup = input.warmupFeel === "better" ? AUTOREG.warmupBetter : input.warmupFeel === "worse" ? AUTOREG.warmupWorse : 0;
  return { factor: clamp(1 + recovery + checkIn + warmup, AUTOREG.readinessBounds), parts: { recovery, checkIn, warmup } };
}

// ---------- Capacity for the next set (during the session) ----------

export interface NextSetCapacityInput {
  /** Pre-session estimate: baseline × readiness. Omit for a variant with no history. */
  priorE1rmKg?: number;
  /** Today's completed working sets of this variant, in order. */
  completedSets: ObservedSet[];
  /** Rest before the set being planned: actual if known, else the planned rest. */
  restSeconds?: number;
  fatigueDropPerSet?: number;
}

export interface NextSetCapacity {
  /** What the lifter could do today when fresh. */
  freshE1rmKg: number;
  /** What is left for the next set after today's fatigue. */
  e1rmKg: number;
  retained: number;
}

/**
 * Re-estimates today's fresh capacity from the sets done so far (each undone of the
 * fatigue before it) and applies the fatigue of all completed sets to the next one.
 */
export function nextSetCapacity(input: NextSetCapacityInput): NextSetCapacity | undefined {
  const drop = input.fatigueDropPerSet ?? AUTOREG.fatigueDropPerSet;
  check(drop >= 0 && drop < 0.5, "fatigueDropPerSet must be 0-0.5");
  if (input.priorE1rmKg !== undefined) check(input.priorE1rmKg > 0 && Number.isFinite(input.priorE1rmKg), "priorE1rmKg must be > 0");
  if (input.restSeconds !== undefined) check(input.restSeconds >= 0 && Number.isFinite(input.restSeconds), "restSeconds must be >= 0");
  let retained = 1;
  let total = input.priorE1rmKg ?? 0;
  let weights = input.priorE1rmKg ? 1 : 0;
  input.completedSets.forEach((set, index) => {
    const observed = e1rmFromSet(set);
    if (observed !== undefined) {
      total += (observed / retained) * AUTOREG.observationWeight;
      weights += AUTOREG.observationWeight;
    }
    const nextRest = index === input.completedSets.length - 1 ? input.restSeconds : input.completedSets[index + 1].restBeforeSeconds;
    retained *= 1 - drop * effortMultiplier(set) * restMultiplier(nextRest);
  });
  if (!weights) return undefined;
  const freshE1rmKg = total / weights;
  return { freshE1rmKg: round1(freshE1rmKg), e1rmKg: round1(freshE1rmKg * retained), retained };
}

// ---------- Load and rep prescription ----------

export interface SetTarget {
  minReps: number;
  maxReps: number;
  rir: number;
}

export interface PrescribeSetInput {
  capacityE1rmKg: number;
  target: SetTarget;
  /** Loads the equipment allows, in kg. */
  availableLoadsKg: number[];
  /** Load of the previous set (or last session's first set); changing it costs a little. */
  currentLoadKg?: number;
}

export type PrescriptionAction = "keep_load" | "raise_load" | "lower_load" | "start";

export interface SetPrescription {
  loadKg: number;
  reps: number;
  targetRir: number;
  /** Reps to failure the model expects at this load, one decimal. */
  expectedRepsToFailure: number;
  /** RIR the model expects if exactly `reps` are done. */
  expectedRir: number;
  action: PrescriptionAction;
  inRange: boolean;
  /** False when no available load allows one rep at the target RIR: the load shown is only the lightest, not a recommendation. */
  feasible: boolean;
  reason: LocalizedText;
}

/** Picks the available load whose reps at the target RIR sit inside the rep range, preferring the current load. */
export function prescribeSet(input: PrescribeSetInput): SetPrescription {
  const { target } = input;
  check(input.capacityE1rmKg > 0 && Number.isFinite(input.capacityE1rmKg), "capacityE1rmKg must be > 0");
  check(Number.isInteger(target.minReps) && Number.isInteger(target.maxReps) && target.minReps >= 1 && target.maxReps >= target.minReps, "rep range must be whole numbers with 1 <= min <= max");
  check(target.rir >= 0 && target.rir <= 10, "target rir must be 0-10");
  const loads = [...new Set(input.availableLoadsKg)].filter((load) => load > 0 && Number.isFinite(load)).sort((left, right) => left - right);
  check(loads.length > 0, "availableLoadsKg must contain a positive load");
  const middle = (target.minReps + target.maxReps) / 2;
  let best: { load: number; reps: number; cost: number; toFailure: number } | undefined;
  for (const load of loads) {
    const toFailure = repsToFailure(load, input.capacityE1rmKg);
    // Unclamped so that, among loads too heavy for a single rep, the lightest is the least bad.
    const reps = Math.floor(AUTOREG.epleyReps * (input.capacityE1rmKg / load - 1) - target.rir + 1e-9);
    const outside = reps < target.minReps ? target.minReps - reps : reps > target.maxReps ? reps - target.maxReps : 0;
    const cost = outside * outside
      + (input.currentLoadKg === undefined ? Math.abs(reps - middle) * 0.01 : load === input.currentLoadKg ? 0 : AUTOREG.switchLoadPenalty);
    // A load that allows at least one rep always beats one that allows none, however far it is from the range.
    if (best && best.reps >= 1 && reps < 1) continue;
    if (!best || (best.reps < 1 && reps >= 1) || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && load > best.load)) best = { load, reps, cost, toFailure };
  }
  const feasible = best!.reps >= 1;
  const reps = Math.min(target.maxReps, Math.max(1, best!.reps));
  const action: PrescriptionAction = input.currentLoadKg === undefined ? "start"
    : best!.load > input.currentLoadKg ? "raise_load" : best!.load < input.currentLoadKg ? "lower_load" : "keep_load";
  const text: Record<PrescriptionAction, LocalizedText> = {
    start: { vi: "Mức khởi điểm theo sức ước tính hôm nay.", en: "Starting point from today's estimated strength." },
    keep_load: { vi: "Giữ mức tạ, số lần theo sức còn lại.", en: "Same load, reps from what is left in the tank." },
    raise_load: { vi: "Vượt đầu trên khoảng lần: tăng tạ.", en: "Above the top of the rep range: load goes up." },
    lower_load: { vi: "Dưới đầu dưới khoảng lần: giảm tạ để tập đủ số lần.", en: "Below the rep range: load comes down so the reps fit." }
  };
  return {
    loadKg: best!.load,
    reps,
    targetRir: target.rir,
    expectedRepsToFailure: round1(best!.toFailure),
    expectedRir: round1(Math.max(0, best!.toFailure - reps)),
    action,
    inRange: best!.reps >= target.minReps && best!.reps <= target.maxReps,
    feasible,
    reason: feasible ? text[action] : { vi: "Không có mức tạ nào đủ nhẹ cho sức ước tính hôm nay.", en: "No available load is light enough for today's estimated strength." }
  };
}

// ---------- Muscle recovery ----------

export type RecoveryMuscle = Exclude<MuscleGroup, "full_body">;

export interface MuscleLoadEvent {
  at: string;
  muscle: RecoveryMuscle;
  /** Sum of `setFatigueUnits` for the sets that hit this muscle. */
  units: number;
}

/** Fatigue one working set gives a muscle: harder sets cost more, secondary muscles half. */
export function setFatigueUnits(rir: number, role: "primary" | "secondary"): number {
  check(rir >= 0 && rir <= 10, "rir must be 0-10");
  const effort = rir <= 0 ? 1.25 : rir <= 1 ? 1.1 : rir <= 2 ? 1 : rir <= 3 ? 0.85 : 0.7;
  return effort * (role === "primary" ? 1 : AUTOREG.secondaryMuscleWeight);
}

export interface MuscleRecoveryEstimate {
  muscle: RecoveryMuscle;
  fatigueUnits: number;
  /** 0-1; 1 is fully recovered. */
  recovery: number;
  hoursUntilReady: number;
}

/** Fatigue decays exponentially with the muscle's time constant; recovery = 1 − fatigue / capacity. */
export function muscleRecovery(
  events: MuscleLoadEvent[],
  now: Date,
  tauHours: Partial<Record<RecoveryMuscle, number>> = {}
): MuscleRecoveryEstimate[] {
  return (Object.keys(DEFAULT_TAU_HOURS) as RecoveryMuscle[]).map((muscle) => {
    const tau = tauHours[muscle] ?? DEFAULT_TAU_HOURS[muscle];
    check(tau > 0 && Number.isFinite(tau), "tauHours must be > 0");
    const fatigue = events.reduce((sum, event) => {
      check(event.units >= 0 && Number.isFinite(event.units), "units must be >= 0");
      const hours = (now.getTime() - new Date(event.at).getTime()) / 3_600_000;
      return event.muscle === muscle && hours >= 0 ? sum + event.units * Math.exp(-hours / tau) : sum;
    }, 0);
    const readyUnits = (1 - AUTOREG.readyAt) * AUTOREG.fatigueCapacity;
    return {
      muscle,
      fatigueUnits: Math.round(fatigue * 100) / 100,
      recovery: Math.round(clamp(1 - fatigue / AUTOREG.fatigueCapacity, [0, 1]) * 100) / 100,
      hoursUntilReady: fatigue > readyUnits ? Math.ceil(tau * Math.log(fatigue / readyUnits)) : 0
    };
  });
}

/** Soreness on RP's published 1-4 scale. */
export type SorenessScore = 1 | 2 | 3 | 4;

/** Still sore at the next session lengthens the muscle's time constant by 10%; never sore shortens it by 5%. */
export function calibrateTau(tauHours: number, soreness: SorenessScore): number {
  check(tauHours > 0 && Number.isFinite(tauHours), "tauHours must be > 0");
  const factor = soreness === 4 ? 1.1 : soreness === 1 ? 0.95 : 1;
  return round1(clamp(tauHours * factor, AUTOREG.tauBounds));
}

// ---------- Volume ----------

/** Performance on RP's published 1-4 scale, computed from the log instead of asked. */
export type PerformanceScore = 1 | 2 | 3 | 4;

export interface ScoredSet {
  targetMinReps: number;
  targetMaxReps: number;
  targetRir: number;
  loadKg: number;
  reps: number;
  rir?: number;
}

/**
 * 1 exceeded targets easily, 2 hit targets, 3 struggled, 4 could not match last week.
 * `freshE1rmChange` is this week's mean fresh e1RM over last week's, minus 1.
 */
export function performanceScore(sets: ScoredSet[], freshE1rmChange?: number): PerformanceScore {
  check(sets.length > 0, "performanceScore needs at least one set");
  if (freshE1rmChange !== undefined) check(Number.isFinite(freshE1rmChange), "freshE1rmChange must be a number");
  if (freshE1rmChange !== undefined && freshE1rmChange <= -AUTOREG.e1rmDropForRecovery) return 4;
  const missed = sets.filter((set) => set.reps < set.targetMinReps).length;
  if (missed * 2 > sets.length) return 4;
  const margin = sets.reduce((sum, set) => sum + ((set.rir ?? set.targetRir) - set.targetRir) + Math.max(0, set.reps - set.targetMaxReps), 0) / sets.length;
  if (missed > 0 || margin <= -1) return 3;
  return margin >= 1 ? 1 : 2;
}

export type VolumeAction = "add" | "hold" | "remove" | "recovery_session";

export interface VolumeDecisionInput {
  soreness: SorenessScore;
  performance: PerformanceScore;
  /** Working sets for the muscle this week (primary-mover sets). */
  weeklySets: number;
  bounds?: { min: number; max: number };
}

export interface VolumeDecision {
  action: VolumeAction;
  /** Change to next week's working sets for the muscle. */
  setDelta: number;
  reason: LocalizedText;
}

/** RP's published set-progression table, with the cases it leaves open filled conservatively. */
export function volumeDecision(input: VolumeDecisionInput): VolumeDecision {
  const bounds = input.bounds ?? AUTOREG.weeklySetBounds;
  check(Number.isInteger(input.weeklySets) && input.weeklySets >= 0, "weeklySets must be a whole number >= 0");
  check(bounds.min >= 0 && bounds.max >= bounds.min, "bounds must satisfy 0 <= min <= max");
  const { soreness, performance } = input;
  let action: VolumeAction;
  let wanted: number;
  if (performance === 4) [action, wanted] = ["recovery_session", -Math.ceil(input.weeklySets / 2)];
  else if (soreness === 4) [action, wanted] = ["remove", -1];
  else if (soreness === 3 || performance === 3) [action, wanted] = ["hold", 0];
  else if (soreness === 1 && performance === 1) [action, wanted] = ["add", 2];
  else [action, wanted] = ["add", 1];
  // Only "add" may raise sets; a muscle already outside the bounds is never pushed up by hold or remove.
  let setDelta = wanted;
  if (action === "add") setDelta = Math.max(0, Math.min(Math.max(input.weeklySets + wanted, bounds.min), bounds.max) - input.weeklySets);
  else if (action === "remove") setDelta = Math.min(0, Math.max(input.weeklySets + wanted, bounds.min) - input.weeklySets);
  if (setDelta === 0 && (action === "add" || action === "remove")) action = "hold";
  const reasons: Record<VolumeAction, LocalizedText> = {
    add: { vi: `Hồi phục tốt và đạt mục tiêu: thêm ${setDelta} set tuần tới.`, en: `Recovering well and hitting targets: ${setDelta} more set${setDelta === 1 ? "" : "s"} next week.` },
    hold: { vi: "Giữ nguyên số set: đang ở sát giới hạn hồi phục hoặc giới hạn tuần.", en: "Sets unchanged: at the edge of recovery or the weekly limit." },
    remove: { vi: "Vẫn còn đau khi tập lại: bớt 1 set tuần tới.", en: "Still sore when trained again: one set fewer next week." },
    recovery_session: { vi: "Không giữ được mức tuần trước: buổi tới giảm nửa số set để hồi phục.", en: "Could not match last week: half the sets next time to recover." }
  };
  return { action, setDelta, reason: reasons[action] };
}

export interface ExerciseVolume {
  id: string;
  sets: number;
}

/** Spreads a muscle's set change over its exercises: add to the one with fewest sets, remove from the one with most. */
export function distributeSetDelta(exercises: ExerciseVolume[], setDelta: number): ExerciseVolume[] {
  check(Number.isInteger(setDelta), "setDelta must be a whole number");
  const result = exercises.map((exercise) => ({ ...exercise }));
  const { min, max } = AUTOREG.setsPerExercise;
  for (let step = 0; step < Math.abs(setDelta); step += 1) {
    const open = result.filter((exercise) => setDelta > 0 ? exercise.sets < max : exercise.sets > min);
    if (!open.length) break;
    const pick = open.reduce((chosen, exercise) => (setDelta > 0 ? exercise.sets < chosen.sets : exercise.sets > chosen.sets) ? exercise : chosen);
    pick.sets += Math.sign(setDelta);
  }
  return result;
}

// ---------- Block structure ----------

export interface WeekPlan {
  week: number;
  deload: boolean;
  targetRir: number;
  /** Multiplier on working sets (0.5 in the deload week). */
  setFactor: number;
}

/** RIR falls 1 per week to `minRir` in the last hard week; the final week is a deload. */
export function blockWeek(week: number, totalWeeks: number, minRir = 1): WeekPlan {
  check(Number.isInteger(week) && Number.isInteger(totalWeeks) && totalWeeks >= 2 && week >= 1 && week <= totalWeeks, "week must be 1..totalWeeks, totalWeeks >= 2");
  if (week === totalWeeks) return { week, deload: true, targetRir: AUTOREG.deloadRir, setFactor: 0.5 };
  return { week, deload: false, targetRir: Math.min(4, minRir + (totalWeeks - 1 - week)), setFactor: 1 };
}

/** A recovery session for the same muscle two weeks running, or for two muscles in one week, calls for an early deload. */
export function needsEarlyDeload(recoveryMusclesByWeek: RecoveryMuscle[][]): boolean {
  const latest = recoveryMusclesByWeek.at(-1) ?? [];
  const previous = recoveryMusclesByWeek.at(-2) ?? [];
  return new Set(latest).size >= 2 || latest.some((muscle) => previous.includes(muscle));
}

/** Seconds per rep against the first set at the same load; above 1.25 the set slowed markedly. Informational only. */
export function tempoSlowdown(first: ObservedSet, current: ObservedSet): number | undefined {
  if (!first.workSeconds || !current.workSeconds || !first.reps || !current.reps || first.loadKg !== current.loadKg) return undefined;
  return Math.round(((current.workSeconds / current.reps) / (first.workSeconds / first.reps)) * 100) / 100;
}
