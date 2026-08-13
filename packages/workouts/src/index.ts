import {
  createId,
  type ExerciseVariant,
  type LocalizedText,
  type ProgressionRule,
  type Routine,
  type RoutineItem,
  type SessionExercise,
  type SetLog,
  type SetType,
  type WorkoutSession
} from "@gym/contracts";
import { getMovement, getTrackingProfile, getVariant, trackingProfileForLoadMode } from "@gym/catalog";

const now = () => new Date().toISOString();

function targetSets(count: number, minReps: number, maxReps: number, targetRir = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `target_${index + 1}`,
    type: "working" as const,
    minReps,
    maxReps,
    targetRir
  }));
}

function durationSets(count: number, durationSeconds: number, targetRir = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `target_${index + 1}`,
    type: "working" as const,
    durationSeconds,
    targetRir
  }));
}

function routineItem(movementId: string, preferredVariantId: string, count: number, min: number, max: number, restSeconds: number): RoutineItem {
  return {
    id: `item_${movementId}`,
    movementId,
    preferredVariantId,
    sets: targetSets(count, min, max),
    restSeconds
  };
}

function timedRoutineItem(movementId: string, preferredVariantId: string, count: number, durationSeconds: number, restSeconds: number): RoutineItem {
  return {
    id: `item_${movementId}`,
    movementId,
    preferredVariantId,
    sets: durationSets(count, durationSeconds),
    restSeconds
  };
}

function template(id: string, vi: string, en: string, goal: Routine["goal"], daysPerWeek: number, items: RoutineItem[], difficulty: Routine["difficulty"] = "beginner"): Routine {
  return {
    id,
    name: { vi, en },
    goal,
    difficulty,
    daysPerWeek,
    templateVersion: 1,
    items,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z"
  };
}

export const ROUTINE_TEMPLATES: Routine[] = [
  template("tpl_full_body_a", "Full Body A · Người mới", "Full Body A · Beginner", "general", 3, [
    routineItem("squat", "squat__dumbbell", 3, 8, 12, 120),
    routineItem("chest_press", "chest_press__dumbbell", 3, 8, 12, 90),
    routineItem("horizontal_row", "horizontal_row__cable", 3, 8, 12, 90),
    routineItem("romanian_deadlift", "romanian_deadlift__dumbbell", 3, 8, 12, 120),
    routineItem("lateral_raise", "lateral_raise__dumbbell", 2, 12, 15, 60),
    timedRoutineItem("plank", "plank__bodyweight", 3, 30, 60)
  ]),
  template("tpl_full_body_b", "Full Body B · Người mới", "Full Body B · Beginner", "general", 3, [
    routineItem("leg_press", "leg_press__machine", 3, 10, 15, 120),
    routineItem("lat_pulldown", "lat_pulldown__cable", 3, 8, 12, 90),
    routineItem("overhead_press", "overhead_press__machine", 3, 8, 12, 90),
    routineItem("hip_thrust", "hip_thrust__machine", 3, 8, 12, 120),
    routineItem("biceps_curl", "biceps_curl__dumbbell", 2, 10, 15, 60),
    routineItem("triceps_pushdown", "triceps_pushdown__cable", 2, 10, 15, 60)
  ]),
  template("tpl_upper_hypertrophy", "Upper · Tăng cơ", "Upper · Hypertrophy", "hypertrophy", 4, [
    routineItem("incline_chest_press", "incline_chest_press__dumbbell", 3, 6, 10, 120),
    routineItem("horizontal_row", "horizontal_row__machine", 3, 8, 12, 90),
    routineItem("lat_pulldown", "lat_pulldown__cable", 3, 8, 12, 90),
    routineItem("overhead_press", "overhead_press__dumbbell", 3, 8, 12, 90),
    routineItem("lateral_raise", "lateral_raise__cable", 3, 12, 20, 60),
    routineItem("biceps_curl", "biceps_curl__cable", 2, 10, 15, 60),
    routineItem("triceps_pushdown", "triceps_pushdown__cable", 2, 10, 15, 60)
  ]),
  template("tpl_lower_hypertrophy", "Lower · Tăng cơ", "Lower · Hypertrophy", "hypertrophy", 4, [
    routineItem("squat", "squat__smith", 3, 6, 10, 150),
    routineItem("romanian_deadlift", "romanian_deadlift__barbell", 3, 6, 10, 150),
    routineItem("leg_press", "leg_press__machine", 3, 10, 15, 120),
    routineItem("leg_curl", "leg_curl__machine", 3, 10, 15, 90),
    routineItem("leg_extension", "leg_extension__machine", 3, 12, 15, 90),
    routineItem("standing_calf_raise", "standing_calf_raise__machine", 3, 10, 15, 60)
  ]),
  template("tpl_strength_a", "Sức mạnh A", "Strength A", "strength", 4, [
    routineItem("squat", "squat__barbell", 4, 3, 6, 180),
    routineItem("chest_press", "chest_press__barbell", 4, 3, 6, 180),
    routineItem("horizontal_row", "horizontal_row__barbell", 3, 5, 8, 120),
    routineItem("romanian_deadlift", "romanian_deadlift__barbell", 3, 5, 8, 150),
    timedRoutineItem("plank", "plank__bodyweight", 3, 45, 60)
  ]),
  template("tpl_strength_b", "Sức mạnh B", "Strength B", "strength", 4, [
    routineItem("deadlift", "deadlift__trap_bar", 3, 3, 5, 180),
    routineItem("overhead_press", "overhead_press__barbell", 4, 3, 6, 180),
    routineItem("pull_up", "pull_up__bodyweight", 3, 5, 8, 120),
    routineItem("split_squat", "split_squat__dumbbell", 3, 6, 10, 120),
    routineItem("farmer_carry", "farmer_carry__dumbbell", 3, 20, 40, 90)
  ]),
  template("tpl_push", "Push · Ngực Vai Tay sau", "Push · Chest Shoulders Triceps", "hypertrophy", 6, [
    routineItem("chest_press", "chest_press__machine", 3, 6, 10, 120),
    routineItem("incline_chest_press", "incline_chest_press__dumbbell", 3, 8, 12, 90),
    routineItem("chest_fly", "chest_fly__cable", 3, 10, 15, 75),
    routineItem("lateral_raise", "lateral_raise__cable", 3, 12, 20, 60),
    routineItem("triceps_pushdown", "triceps_pushdown__cable", 3, 10, 15, 60)
  ], "intermediate"),
  template("tpl_pull", "Pull · Lưng Tay trước", "Pull · Back Biceps", "hypertrophy", 6, [
    routineItem("lat_pulldown", "lat_pulldown__cable", 3, 8, 12, 90),
    routineItem("horizontal_row", "horizontal_row__machine", 3, 8, 12, 90),
    routineItem("one_arm_row", "one_arm_row__dumbbell", 3, 8, 12, 90),
    routineItem("rear_delt_fly", "rear_delt_fly__machine", 3, 12, 20, 60),
    routineItem("biceps_curl", "biceps_curl__dumbbell", 3, 10, 15, 60)
  ], "intermediate"),
  template("tpl_legs", "Legs · Chân Mông", "Legs · Quads Glutes Hamstrings", "hypertrophy", 6, [
    routineItem("squat", "squat__smith", 3, 6, 10, 150),
    routineItem("romanian_deadlift", "romanian_deadlift__barbell", 3, 6, 10, 150),
    routineItem("leg_press", "leg_press__machine", 3, 10, 15, 120),
    routineItem("leg_curl", "leg_curl__machine", 3, 10, 15, 90),
    routineItem("leg_extension", "leg_extension__machine", 3, 12, 15, 90),
    routineItem("standing_calf_raise", "standing_calf_raise__machine", 4, 10, 15, 60)
  ], "intermediate")
];

export function cloneRoutineTemplate(templateId: string): Routine {
  const source = ROUTINE_TEMPLATES.find((routine) => routine.id === templateId);
  if (!source) throw new Error("Routine template not found");
  const timestamp = now();
  return {
    ...structuredClone(source),
    id: createId("routine"),
    sourceTemplateId: source.id,
    items: source.items.map((item) => ({
      ...item,
      id: createId("routine_item"),
      sets: item.sets.map((set) => ({ ...set, id: createId("target") }))
    })),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function sessionExercise(item: RoutineItem) {
  const movement = getMovement(item.movementId);
  const variant = getVariant(item.preferredVariantId);
  if (!movement || !variant) throw new Error(`Invalid routine item: ${item.id}`);
  const trackingProfile = getTrackingProfile(variant.id)
    ?? trackingProfileForLoadMode(variant.id, variant.loadEntryMode);
  return {
    id: createId("session_exercise"),
    movementId: movement.id,
    movementNameSnapshot: movement.name,
    variantId: variant.id,
    variantNameSnapshot: variant.name,
    loadEntryModeSnapshot: variant.loadEntryMode,
    trackingProfileSnapshot: trackingProfile,
    restSeconds: item.restSeconds,
    note: item.note,
    sets: item.sets.map((target) => ({
      id: createId("set"),
      type: target.type,
      targetMinReps: target.minReps,
      targetMaxReps: target.maxReps,
      targetDurationSeconds: target.durationSeconds,
      targetRir: target.targetRir
    }))
  };
}

function exerciseBlock(
  variant: ExerciseVariant,
  options: { setCount?: number; restSeconds?: number; note?: string; setType?: SetType } = {}
): SessionExercise {
  const movement = getMovement(variant.movementId);
  if (!movement) throw new Error("Movement not found");
  const setCount = Math.min(20, Math.max(1, Math.trunc(options.setCount ?? 3)));
  const trackingProfile = getTrackingProfile(variant.id)
    ?? trackingProfileForLoadMode(variant.id, variant.loadEntryMode);
  return {
    id: createId("session_exercise"),
    movementId: movement.id,
    movementNameSnapshot: movement.name,
    variantId: variant.id,
    variantNameSnapshot: variant.name,
    loadEntryModeSnapshot: variant.loadEntryMode,
    trackingProfileSnapshot: trackingProfile,
    sets: Array.from({ length: setCount }, () => ({
      id: createId("set"),
      type: options.setType ?? "working"
    })),
    restSeconds: Math.min(900, Math.max(0, Math.trunc(options.restSeconds ?? 90))),
    note: options.note
  };
}

export function createSessionFromRoutine(routine: Routine, locationId?: string): WorkoutSession {
  const exercises = routine.items.map(sessionExercise);
  return {
    id: createId("session"),
    routineId: routine.id,
    routineNameSnapshot: routine.name,
    locationId,
    startedAt: now(),
    activeExerciseId: exercises[0]?.id,
    exercises
  };
}

export function createFreestyleSession(options: {
  locationId?: string;
  name?: LocalizedText;
  startedAt?: string;
} = {}): WorkoutSession {
  return {
    id: createId("session"),
    routineNameSnapshot: options.name ?? { vi: "Buổi tập tự do", en: "Freestyle workout" },
    locationId: options.locationId,
    startedAt: options.startedAt ?? now(),
    exercises: []
  };
}

export function addExerciseBlock(
  session: WorkoutSession,
  variant: ExerciseVariant,
  options: { setCount?: number; restSeconds?: number; note?: string; setType?: SetType } = {}
): WorkoutSession {
  const updated = structuredClone(session);
  const exercise = exerciseBlock(variant, options);
  updated.exercises.push(exercise);
  updated.activeExerciseId = exercise.id;
  return updated;
}

export function removeExerciseBlock(session: WorkoutSession, exerciseId: string): WorkoutSession {
  const updated = structuredClone(session);
  const index = updated.exercises.findIndex((exercise) => exercise.id === exerciseId);
  if (index < 0) throw new Error("Exercise not found");
  if (updated.exercises[index].sets.some((set) => set.completedAt)) {
    throw new Error("Completed exercise work cannot be removed");
  }
  updated.exercises.splice(index, 1);
  if (updated.activeExerciseId === exerciseId) {
    updated.activeExerciseId = updated.exercises[Math.min(index, updated.exercises.length - 1)]?.id;
  }
  return updated;
}

export function reorderExerciseBlock(session: WorkoutSession, exerciseId: string, toIndex: number): WorkoutSession {
  const updated = structuredClone(session);
  const fromIndex = updated.exercises.findIndex((exercise) => exercise.id === exerciseId);
  if (fromIndex < 0) throw new Error("Exercise not found");
  const targetIndex = Math.min(updated.exercises.length - 1, Math.max(0, Math.trunc(toIndex)));
  if (fromIndex === targetIndex) return updated;
  const [exercise] = updated.exercises.splice(fromIndex, 1);
  updated.exercises.splice(targetIndex, 0, exercise);
  return updated;
}

export function removeSet(session: WorkoutSession, exerciseId: string, setId: string): WorkoutSession {
  const updated = structuredClone(session);
  const exercise = updated.exercises.find((item) => item.id === exerciseId);
  if (!exercise) throw new Error("Exercise not found");
  const index = exercise.sets.findIndex((set) => set.id === setId);
  if (index < 0) throw new Error("Set not found");
  if (exercise.sets.length === 1) throw new Error("An exercise must keep at least one set");
  if (exercise.sets[index].completedAt) throw new Error("A completed set cannot be removed");
  exercise.sets.splice(index, 1);
  return updated;
}

export function updateSet(
  session: WorkoutSession,
  exerciseId: string,
  setId: string,
  values: Partial<Pick<SetLog, "weightKg" | "reps" | "rir" | "rpe" | "durationSeconds" | "distanceMeters" | "type">>,
  complete = false
): WorkoutSession {
  const updated = structuredClone(session);
  const exercise = updated.exercises.find((item) => item.id === exerciseId);
  const set = exercise?.sets.find((item) => item.id === setId);
  if (!exercise || !set) throw new Error("Set not found");
  const normalized = { ...values };
  if (normalized.rir !== undefined) normalized.rir = Number.isFinite(normalized.rir)
    ? Math.min(10, Math.max(0, Math.round(normalized.rir)))
    : undefined;
  if (normalized.rpe !== undefined) normalized.rpe = Number.isFinite(normalized.rpe)
    ? Math.min(10, Math.max(1, Math.round(normalized.rpe)))
    : undefined;
  Object.assign(set, normalized);
  if (complete) {
    set.completedAt = now();
    updated.restTimerEndsAt = new Date(Date.now() + exercise.restSeconds * 1000).toISOString();
  }
  updated.activeExerciseId = exercise.id;
  return updated;
}

export function addSet(session: WorkoutSession, exerciseId: string, type: SetLog["type"] = "working"): WorkoutSession {
  const updated = structuredClone(session);
  const exercise = updated.exercises.find((item) => item.id === exerciseId);
  if (!exercise) throw new Error("Exercise not found");
  exercise.sets.push({ id: createId("set"), type });
  return updated;
}

export function switchExerciseVariant(session: WorkoutSession, exerciseId: string, variant: ExerciseVariant): WorkoutSession {
  const movement = getMovement(variant.movementId);
  if (!movement) throw new Error("Movement not found");
  const updated = structuredClone(session);
  const index = updated.exercises.findIndex((item) => item.id === exerciseId);
  if (index < 0) throw new Error("Exercise not found");
  const current = updated.exercises[index];
  if (current.movementId !== variant.movementId) throw new Error("Variant must belong to the same movement");
  if (current.variantId === variant.id) return updated;
  const trackingProfile = getTrackingProfile(variant.id)
    ?? trackingProfileForLoadMode(variant.id, variant.loadEntryMode);
  const completed = current.sets.filter((set) => set.completedAt);
  const remaining = current.sets.filter((set) => !set.completedAt);
  if (completed.length === 0) {
    current.variantId = variant.id;
    current.variantNameSnapshot = variant.name;
    current.loadEntryModeSnapshot = variant.loadEntryMode;
    current.trackingProfileSnapshot = trackingProfile;
    return updated;
  }
  current.sets = completed;
  const next = {
    ...current,
    id: createId("session_exercise"),
    variantId: variant.id,
    variantNameSnapshot: variant.name,
    loadEntryModeSnapshot: variant.loadEntryMode,
    trackingProfileSnapshot: trackingProfile,
    sets: (remaining.length ? remaining : [{ id: createId("set"), type: "working" as const }]).map((set) => ({
      ...set,
      id: createId("set"),
      completedAt: undefined
    }))
  };
  updated.exercises.splice(index + 1, 0, next);
  updated.activeExerciseId = next.id;
  return updated;
}

export type ProgressionAction =
  | "no_data"
  | "repeat"
  | "increase_load"
  | "decrease_assistance"
  | "increase_reps"
  | "increase_duration"
  | "increase_distance";

export interface ProgressionEvidence {
  sessionId: string;
  finishedAt: string;
  completedWorkingSets: number;
  plannedWorkingSets: number;
  reachedTopTarget: boolean;
}

export interface ProgressionSuggestion {
  variantId: string;
  action: ProgressionAction;
  currentValue?: number;
  suggestedValue?: number;
  unit?: "kg" | "reps" | "seconds" | "meters";
  successStreak: number;
  requiredSuccessSessions: number;
  explanation: LocalizedText;
  evidence: ProgressionEvidence[];
}

interface EvaluatedVariantSession extends ProgressionEvidence {
  direction: NonNullable<SessionExercise["trackingProfileSnapshot"]>["progressDirection"];
  representativeValue?: number;
}

function evaluateVariantSession(session: WorkoutSession, variantId: string): EvaluatedVariantSession | undefined {
  if (!session.finishedAt) return undefined;
  const blocks = session.exercises.filter((exercise) => exercise.variantId === variantId);
  if (!blocks.length) return undefined;
  const profile = blocks[0].trackingProfileSnapshot
    ?? getTrackingProfile(variantId)
    ?? trackingProfileForLoadMode(variantId, blocks[0].loadEntryModeSnapshot);
  const planned = blocks.flatMap((exercise) => exercise.sets.filter((set) => set.type === "working"));
  const completed = planned.filter((set) => Boolean(set.completedAt));
  let reachedTopTarget = planned.length > 0 && completed.length === planned.length;

  if (reachedTopTarget) {
    if (profile.progressDirection === "higher_load" || profile.progressDirection === "lower_assistance" || profile.progressDirection === "higher_reps") {
      reachedTopTarget = completed.every((set) => {
        const top = set.targetMaxReps ?? set.targetMinReps;
        return top !== undefined && (set.reps ?? -1) >= top;
      });
    } else if (profile.progressDirection === "longer_duration") {
      reachedTopTarget = completed.every((set) => set.targetDurationSeconds !== undefined
        && (set.durationSeconds ?? -1) >= set.targetDurationSeconds);
    } else {
      reachedTopTarget = completed.every((set) => (set.distanceMeters ?? 0) > 0);
    }
  }

  const numericValues = profile.progressDirection === "higher_load" || profile.progressDirection === "lower_assistance"
    ? completed.map((set) => set.weightKg).filter((value): value is number => value !== undefined)
    : profile.progressDirection === "higher_reps"
      ? completed.map((set) => set.reps).filter((value): value is number => value !== undefined)
      : profile.progressDirection === "longer_duration"
        ? completed.map((set) => set.durationSeconds).filter((value): value is number => value !== undefined)
        : completed.map((set) => set.distanceMeters).filter((value): value is number => value !== undefined);
  const representativeValue = numericValues.length
    ? (profile.progressDirection === "lower_assistance" ? Math.min(...numericValues) : Math.max(...numericValues))
    : undefined;

  return {
    sessionId: session.id,
    finishedAt: session.finishedAt,
    completedWorkingSets: completed.length,
    plannedWorkingSets: planned.length,
    reachedTopTarget,
    direction: profile.progressDirection,
    representativeValue
  };
}

function rounded(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * Returns an advisory next-session target. It reads finished exact-variant
 * snapshots only and never mutates a routine, active session, or history.
 */
export function suggestDoubleProgression(
  sessions: WorkoutSession[],
  variantId: string,
  rule: ProgressionRule
): ProgressionSuggestion {
  const evaluated = [...sessions]
    .filter((session) => Boolean(session.finishedAt))
    .sort((left, right) => new Date(right.finishedAt!).getTime() - new Date(left.finishedAt!).getTime())
    .map((session) => evaluateVariantSession(session, variantId))
    .filter((entry): entry is EvaluatedVariantSession => Boolean(entry));
  const evidence = evaluated.slice(0, Math.max(3, rule.successSessions)).map((entry) => ({
    sessionId: entry.sessionId,
    finishedAt: entry.finishedAt,
    completedWorkingSets: entry.completedWorkingSets,
    plannedWorkingSets: entry.plannedWorkingSets,
    reachedTopTarget: entry.reachedTopTarget
  }));
  const latest = evaluated[0];
  if (!latest || latest.representativeValue === undefined) {
    return {
      variantId,
      action: "no_data",
      successStreak: 0,
      requiredSuccessSessions: rule.successSessions,
      explanation: {
        vi: "Chưa đủ set chính đã hoàn tất của đúng biến thể này để đưa ra gợi ý.",
        en: "There are not enough completed working sets for this exact variation yet."
      },
      evidence
    };
  }

  let successStreak = 0;
  for (const entry of evaluated) {
    if (!entry.reachedTopTarget || entry.direction !== latest.direction) break;
    successStreak += 1;
  }
  const ready = successStreak >= rule.successSessions;
  const unit = latest.direction === "higher_load" || latest.direction === "lower_assistance"
    ? "kg"
    : latest.direction === "higher_reps"
      ? "reps"
      : latest.direction === "longer_duration"
        ? "seconds"
        : "meters";
  if (!ready) {
    return {
      variantId,
      action: "repeat",
      currentValue: latest.representativeValue,
      suggestedValue: latest.representativeValue,
      unit,
      successStreak,
      requiredSuccessSessions: rule.successSessions,
      explanation: {
        vi: `Giữ mục tiêu hiện tại: ${successStreak}/${rule.successSessions} buổi liên tiếp đã đạt đầu trên của khoảng mục tiêu cho đúng biến thể này.`,
        en: `Keep the current target: ${successStreak}/${rule.successSessions} consecutive sessions reached the top of the target range for this exact variation.`
      },
      evidence
    };
  }

  const current = latest.representativeValue;
  const percent = Math.max(0, rule.fallbackIncreasePercent) / 100;
  const loadIncrement = rule.defaultIncrementKg > 0
    ? rule.defaultIncrementKg
    : Math.max(0.5, rounded(current * percent));
  const action: ProgressionAction = latest.direction === "higher_load"
    ? "increase_load"
    : latest.direction === "lower_assistance"
      ? "decrease_assistance"
      : latest.direction === "higher_reps"
        ? "increase_reps"
        : latest.direction === "longer_duration"
          ? "increase_duration"
          : "increase_distance";
  const suggestedValue = latest.direction === "higher_load"
    ? rounded(current + loadIncrement)
    : latest.direction === "lower_assistance"
      ? rounded(Math.max(0, current - loadIncrement))
      : latest.direction === "higher_reps"
        ? Math.ceil(current + Math.max(1, current * percent))
        : latest.direction === "longer_duration"
          ? Math.ceil(current + Math.max(5, current * percent))
          : Math.ceil(current + Math.max(10, current * percent));
  const directionText = action === "decrease_assistance"
    ? { vi: "giảm trợ lực", en: "reduce assistance" }
    : action === "increase_load"
      ? { vi: "tăng tải", en: "increase load" }
      : action === "increase_reps"
        ? { vi: "tăng số lần", en: "increase reps" }
        : action === "increase_duration"
          ? { vi: "tăng thời gian", en: "increase duration" }
          : { vi: "tăng quãng đường", en: "increase distance" };
  return {
    variantId,
    action,
    currentValue: current,
    suggestedValue,
    unit,
    successStreak,
    requiredSuccessSessions: rule.successSessions,
    explanation: {
      vi: `${successStreak} buổi liên tiếp đạt đầu trên của khoảng mục tiêu; có thể ${directionText.vi} từ ${current} ${action === "decrease_assistance" ? "xuống" : "lên"} ${suggestedValue} ${unit}.`,
      en: `${successStreak} consecutive sessions reached the top of the target range; ${directionText.en} from ${current} to ${suggestedValue} ${unit}.`
    },
    evidence
  };
}

export interface PlateLoadingGuide {
  targetTotalKg: number;
  barWeightKg: number;
  targetPerSideKg: number;
  platesPerSideKg: number[];
  achievedTotalKg: number;
  remainderKg: number;
  exact: boolean;
}

/** Calculates a non-mutating, paired-plate breakdown for a total bar load. */
export function calculatePlateLoading(
  totalWeightKg: number,
  options: { barWeightKg?: number; availablePlateKg?: number[] } = {}
): PlateLoadingGuide {
  const barWeightKg = options.barWeightKg ?? 20;
  if (!Number.isFinite(totalWeightKg) || totalWeightKg < 0 || !Number.isFinite(barWeightKg) || barWeightKg < 0) {
    throw new Error("Plate loading values must be finite and non-negative");
  }
  const available = [...new Set(options.availablePlateKg ?? [25, 20, 15, 10, 5, 2.5, 1.25, 0.5])]
    .filter((plate) => Number.isFinite(plate) && plate > 0)
    .sort((left, right) => right - left);
  const targetPerSideKg = Math.max(0, (totalWeightKg - barWeightKg) / 2);
  let remaining = targetPerSideKg;
  const platesPerSideKg: number[] = [];
  for (const plate of available) {
    const count = Math.floor((remaining + 1e-9) / plate);
    for (let index = 0; index < count; index += 1) platesPerSideKg.push(plate);
    remaining = rounded(remaining - count * plate, 3);
  }
  const loadedPerSide = rounded(platesPerSideKg.reduce((sum, plate) => sum + plate, 0), 3);
  const achievedTotalKg = rounded(barWeightKg + loadedPerSide * 2, 3);
  const remainderKg = rounded(totalWeightKg - achievedTotalKg, 3);
  return {
    targetTotalKg: totalWeightKg,
    barWeightKg,
    targetPerSideKg: rounded(targetPerSideKg, 3),
    platesPerSideKg,
    achievedTotalKg,
    remainderKg,
    exact: Math.abs(remainderKg) < 0.001
  };
}

export function finishSession(session: WorkoutSession): WorkoutSession {
  return { ...session, finishedAt: now(), restTimerEndsAt: undefined };
}

export function sessionProgress(session: WorkoutSession): { completed: number; total: number; percent: number } {
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const completed = sets.filter((set) => set.completedAt).length;
  return { completed, total: sets.length, percent: sets.length ? Math.round((completed / sets.length) * 100) : 0 };
}

export function localizeName(name: LocalizedText, locale: "vi" | "en"): string {
  return name[locale];
}
