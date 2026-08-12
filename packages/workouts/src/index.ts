import { createId, type ExerciseVariant, type LocalizedText, type Routine, type RoutineItem, type SetLog, type WorkoutSession } from "@gym/contracts";
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
