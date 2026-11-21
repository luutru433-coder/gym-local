import {
  type LocalizedText,
  type ProgressionRule,
  type Routine,
  type RoutineItem,
  type RoutineSetTarget,
  type TrackingProgressDirection,
  type WorkoutSession
} from "@gym/contracts";
import { getTrackingProfile, getVariant, trackingProfileForLoadMode } from "@gym/catalog";
import { createSessionFromRoutine, suggestDoubleProgression } from "./index";

const DAY_MS = 86_400_000;

/** Days without any finished workout before loads are eased back. */
export const RETURN_AFTER_DAYS = 10;
/** Days without any finished workout before one working set is also removed. */
export const LONG_BREAK_DAYS = 21;
/** Consecutive exact-variant sessions below the minimum target before load is reduced. */
export const MISSED_SESSIONS_BEFORE_REDUCTION = 2;

export const DEFAULT_PROGRESSION_RULE: ProgressionRule = {
  type: "double_progression",
  successSessions: 2,
  defaultIncrementKg: 2.5,
  fallbackIncreasePercent: 5
};

export type PlanReadiness = "first_session" | "on_track" | "returning" | "long_break";

export type PlanAdjustmentAction = "start" | "progress" | "hold" | "reduce" | "ease_back";

export interface PlanItemAdjustment {
  itemId: string;
  movementId: string;
  variantId: string;
  action: PlanAdjustmentAction;
  /** Load to prefill, in the variant's own entry mode. Assisted variants store assistance. */
  loadKg?: number;
  previousLoadKg?: number;
  /** Session-only targets. The routine itself is never rewritten. */
  sets: RoutineSetTarget[];
  reason: LocalizedText;
}

export interface AdaptiveSessionPlan {
  routineId: string;
  readiness: PlanReadiness;
  daysSinceLastSession?: number;
  items: PlanItemAdjustment[];
  changedItemCount: number;
  summary: LocalizedText;
}

function roundToHalf(value: number): number {
  return Math.max(0, Math.round(value * 2) / 2);
}

function finishedSessions(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions
    .filter((session) => Boolean(session.finishedAt))
    .sort((left, right) => new Date(right.finishedAt!).getTime() - new Date(left.finishedAt!).getTime());
}

function directionFor(variantId: string): TrackingProgressDirection {
  const variant = getVariant(variantId);
  const profile = getTrackingProfile(variantId)
    ?? (variant ? trackingProfileForLoadMode(variantId, variant.loadEntryMode) : undefined);
  return profile?.progressDirection ?? "higher_load";
}

/** True when the exact variant was trained but fell short of the minimum target. */
function missedMinimum(session: WorkoutSession, variantId: string): boolean | undefined {
  const working = session.exercises
    .filter((exercise) => exercise.variantId === variantId)
    .flatMap((exercise) => exercise.sets.filter((set) => set.type === "working"));
  const completed = working.filter((set) => Boolean(set.completedAt));
  if (!completed.length) return undefined;
  if (completed.length < working.length) return true;
  return completed.some((set) => {
    if (set.targetMinReps !== undefined) return (set.reps ?? 0) < set.targetMinReps;
    if (set.targetDurationSeconds !== undefined) return (set.durationSeconds ?? 0) < set.targetDurationSeconds;
    return false;
  });
}

function missedStreak(sessions: WorkoutSession[], variantId: string): number {
  let streak = 0;
  for (const session of sessions) {
    const missed = missedMinimum(session, variantId);
    if (missed === undefined) continue;
    if (!missed) break;
    streak += 1;
  }
  return streak;
}

function workingSetsWithout(sets: RoutineSetTarget[], removeCount: number): RoutineSetTarget[] {
  const workingCount = sets.filter((set) => set.type === "working").length;
  let removable = Math.max(0, Math.min(removeCount, workingCount - 2));
  if (!removable) return sets;
  const kept: RoutineSetTarget[] = [];
  for (const set of [...sets].reverse()) {
    if (removable > 0 && set.type === "working") {
      removable -= 1;
      continue;
    }
    kept.unshift(set);
  }
  return kept;
}

/**
 * Rep and duration progress lives in session targets, not in the routine, so the
 * latest exact-variant targets are the baseline once they exceed the routine's.
 */
function carryProgressedTargets(
  sets: RoutineSetTarget[],
  sessions: WorkoutSession[],
  variantId: string,
  direction: TrackingProgressDirection
): RoutineSetTarget[] {
  if (direction !== "higher_reps" && direction !== "longer_duration") return sets;
  const latest = sessions
    .map((session) => session.exercises
      .filter((exercise) => exercise.variantId === variantId)
      .flatMap((exercise) => exercise.sets.filter((set) => set.type === "working")))
    .find((working) => working.some((set) => Boolean(set.completedAt)));
  if (!latest) return sets;
  let workingIndex = -1;
  return sets.map((set) => {
    if (set.type !== "working") return set;
    workingIndex += 1;
    // Targets are carried set by set so unequal targets keep their shape.
    const previous = latest[workingIndex];
    if (!previous) return set;
    if (direction === "higher_reps") {
      const top = set.maxReps ?? set.minReps;
      const previousTop = previous.targetMaxReps ?? previous.targetMinReps;
      if (top === undefined || previousTop === undefined || previousTop <= top) return set;
      const step = previousTop - top;
      return {
        ...set,
        minReps: set.minReps === undefined ? undefined : set.minReps + step,
        maxReps: set.maxReps === undefined ? undefined : set.maxReps + step
      };
    }
    return set.durationSeconds !== undefined && (previous.targetDurationSeconds ?? 0) > set.durationSeconds
      ? { ...set, durationSeconds: previous.targetDurationSeconds }
      : set;
  });
}

function planItem(
  item: RoutineItem,
  finished: WorkoutSession[],
  rule: ProgressionRule,
  readiness: PlanReadiness,
  daysSince: number | undefined
): PlanItemAdjustment {
  const variantId = item.preferredVariantId;
  // A session where this variant was skipped says nothing about it and must not hide older history.
  const sessions = finished.filter((session) => session.exercises.some((exercise) =>
    exercise.variantId === variantId && exercise.sets.some((set) => set.type === "working" && Boolean(set.completedAt))));
  const direction = directionFor(variantId);
  const loaded = direction === "higher_load" || direction === "lower_assistance";
  const suggestion = suggestDoubleProgression(sessions, variantId, rule);
  const base = { itemId: item.id, movementId: item.movementId, variantId };
  const sets = carryProgressedTargets(item.sets.map((set) => ({ ...set })), sessions, variantId, direction);

  if (suggestion.action === "no_data" || suggestion.currentValue === undefined) {
    return {
      ...base,
      action: "start",
      sets,
      reason: {
        vi: "Chưa có lịch sử cho đúng biến thể này: bắt đầu nhẹ và ghi lại mức tạ.",
        en: "No history for this exact variation yet: start light and log your load."
      }
    };
  }

  const current = suggestion.currentValue;
  const scaled = (factor: number) => direction === "lower_assistance"
    ? roundToHalf(current * (2 - factor))
    : roundToHalf(current * factor);

  if (readiness === "returning" || readiness === "long_break") {
    const factor = readiness === "long_break" ? 0.8 : 0.9;
    const percent = Math.round((1 - factor) * 100);
    const eased = readiness === "long_break" ? workingSetsWithout(sets, 1) : sets;
    const removed = sets.length - eased.length;
    const loadKg = loaded ? scaled(factor) : undefined;
    return {
      ...base,
      action: "ease_back",
      loadKg,
      previousLoadKg: loaded ? current : undefined,
      sets: eased,
      reason: {
        vi: `Nghỉ ${daysSince} ngày: ${loaded ? `${direction === "lower_assistance" ? "tăng trợ lực" : "giảm tải"} ${percent}% (${current} → ${loadKg} kg)` : "giữ mục tiêu cũ"}${removed ? `, bớt ${removed} set` : ""} để vào lại an toàn.`,
        en: `${daysSince} days off: ${loaded ? `${direction === "lower_assistance" ? "assistance up" : "load down"} ${percent}% (${current} → ${loadKg} kg)` : "keep the previous target"}${removed ? `, ${removed} fewer set` : ""} to ease back in.`
      }
    };
  }

  const missed = missedStreak(sessions, variantId);
  if (loaded && missed >= MISSED_SESSIONS_BEFORE_REDUCTION) {
    const loadKg = scaled(0.9);
    return {
      ...base,
      action: "reduce",
      loadKg,
      previousLoadKg: current,
      sets,
      reason: {
        vi: `${missed} buổi liên tiếp chưa đạt mức tối thiểu: ${direction === "lower_assistance" ? "tăng trợ lực" : "giảm tải"} 10% (${current} → ${loadKg} kg) để tập đủ số lần.`,
        en: `${missed} sessions in a row under the minimum target: ${direction === "lower_assistance" ? "assistance up" : "load down"} 10% (${current} → ${loadKg} kg) to hit your reps.`
      }
    };
  }

  const ready = suggestion.action !== "repeat" && suggestion.suggestedValue !== undefined;
  if (ready && loaded) {
    return {
      ...base,
      action: "progress",
      loadKg: suggestion.suggestedValue,
      previousLoadKg: current,
      sets,
      reason: suggestion.explanation
    };
  }
  if (ready && direction === "higher_reps") {
    return {
      ...base,
      action: "progress",
      sets: sets.map((set) => {
        const top = set.maxReps ?? set.minReps;
        if (set.type !== "working" || top === undefined) return set;
        const step = Math.max(1, suggestion.suggestedValue! - top);
        return {
          ...set,
          minReps: set.minReps === undefined ? undefined : set.minReps + step,
          maxReps: set.maxReps === undefined ? undefined : set.maxReps + step
        };
      }),
      reason: suggestion.explanation
    };
  }
  if (ready && direction === "longer_duration") {
    return {
      ...base,
      action: "progress",
      sets: sets.map((set) => set.type === "working" && set.durationSeconds !== undefined
        ? { ...set, durationSeconds: Math.max(set.durationSeconds + 5, suggestion.suggestedValue!) }
        : set),
      reason: suggestion.explanation
    };
  }
  if (ready) {
    // Distance has no stored target, so the advice carries the longer distance.
    return { ...base, action: "progress", sets, reason: suggestion.explanation };
  }
  return {
    ...base,
    action: "hold",
    loadKg: loaded ? current : undefined,
    previousLoadKg: loaded ? current : undefined,
    sets,
    reason: suggestion.explanation
  };
}

/**
 * Builds the next session for a routine from finished exact-variant history.
 * Pure: it never mutates the routine, an active session, or history.
 */
export function planAdaptiveSession(
  routine: Routine,
  sessions: WorkoutSession[],
  rule: ProgressionRule,
  now: Date = new Date()
): AdaptiveSessionPlan {
  const finished = finishedSessions(sessions);
  const last = finished[0];
  const daysSinceLastSession = last
    ? Math.max(0, Math.floor((now.getTime() - new Date(last.finishedAt!).getTime()) / DAY_MS))
    : undefined;
  const readiness: PlanReadiness = daysSinceLastSession === undefined
    ? "first_session"
    : daysSinceLastSession >= LONG_BREAK_DAYS
      ? "long_break"
      : daysSinceLastSession >= RETURN_AFTER_DAYS
        ? "returning"
        : "on_track";
  const items = routine.items.map((item) => planItem(item, finished, rule, readiness, daysSinceLastSession));
  const count = (action: PlanAdjustmentAction) => items.filter((item) => item.action === action).length;
  const changedItemCount = items.filter((item) => item.action === "progress" || item.action === "reduce" || item.action === "ease_back").length;
  const summary: LocalizedText = readiness === "first_session"
    ? { vi: "Buổi đầu tiên: kế hoạch sẽ tự điều chỉnh sau khi bạn ghi lại buổi tập.", en: "First session: the plan starts adjusting once you log a workout." }
    : readiness === "returning" || readiness === "long_break"
      ? { vi: `Nghỉ ${daysSinceLastSession} ngày: buổi này được giảm nhẹ để vào lại.`, en: `${daysSinceLastSession} days off: this session is eased back.` }
      : changedItemCount
        ? { vi: `${count("progress")} bài tăng, ${count("reduce")} bài giảm, ${count("hold") + count("start")} bài giữ nguyên.`, en: `${count("progress")} up, ${count("reduce")} down, ${count("hold") + count("start")} unchanged.` }
        : { vi: "Giữ nguyên mục tiêu: chưa đủ buổi đạt để tăng.", en: "Targets unchanged: not enough successful sessions to progress yet." };
  return { routineId: routine.id, readiness, daysSinceLastSession, items, changedItemCount, summary };
}

/**
 * Starts a session with the plan's targets and prefilled loads. Only the new
 * session carries the adjustment; nothing is completed on the user's behalf.
 */
export function createAdaptiveSessionFromRoutine(routine: Routine, plan: AdaptiveSessionPlan, locationId?: string): WorkoutSession {
  const adjustments = new Map(plan.items.map((item) => [item.itemId, item]));
  const adjusted: Routine = {
    ...routine,
    items: routine.items.map((item) => {
      const adjustment = adjustments.get(item.id);
      return adjustment && adjustment.variantId === item.preferredVariantId ? { ...item, sets: adjustment.sets } : item;
    })
  };
  const session = createSessionFromRoutine(adjusted, locationId);
  return {
    ...session,
    exercises: session.exercises.map((exercise, index) => {
      const adjustment = adjustments.get(routine.items[index].id);
      if (!adjustment || adjustment.loadKg === undefined || adjustment.variantId !== exercise.variantId) return exercise;
      return {
        ...exercise,
        sets: exercise.sets.map((set) => set.type === "working" ? { ...set, weightKg: adjustment.loadKg } : set)
      };
    })
  };
}

export type WeekDayStatus = "done" | "planned" | "rest";

export interface PlannedWeekDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  status: WeekDayStatus;
  isToday: boolean;
  isPast: boolean;
  routineId?: string;
}

export interface TrainingWeekPlan {
  days: PlannedWeekDay[];
  targetSessions: number;
  completedSessions: number;
  plannedSessions: number;
  /** Sessions that no longer fit before the week ends. */
  droppedSessions: number;
  nextTrainingDate?: string;
  note: LocalizedText;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Re-flows the rest of the Monday–Sunday week around what was actually trained:
 * remaining sessions are spread over the remaining days, with a rest day after a
 * training day whenever the week still has room.
 */
export function planTrainingWeek(options: {
  daysPerWeek: number;
  sessions: WorkoutSession[];
  /** Routine ids in the order they come up next; cycled when shorter than the week. */
  upcomingRoutineIds?: string[];
  now?: Date;
}): TrainingWeekPlan {
  const now = options.now ?? new Date();
  const target = Math.min(7, Math.max(1, Math.trunc(options.daysPerWeek) || 1));
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() || 7) - 1));
  const dates = Array.from({ length: 7 }, (_, index) => localDateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)));
  const todayIndex = dates.indexOf(localDateKey(now));
  const trained = new Set(options.sessions
    .filter((session) => Boolean(session.finishedAt))
    .map((session) => localDateKey(new Date(session.finishedAt!)))
    .filter((date) => dates.includes(date)));
  const completedSessions = trained.size;
  const remaining = Math.max(0, target - completedSessions);

  let open = dates.map((_, index) => index).filter((index) => index >= todayIndex && !trained.has(dates[index]));
  const restFirst = (index: number) => index > 0 && trained.has(dates[index - 1]);
  if (open.length > remaining && open.length && restFirst(open[0])) open = open.slice(1);

  const chosen = new Set<number>();
  const count = Math.min(remaining, open.length);
  if (count === open.length) {
    open.forEach((index) => chosen.add(index));
  } else {
    for (let slot = 0; slot < count; slot += 1) {
      chosen.add(open[count === 1 ? 0 : Math.round(slot * (open.length - 1) / (count - 1))]);
    }
  }

  const queue = options.upcomingRoutineIds ?? [];
  let queueIndex = 0;
  const days: PlannedWeekDay[] = dates.map((date, index) => {
    const status: WeekDayStatus = trained.has(date) ? "done" : chosen.has(index) ? "planned" : "rest";
    const day: PlannedWeekDay = { date, status, isToday: index === todayIndex, isPast: index < todayIndex };
    if (status === "planned" && queue.length) {
      day.routineId = queue[queueIndex % queue.length];
      queueIndex += 1;
    }
    return day;
  });
  const plannedSessions = chosen.size;
  const droppedSessions = remaining - plannedSessions;
  const nextTrainingDate = days.find((day) => day.status === "planned")?.date;
  const note: LocalizedText = remaining === 0
    ? { vi: "Đã đủ số buổi tuần này. Các ngày còn lại để hồi phục.", en: "Weekly target reached. The remaining days are for recovery." }
    : droppedSessions > 0
      ? { vi: `Tuần này chỉ còn chỗ cho ${plannedSessions}/${remaining} buổi còn lại; lịch đã dồn lại và ${droppedSessions} buổi chuyển sang tuần sau.`, en: `Only ${plannedSessions} of the ${remaining} remaining sessions still fit this week; ${droppedSessions} ${droppedSessions === 1 ? "rolls" : "roll"} over to next week.` }
      : { vi: `Còn ${remaining} buổi, đã xếp lại vào các ngày còn trống trong tuần.`, en: `${remaining} ${remaining === 1 ? "session" : "sessions"} left, re-spread over the open days this week.` };
  return { days, targetSessions: target, completedSessions, plannedSessions, droppedSessions, nextTrainingDate, note };
}
