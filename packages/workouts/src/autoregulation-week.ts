import type { LocalizedText, Routine, RoutineSetTarget, SessionExercise, SorenessScore, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, trackingProfileForLoadMode } from "@gym/catalog";
import type { AdaptiveSessionPlan, PlanItemAdjustment } from "./adaptive-plan";
import { buildAdviceContext } from "./autoregulation-plan";
import {
  AUTOREG, DEFAULT_TAU_HOURS, blockWeek, estimateBaseline, distributeSetDelta, needsEarlyDeload, performanceScore, volumeDecision,
  type PerformanceScore, type RecoveryMuscle, type ScoredSet, type VolumeAction, type WeekPlan
} from "./autoregulation";

/**
 * Weekly volume, block and deload for the next session (ADR 0027). Pure and
 * derived from finished sessions on every read: nothing is stored, and the
 * routine and history are never rewritten.
 */

const DAY_MS = 86_400_000;
/** Four hard weeks then a deload week. Ours. */
export const BLOCK_WEEKS = 5;
const DEFAULT_TARGET_RIR = 2;

export interface MuscleVolumePlan {
  muscle: RecoveryMuscle;
  action: VolumeAction;
  /** Change to this session's working sets for the muscle, against the last time it was trained. */
  sessionSetDelta: number;
  weeklySets: number;
  soreness?: SorenessScore;
  performance?: PerformanceScore;
  reason: LocalizedText;
}

export interface EnginePlan {
  block: WeekPlan & { totalWeeks: number; early: boolean };
  muscles: MuscleVolumePlan[];
}

export type EngineSessionPlan = AdaptiveSessionPlan & { engine?: EnginePlan };

function weekStart(value: Date): number {
  const day = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}

function previousWeek(start: number): number {
  return weekStart(new Date(start - DAY_MS));
}

/** Week of the block: weeks trained in a row up to this one, cycling every `BLOCK_WEEKS`. A week with no workout restarts it. */
export function currentBlockWeek(sessions: WorkoutSession[], now: Date): number {
  const trained = new Set(sessions.filter((session) => session.finishedAt && new Date(session.finishedAt).getTime() <= now.getTime()).map((session) => weekStart(new Date(session.finishedAt!))));
  let streak = 1;
  for (let week = previousWeek(weekStart(now)); trained.has(week); week = previousWeek(week)) streak += 1;
  return ((streak - 1) % BLOCK_WEEKS) + 1;
}

function itemMuscle(movementId: string): RecoveryMuscle | undefined {
  return getMovement(movementId)?.primaryMuscles.find((muscle): muscle is RecoveryMuscle => muscle !== "full_body");
}

function trains(exercise: SessionExercise, muscle: RecoveryMuscle): boolean {
  return Boolean(getMovement(exercise.movementId)?.primaryMuscles.includes(muscle)) && exercise.sets.some((set) => set.completedAt && set.type !== "warmup");
}

function scoredSets(exercise: SessionExercise): ScoredSet[] {
  const profile = exercise.trackingProfileSnapshot ?? getTrackingProfile(exercise.variantId) ?? trackingProfileForLoadMode(exercise.variantId, exercise.loadEntryModeSnapshot);
  if (profile.effortKind !== "reps" || profile.progressDirection !== "higher_load") return [];
  return exercise.sets.flatMap((set) => {
    const min = set.targetMinReps ?? set.targetMaxReps;
    const max = set.targetMaxReps ?? set.targetMinReps;
    const rir = set.rir !== undefined && set.rir >= 0 && set.rir <= 10 ? set.rir : undefined;
    const targetRir = set.targetRir !== undefined && set.targetRir >= 0 && set.targetRir <= 10 ? set.targetRir : DEFAULT_TARGET_RIR;
    return set.completedAt && set.type !== "warmup" && min && max && max >= min && set.weightKg && set.weightKg > 0 && set.reps !== undefined && set.reps >= 0
      ? [{ targetMinReps: min, targetMaxReps: max, targetRir, loadKg: set.weightKg, reps: set.reps, rir }]
      : [];
  });
}

/** Muscles whose logged sets in the window score 4 (could not hit the targets). Only the given exact variants are scored. */
function recoveryMuscles(finished: WorkoutSession[], variantIds: Set<string>, fromMs: number, toMs: number): RecoveryMuscle[] {
  const window = finished.filter((session) => { const at = new Date(session.finishedAt!).getTime(); return at > fromMs && at <= toMs; });
  return (Object.keys(DEFAULT_TAU_HOURS) as RecoveryMuscle[]).filter((muscle) => {
    const sets = window.flatMap((session) => session.exercises.filter((exercise) => variantIds.has(exercise.variantId) && trains(exercise, muscle)).flatMap(scoredSets));
    return sets.length > 0 && performanceScore(sets) === 4;
  });
}

/** The workout screen's set advice can pick this item's load itself: weight x reps with a rep range and a strength estimate from history. */
function engineLoaded(item: PlanItemAdjustment, estimable: boolean): boolean {
  const profile = getTrackingProfile(item.variantId);
  return estimable && item.loadKg !== undefined && profile?.effortKind === "reps" && profile.progressDirection === "higher_load" && profile.e1rmMetric === "entered_load"
    && item.sets.some((set) => set.type === "working" && Boolean(set.minReps ?? set.maxReps));
}

function withWorkingSets(sets: RoutineSetTarget[], count: number, targetRir: number): RoutineSetTarget[] {
  const working = sets.filter((set) => set.type === "working");
  if (!working.length) return sets;
  let drop = Math.max(0, working.length - count);
  const kept: RoutineSetTarget[] = [];
  for (const set of [...sets].reverse()) {
    if (drop > 0 && set.type === "working") { drop -= 1; continue; }
    kept.unshift(set);
  }
  const last = working.at(-1)!;
  for (let extra = working.length; extra < count; extra += 1) kept.push({ ...last, id: `${last.id}_engine_${extra}` });
  return kept.map((set) => set.type === "working" ? { ...set, targetRir } : set);
}

/**
 * Adds the engine's week to the next-session plan: target RIR from the block
 * week, a deload when due, and one working set more or fewer per muscle from
 * its soreness answer and logged performance. Only applies to an on-track plan;
 * a first session or a return from a break keeps the plan as it is.
 */
export function planEngineSession(plan: AdaptiveSessionPlan, routine: Routine, sessions: WorkoutSession[], now: Date = new Date()): EngineSessionPlan {
  if (plan.readiness !== "on_track") return plan;
  const nowMs = now.getTime();
  const finished = sessions
    .filter((session) => session.finishedAt && new Date(session.finishedAt).getTime() <= nowMs)
    .sort((left, right) => right.finishedAt!.localeCompare(left.finishedAt!));
  const week = currentBlockWeek(finished, now);
  // Performance is read only from the exact variants this session will use; another variant's misses never count.
  const variantIds = new Set(plan.items.map((item) => item.variantId));
  const early = week !== BLOCK_WEEKS && needsEarlyDeload([recoveryMuscles(finished, variantIds, nowMs - 14 * DAY_MS, nowMs - 7 * DAY_MS), recoveryMuscles(finished, variantIds, nowMs - 7 * DAY_MS, nowMs)]);
  const block = { ...blockWeek(early ? BLOCK_WEEKS : week, BLOCK_WEEKS), week, totalWeeks: BLOCK_WEEKS, early };
  const recent = finished.filter((session) => nowMs - new Date(session.finishedAt!).getTime() <= 14 * DAY_MS);
  const routineSets = (item: PlanItemAdjustment) => item.sets.filter((set) => set.type === "working").length;
  /** Working sets planned the last time this exact variant was trained; the routine's own count in week 1 or without recent history. */
  const baseSets = (item: PlanItemAdjustment) => {
    const last = week === 1 ? undefined : recent.flatMap((session) => session.exercises).find((exercise) => exercise.variantId === item.variantId && exercise.sets.some((set) => set.completedAt && set.type === "working"));
    const count = last ? last.sets.filter((set) => set.type === "working").length : routineSets(item);
    return Math.min(AUTOREG.setsPerExercise.max, Math.max(Math.min(AUTOREG.setsPerExercise.min, routineSets(item)), count));
  };

  const target = new Map<string, number>();
  const muscles: MuscleVolumePlan[] = [];
  const groups = new Map<RecoveryMuscle, PlanItemAdjustment[]>();
  for (const item of plan.items) {
    if (!routineSets(item)) continue;
    const muscle = itemMuscle(item.movementId);
    if (!muscle) continue;
    groups.set(muscle, [...(groups.get(muscle) ?? []), item]);
  }
  for (const [muscle, items] of groups) {
    if (block.deload) {
      items.forEach((item) => target.set(item.itemId, Math.max(Math.min(2, routineSets(item)), Math.ceil(routineSets(item) * block.setFactor))));
      continue;
    }
    const reference = recent.find((session) => session.exercises.some((exercise) => trains(exercise, muscle)));
    const answer = reference?.soreness?.[muscle];
    const soreness = answer === 1 || answer === 2 || answer === 3 || answer === 4 ? answer : undefined;
    const scored = reference?.exercises.filter((exercise) => variantIds.has(exercise.variantId) && trains(exercise, muscle)).flatMap(scoredSets) ?? [];
    const performance = scored.length ? performanceScore(scored) : undefined;
    const weeklySets = finished
      .filter((session) => nowMs - new Date(session.finishedAt!).getTime() <= 7 * DAY_MS)
      .reduce((sum, session) => sum + session.exercises.filter((exercise) => trains(exercise, muscle)).reduce((count, exercise) => count + exercise.sets.filter((set) => set.completedAt && set.type !== "warmup").length, 0), 0);
    const base = items.map((item) => ({ id: item.itemId, sets: baseSets(item) }));
    let decided = base;
    let entry: MuscleVolumePlan;
    if (soreness === undefined || performance === undefined) {
      entry = {
        muscle, action: "hold", sessionSetDelta: 0, weeklySets, soreness, performance,
        reason: soreness === undefined
          ? { vi: "Chưa có câu trả lời đau cơ cho buổi gần nhất: giữ nguyên số set.", en: "No soreness answer for the last workout: sets unchanged." }
          : { vi: "Chưa có set tạ × số lần có mục tiêu để chấm: giữ nguyên số set.", en: "No weight × reps sets with a target to score: sets unchanged." }
      };
    } else {
      const decision = volumeDecision({ soreness, performance, weeklySets });
      if (decision.action === "recovery_session") decided = base.map((item) => ({ ...item, sets: Math.max(Math.min(AUTOREG.setsPerExercise.min, item.sets), Math.ceil(item.sets / 2)) }));
      // One set per session at most, so a muscle trained twice a week does not jump by four.
      else decided = distributeSetDelta(base, Math.sign(decision.setDelta));
      const delta = decided.reduce((sum, item, index) => sum + item.sets - base[index].sets, 0);
      const recovery = decision.action === "recovery_session";
      const reason: LocalizedText = recovery
        ? decision.reason
        : delta > 0
          ? { vi: "Hồi phục tốt và đạt mục tiêu: thêm 1 set buổi này.", en: "Recovering well and hitting targets: one more set this session." }
          : delta < 0
            ? { vi: "Vẫn còn đau khi tập lại: bớt 1 set buổi này.", en: "Still sore when trained again: one set fewer this session." }
            : soreness === 4
              ? { vi: "Vẫn còn đau khi tập lại, nhưng số set đã ở mức tối thiểu: giữ nguyên.", en: "Still sore when trained again, but sets are already at the minimum: unchanged." }
              : decision.action === "add" || soreness <= 2 && performance <= 2
                ? { vi: "Hồi phục tốt, nhưng số set đã ở mức tối đa: giữ nguyên.", en: "Recovering well, but sets are already at the maximum: unchanged." }
                : decision.reason;
      entry = { muscle, action: recovery ? "recovery_session" : delta > 0 ? "add" : delta < 0 ? "remove" : "hold", sessionSetDelta: delta, weeklySets, soreness, performance, reason };
    }
    muscles.push(entry);
    decided.forEach((item) => target.set(item.id, item.sets));
  }

  const history = buildAdviceContext(finished, now).history;
  const items = plan.items.map((item) => {
    const count = target.get(item.itemId);
    if (count === undefined) return item;
    const before = routineSets(item);
    const sets = withWorkingSets(item.sets, count, block.targetRir);
    const change = count - before;
    const note: LocalizedText | undefined = block.deload
      ? { vi: `Tuần xả tải: ${count} set, dừng khi còn khoảng ${block.targetRir} lần.`, en: `Deload week: ${count} sets, stop with about ${block.targetRir} reps left.` }
      : change
        ? { vi: `${change > 0 ? "Thêm" : "Bớt"} ${Math.abs(change)} set so với lịch gốc.`, en: `${Math.abs(change)} set${Math.abs(change) === 1 ? "" : "s"} ${change > 0 ? "more" : "fewer"} than the routine.` }
        : undefined;
    if (engineLoaded(item, Boolean(estimateBaseline(history.get(item.variantId) ?? [], now)))) {
      // A prefilled load counts as typed on the workout screen and would be kept at the new target effort, so the set advice picks it instead.
      const effort: LocalizedText = { vi: `Tạ và số lần do gợi ý từng set chọn, để còn khoảng ${block.targetRir} lần (RIR ${block.targetRir}) theo sức hôm nay.`, en: `The set suggestions pick weight and reps to leave about ${block.targetRir} reps (RIR ${block.targetRir}) at today's strength.` };
      return { ...item, action: "hold" as const, loadKg: undefined, previousLoadKg: undefined, sets, reason: note ? { vi: `${note.vi} ${effort.vi}`, en: `${note.en} ${effort.en}` } : effort };
    }
    return { ...item, sets, reason: note ? { vi: `${item.reason.vi} ${note.vi}`, en: `${item.reason.en} ${note.en}` } : item.reason };
  });
  const changedItemCount = items.filter((item) => item.action === "progress" || item.action === "reduce" || item.action === "ease_back").length;
  const summary: LocalizedText = block.deload
    ? { vi: "Tuần xả tải: ít set hơn và nhẹ hơn để hồi phục.", en: "Deload week: fewer, easier sets to recover." }
    : { vi: `Tuần ${week}/${BLOCK_WEEKS}: mức tạ theo sức hôm nay, số set theo phản hồi của bạn.`, en: `Week ${week} of ${BLOCK_WEEKS}: loads follow today's strength, set counts follow your feedback.` };
  return { ...plan, items, changedItemCount, summary, engine: { block, muscles } };
}
