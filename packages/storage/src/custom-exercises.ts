import { CUSTOM_MOVEMENT_ID_PREFIX, CUSTOM_VARIANT_ID_PREFIX, type ExerciseVariant, type Movement } from "@gym/contracts";
import { gymDb, type GymDatabase } from "./index";

export async function saveCustomExercise(movement: Movement, variant: ExerciseVariant, db: GymDatabase = gymDb): Promise<void> {
  if (!movement.id.startsWith(CUSTOM_MOVEMENT_ID_PREFIX) || !variant.id.startsWith(CUSTOM_VARIANT_ID_PREFIX)) {
    throw new Error("Custom exercise IDs must not collide with catalog IDs");
  }
  if (variant.movementId !== movement.id) throw new Error("Custom exercise variant does not belong to its movement");
  if (!movement.name.vi.trim() || !movement.name.en.trim()) throw new Error("Custom exercise name is required");
  await db.transaction("rw", db.customMovements, db.customVariants, async () => {
    await db.customMovements.put(movement);
    await db.customVariants.put(variant);
  });
}

/**
 * Routines must drop the exercise first. An exercise that was logged is kept as `deprecated` instead of removed,
 * so muscle totals and trends of past sessions still resolve it. Resolves to true when it was kept.
 */
export async function deleteCustomExercise(movementId: string, db: GymDatabase = gymDb): Promise<boolean> {
  return db.transaction("rw", db.customMovements, db.customVariants, db.routines, db.sessions, db.settings, async () => {
    const routines = await db.routines.toArray();
    if (routines.some((routine) => routine.items.some((item) => item.movementId === movementId))) {
      throw new Error("Custom exercise is used by a routine");
    }
    const settings = await db.settings.get("app");
    const active = settings?.activeSessionId ? await db.sessions.get(settings.activeSessionId) : undefined;
    if (active && !active.finishedAt && active.exercises.some((exercise) => exercise.movementId === movementId)) {
      throw new Error("Custom exercise is used by the active workout");
    }
    const logged = (await db.sessions.toArray()).some((session) => session.exercises.some((exercise) => exercise.movementId === movementId));
    if (logged) {
      await db.customMovements.update(movementId, { reviewStatus: "deprecated" });
      await db.customVariants.where("movementId").equals(movementId).modify({ reviewStatus: "deprecated" });
      return true;
    }
    await db.customVariants.where("movementId").equals(movementId).delete();
    await db.customMovements.delete(movementId);
    return false;
  });
}
