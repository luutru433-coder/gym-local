import type { SessionExercise, SetLog, WorkoutSession } from "@gym/contracts";

export interface SetRef {
  exercise: SessionExercise;
  set: SetLog;
  /** 1-based position of the set in its block. */
  setNumber: number;
}

function ref(exercise: SessionExercise, set: SetLog): SetRef {
  return { exercise, set, setNumber: exercise.sets.indexOf(set) + 1 };
}

const secondsBetween = (from: string, to: number) => Math.max(0, Math.round((to - new Date(from).getTime()) / 1000));

/** The set that was started and not ended yet. */
export function runningSet(session: WorkoutSession): SetRef | undefined {
  for (const exercise of session.exercises) {
    const set = exercise.sets.find((item) => item.startedAt && !item.completedAt);
    if (set) return ref(exercise, set);
  }
  return undefined;
}

/** The set to do next: the first open set of the active block, else of the first block that has one. */
export function nextOpenSet(session: WorkoutSession): SetRef | undefined {
  const active = session.exercises.find((exercise) => exercise.id === session.activeExerciseId);
  for (const exercise of active ? [active, ...session.exercises] : session.exercises) {
    const set = exercise.sets.find((item) => !item.completedAt);
    if (set) return ref(exercise, set);
  }
  return undefined;
}

/** The most recently finished set of the session. */
export function lastFinishedSet(session: WorkoutSession): SetRef | undefined {
  let latest: SetRef | undefined;
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (set.completedAt && (!latest || set.completedAt >= latest.set.completedAt!)) latest = ref(exercise, set);
    }
  }
  return latest;
}

/**
 * Starts a set: stamps `startedAt`, records the rest actually taken since the last finished set,
 * and stops the rest countdown. Any other running set is put back to "not started".
 */
export function startSet(session: WorkoutSession, exerciseId: string, setId: string, at = Date.now()): WorkoutSession {
  const updated = structuredClone(session);
  const exercise = updated.exercises.find((item) => item.id === exerciseId);
  const set = exercise?.sets.find((item) => item.id === setId);
  if (!exercise || !set) throw new Error("Set not found");
  if (set.completedAt) throw new Error("A completed set cannot be started");
  for (const block of updated.exercises) {
    for (const other of block.sets) {
      if (other !== set && other.startedAt && !other.completedAt) {
        delete other.startedAt;
        delete other.restBeforeSeconds;
      }
    }
  }
  const previous = lastFinishedSet(updated);
  set.startedAt = new Date(at).toISOString();
  if (previous) set.restBeforeSeconds = secondsBetween(previous.set.completedAt!, at);
  else delete set.restBeforeSeconds;
  updated.activeExerciseId = exercise.id;
  updated.restTimerEndsAt = undefined;
  return updated;
}

/** Puts a running set back to "not started" without logging it. */
export function cancelRunningSet(session: WorkoutSession): WorkoutSession {
  const updated = structuredClone(session);
  for (const exercise of updated.exercises) {
    for (const set of exercise.sets) {
      if (set.startedAt && !set.completedAt) {
        delete set.startedAt;
        delete set.restBeforeSeconds;
      }
    }
  }
  return updated;
}

/** Seconds a running set has lasted so far. */
export function runningSeconds(set: SetLog, at = Date.now()): number {
  return set.startedAt ? secondsBetween(set.startedAt, at) : 0;
}

/**
 * Call on the session returned by completing a set (`updateSet(..., true)`): stores how long the
 * set took when it had been started. A set completed without a start keeps no timing.
 */
export function stampWorkSeconds(session: WorkoutSession, exerciseId: string, setId: string): WorkoutSession {
  const updated = structuredClone(session);
  const set = updated.exercises.find((item) => item.id === exerciseId)?.sets.find((item) => item.id === setId);
  if (!set?.completedAt) return session;
  if (set.startedAt) set.workSeconds = secondsBetween(set.startedAt, new Date(set.completedAt).getTime());
  else {
    delete set.workSeconds;
    delete set.restBeforeSeconds;
  }
  return updated;
}

/** Undoes a completed set: it becomes open again, with no timing and no rest countdown. */
export function reopenSet(session: WorkoutSession, exerciseId: string, setId: string): WorkoutSession {
  const updated = structuredClone(session);
  const set = updated.exercises.find((item) => item.id === exerciseId)?.sets.find((item) => item.id === setId);
  if (!set) throw new Error("Set not found");
  set.completedAt = undefined;
  delete set.startedAt;
  delete set.workSeconds;
  delete set.restBeforeSeconds;
  updated.restTimerEndsAt = undefined;
  return updated;
}

/** Average set time and average real rest over the finished sets that were timed. */
export function timingSummary(session: WorkoutSession): { timedSets: number; averageWorkSeconds?: number; averageRestSeconds?: number } {
  const sets = session.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completedAt);
  const work = sets.map((set) => set.workSeconds).filter((value): value is number => value !== undefined);
  const rest = sets.map((set) => set.restBeforeSeconds).filter((value): value is number => value !== undefined);
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : undefined;
  return { timedSets: work.length, averageWorkSeconds: average(work), averageRestSeconds: average(rest) };
}
