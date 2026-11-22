import type { LocalizedText, SessionExercise, SetLog, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, trackingProfileForLoadMode } from "@gym/catalog";
import {
  estimateBaseline, calibrateFatigueDrop, muscleRecovery, nextSetCapacity, prescribeSet, readinessFactor, setFatigueUnits,
  type BaselineEstimate, type MuscleLoadEvent, type MuscleRecoveryEstimate, type ObservedSet, type PrescriptionAction,
  type RecoveryMuscle, type VariantSessionRecord
} from "./autoregulation";

/** RIR assumed for a set with neither a logged RIR nor a target, on both sides: reading history and planning. */
export const DEFAULT_TARGET_RIR = 2;
const RECOVERY_LOOKBACK_MS = 10 * 86_400_000;

export interface AdviceContext {
  at: Date;
  history: Map<string, VariantSessionRecord[]>;
  recovery: MuscleRecoveryEstimate[];
}

export interface SetAdvice {
  weightKg: number;
  reps: number;
  /** Reps the engine expects to be left after `reps`. */
  expectedRir: number;
  /** Today's estimated fresh e1RM for this exact variant. */
  freshE1rmKg: number;
  /** Readiness applied to the baseline, 85-105. */
  readinessPercent: number;
  action: PrescriptionAction;
  confidence: BaselineEstimate["confidence"];
  reason: LocalizedText;
}

function profileOf(exercise: SessionExercise) {
  return exercise.trackingProfileSnapshot
    ?? getTrackingProfile(exercise.variantId)
    ?? trackingProfileForLoadMode(exercise.variantId, exercise.loadEntryModeSnapshot);
}

/** Only rep-based exercises that progress by entered load can be estimated. */
function supported(exercise: SessionExercise): boolean {
  const profile = profileOf(exercise);
  return profile.effortKind === "reps" && profile.progressDirection === "higher_load" && profile.e1rmMetric === "entered_load";
}

function validRir(value: number | undefined): number | undefined {
  return value !== undefined && value >= 0 && value <= 10 && Number.isInteger(value * 2) ? value : undefined;
}

function observed(set: SetLog): ObservedSet | undefined {
  if (!set.completedAt || set.type !== "working") return undefined;
  if (!(set.weightKg && set.weightKg > 0 && Number.isFinite(set.weightKg)) || !Number.isInteger(set.reps) || set.reps! < 1) return undefined;
  const rest = set.restBeforeSeconds;
  return {
    loadKg: set.weightKg,
    reps: set.reps!,
    rir: validRir(set.rir),
    rpe: set.rpe !== undefined && set.rpe >= 1 && set.rpe <= 10 && Number.isInteger(set.rpe * 2) ? set.rpe : undefined,
    targetRir: validRir(set.targetRir) ?? DEFAULT_TARGET_RIR,
    restBeforeSeconds: rest !== undefined && rest >= 0 && Number.isFinite(rest) ? rest : undefined
  };
}

function observedSets(exercise: SessionExercise): ObservedSet[] {
  return exercise.sets.map(observed).filter((set): set is ObservedSet => set !== undefined);
}

/**
 * Everything the advice needs from finished sessions, built once per workout:
 * exact-variant history and each muscle's recovery at the start of this session.
 */
export function buildAdviceContext(finishedSessions: WorkoutSession[], at: Date): AdviceContext {
  const history = new Map<string, VariantSessionRecord[]>();
  const events: MuscleLoadEvent[] = [];
  for (const session of finishedSessions) {
    if (!session.finishedAt) continue;
    const finished = new Date(session.finishedAt).getTime();
    if (!(finished <= at.getTime())) continue;
    for (const exercise of session.exercises) {
      if (supported(exercise)) {
        const sets = observedSets(exercise);
        if (sets.length) {
          const records = history.get(exercise.variantId) ?? [];
          const same = records.find((record) => record.finishedAt === session.finishedAt);
          if (same) same.sets.push(...sets);
          else records.push({ finishedAt: session.finishedAt, sets });
          history.set(exercise.variantId, records);
        }
      }
      if (at.getTime() - finished > RECOVERY_LOOKBACK_MS) continue;
      const movement = getMovement(exercise.movementId);
      const working = exercise.sets.filter((set) => set.completedAt && set.type !== "warmup");
      if (!movement || !working.length) continue;
      const units = (role: "primary" | "secondary") => working.reduce((sum, set) => sum + setFatigueUnits(validRir(set.rir) ?? validRir(set.targetRir) ?? DEFAULT_TARGET_RIR, role), 0);
      movement.primaryMuscles.forEach((muscle) => { if (muscle !== "full_body") events.push({ at: session.finishedAt!, muscle, units: units("primary") }); });
      movement.secondaryMuscles.forEach((muscle) => {
        if (muscle !== "full_body" && !movement.primaryMuscles.includes(muscle)) events.push({ at: session.finishedAt!, muscle, units: units("secondary") });
      });
    }
  }
  return { at, history, recovery: muscleRecovery(events, at) };
}

function loadsUpTo(stepKg: number, topKg: number): number[] {
  return Array.from({ length: Math.max(1, Math.ceil(topKg / stepKg)) }, (_, index) => Math.round((index + 1) * stepKg * 100) / 100);
}

/**
 * Load and reps for an unfinished working set, from today's estimated strength and
 * the sets already done. Undefined when the exercise cannot be estimated or has no
 * data yet; the caller then keeps the previous "same as last time" suggestion.
 */
export function adviseSet(context: AdviceContext, exercise: SessionExercise, setId: string): SetAdvice | undefined {
  const set = exercise.sets.find((item) => item.id === setId);
  if (!set || set.completedAt || set.type !== "working" || !supported(exercise)) return undefined;
  const minReps = set.targetMinReps ?? set.targetMaxReps;
  const maxReps = set.targetMaxReps ?? set.targetMinReps;
  if (!minReps || !maxReps || !Number.isInteger(minReps) || !Number.isInteger(maxReps) || maxReps < minReps) return undefined;

  const records = context.history.get(exercise.variantId) ?? [];
  const baseline = estimateBaseline(records, context.at);
  const movement = getMovement(exercise.movementId);
  const primary = (movement?.primaryMuscles ?? []).filter((muscle): muscle is RecoveryMuscle => muscle !== "full_body");
  const readiness = readinessFactor({
    primaryMuscleRecovery: primary.map((muscle) => context.recovery.find((item) => item.muscle === muscle)?.recovery ?? 1)
  });
  const done = observedSets(exercise);
  const rest = set.restBeforeSeconds;
  const actualRest = done.length && rest !== undefined && rest >= 0 && Number.isFinite(rest) ? rest : undefined;
  const capacity = nextSetCapacity({
    priorE1rmKg: baseline ? baseline.e1rmKg * readiness.factor : undefined,
    completedSets: done,
    // A set already started knows the rest really taken; before that, the planned rest.
    restSeconds: actualRest ?? (exercise.restSeconds >= 0 ? exercise.restSeconds : undefined),
    fatigueDropPerSet: calibrateFatigueDrop(records).dropPerSet
  });
  if (!capacity) return undefined;

  const stepKg = profileOf(exercise).loadEntryMode === "total_weight" ? 2.5 : 1;
  const typed = set.weightKg !== undefined && set.weightKg > 0 ? set.weightKg : undefined;
  // Sessions arrive in the store's order, so the latest one is found by date.
  const latest = records.reduce<VariantSessionRecord | undefined>((newest, record) => !newest || record.finishedAt > newest.finishedAt ? record : newest, undefined);
  const currentLoadKg = typed ?? done.at(-1)?.loadKg ?? latest?.sets[0]?.loadKg;
  const targetRir = validRir(set.targetRir) ?? DEFAULT_TARGET_RIR;
  const prescription = prescribeSet({
    capacityE1rmKg: capacity.e1rmKg,
    target: { minReps, maxReps, rir: targetRir },
    // A load the user typed is kept; only the reps are fitted to it.
    availableLoadsKg: typed ? [typed] : loadsUpTo(stepKg, Math.max(capacity.e1rmKg, currentLoadKg ?? 0)),
    currentLoadKg
  });
  if (!prescription.feasible) return undefined;
  const percent = Math.round(readiness.factor * 100);
  const basis: LocalizedText = done.length
    ? { vi: `tính lại sau ${done.length} set hôm nay`, en: `re-estimated after ${done.length} set${done.length === 1 ? "" : "s"} today` }
    : percent < 100
      ? { vi: `nhóm cơ chính chưa hồi phục hết, sức ước tính ${percent}%`, en: `main muscles not fully recovered, estimated strength ${percent}%` }
      : { vi: `từ ${baseline?.sessionsUsed ?? 0} buổi gần nhất`, en: `from your last ${baseline?.sessionsUsed ?? 0} session${baseline?.sessionsUsed === 1 ? "" : "s"}` };
  return {
    weightKg: prescription.loadKg,
    reps: prescription.reps,
    expectedRir: prescription.expectedRir,
    freshE1rmKg: capacity.freshE1rmKg,
    readinessPercent: percent,
    action: prescription.action,
    confidence: done.length ? "high" : baseline?.confidence ?? "low",
    reason: { vi: `${prescription.reason.vi} (${basis.vi})`, en: `${prescription.reason.en} (${basis.en})` }
  };
}
