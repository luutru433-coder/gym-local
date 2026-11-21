import type { SessionExercise, WorkoutSession } from "@gym/contracts";

const hasOpenSet = (exercise: SessionExercise) => exercise.sets.some((set) => !set.completedAt);

/** Blocks sharing a superset label, in workout order; empty when the block is not in a superset. */
export function supersetMembers(session: WorkoutSession, exerciseId: string): SessionExercise[] {
  const group = session.exercises.find((exercise) => exercise.id === exerciseId)?.supersetGroup;
  if (!group) return [];
  const members = session.exercises.filter((exercise) => exercise.supersetGroup === group);
  return members.length > 1 ? members : [];
}

/**
 * The block to do right after a set of `exerciseId`, without resting: the next superset member
 * later in the round that still has an open set. Undefined when the round is over.
 */
export function nextInSupersetRound(session: WorkoutSession, exerciseId: string): SessionExercise | undefined {
  const members = supersetMembers(session, exerciseId);
  const index = members.findIndex((exercise) => exercise.id === exerciseId);
  return members.slice(index + 1).find(hasOpenSet);
}

/**
 * Call on the session returned by completing a set. Inside a superset it moves to the next
 * member with no rest; after the last member the rest timer of the completed block stays and
 * the first member with an open set becomes active for the next round.
 */
export function advanceSuperset(session: WorkoutSession, exerciseId: string): WorkoutSession {
  const members = supersetMembers(session, exerciseId);
  if (!members.length) return session;
  const next = nextInSupersetRound(session, exerciseId);
  if (next) return { ...session, activeExerciseId: next.id, restTimerEndsAt: undefined };
  const roundStart = members.find(hasOpenSet);
  return roundStart ? { ...session, activeExerciseId: roundStart.id } : session;
}

function freeGroupLabel(session: WorkoutSession): string {
  const used = new Set(session.exercises.map((exercise) => exercise.supersetGroup));
  for (let code = 65; code <= 90; code += 1) {
    const label = String.fromCharCode(code);
    if (!used.has(label)) return label;
  }
  return `S${used.size + 1}`;
}

/** Groups a block with the one after it; existing groups on either side are merged. */
export function linkSupersetWithNext(session: WorkoutSession, exerciseId: string): WorkoutSession {
  const updated = structuredClone(session);
  const index = updated.exercises.findIndex((exercise) => exercise.id === exerciseId);
  const current = updated.exercises[index];
  const next = updated.exercises[index + 1];
  if (!current || !next) throw new Error("No following exercise to group with");
  const label = current.supersetGroup ?? next.supersetGroup ?? freeGroupLabel(updated);
  const absorbed = next.supersetGroup;
  for (const exercise of updated.exercises) {
    if (exercise === current || exercise === next || (absorbed && exercise.supersetGroup === absorbed)) {
      exercise.supersetGroup = label;
    }
  }
  return updated;
}

/** Takes a block out of its superset; a group left with one block is dissolved. */
export function unlinkSuperset(session: WorkoutSession, exerciseId: string): WorkoutSession {
  const updated = structuredClone(session);
  const current = updated.exercises.find((exercise) => exercise.id === exerciseId);
  if (!current) throw new Error("Exercise not found");
  const group = current.supersetGroup;
  delete current.supersetGroup;
  if (!group) return updated;
  const rest = updated.exercises.filter((exercise) => exercise.supersetGroup === group);
  if (rest.length === 1) delete rest[0].supersetGroup;
  return updated;
}
