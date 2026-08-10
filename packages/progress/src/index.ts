import type { MuscleGroup, WorkoutSession } from "@gym/contracts";
import { getMovement } from "@gym/catalog";

export function estimatedOneRepMax(weightKg: number, reps: number): number | undefined {
  if (weightKg <= 0 || reps < 1 || reps > 10) return undefined;
  return Math.round((weightKg * (1 + reps / 30)) * 10) / 10;
}

export function variantHistory(sessions: WorkoutSession[], variantId: string) {
  return sessions.flatMap((session) => session.exercises
    .filter((exercise) => exercise.variantId === variantId)
    .flatMap((exercise) => exercise.sets
      .filter((set) => set.completedAt && set.type !== "warmup")
      .map((set) => ({
        sessionId: session.id,
        date: session.finishedAt ?? session.startedAt,
        weightKg: set.weightKg,
        reps: set.reps,
        durationSeconds: set.durationSeconds,
        distanceMeters: set.distanceMeters,
        e1rm: set.weightKg && set.reps ? estimatedOneRepMax(set.weightKg, set.reps) : undefined
      }))));
}

export function personalRecord(sessions: WorkoutSession[], variantId: string) {
  const history = variantHistory(sessions, variantId);
  return history.reduce<{ maxWeightKg: number; maxE1rm: number }>((best, entry) => ({
    maxWeightKg: Math.max(best.maxWeightKg, entry.weightKg ?? 0),
    maxE1rm: Math.max(best.maxE1rm, entry.e1rm ?? 0)
  }), { maxWeightKg: 0, maxE1rm: 0 });
}

export function weeklyMuscleSets(sessions: WorkoutSession[], weekStart: Date): Partial<Record<MuscleGroup, number>> {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  const result: Partial<Record<MuscleGroup, number>> = {};
  sessions.filter((session) => {
    const date = new Date(session.finishedAt ?? session.startedAt);
    return date >= weekStart && date < end;
  }).forEach((session) => {
    session.exercises.forEach((exercise) => {
      const movement = getMovement(exercise.movementId);
      if (!movement) return;
      const workingSets = exercise.sets.filter((set) => set.completedAt && set.type !== "warmup").length;
      movement.primaryMuscles.forEach((muscle) => {
        result[muscle] = (result[muscle] ?? 0) + workingSets;
      });
    });
  });
  return result;
}
