import type { WorkoutSession } from "@gym/contracts";
import { assertFiniteRecord, gymDb, queueSessionWrite, type GymDatabase } from "./index";

/**
 * Rewrites a workout that is already finished. The active-session pointer and
 * program day are left alone, so correcting history never disturbs a live workout.
 */
export async function updateFinishedSession(session: WorkoutSession, db: GymDatabase = gymDb): Promise<void> {
  assertFiniteRecord(session, "session");
  await queueSessionWrite(() => db.transaction("rw", db.sessions, async () => {
    const existing = await db.sessions.get(session.id);
    if (!existing?.finishedAt || !session.finishedAt) throw new Error("Only finished workouts can be edited");
    if (session.finishedAt < session.startedAt) throw new Error("Workout cannot finish before it starts");
    await db.sessions.put(session);
  }));
}

/** Deletes one finished workout. An unfinished workout must be finished first. */
export async function deleteFinishedSession(id: string, db: GymDatabase = gymDb): Promise<void> {
  await queueSessionWrite(() => db.transaction("rw", db.sessions, async () => {
    const existing = await db.sessions.get(id);
    if (existing && !existing.finishedAt) throw new Error("An unfinished workout cannot be deleted");
    await db.sessions.delete(id);
  }));
}

export async function deleteBodyMetric(id: string, db: GymDatabase = gymDb): Promise<void> {
  await db.bodyMetrics.delete(id);
}
