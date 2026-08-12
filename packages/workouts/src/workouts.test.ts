import { describe, expect, it } from "vitest";
import { getVariant } from "@gym/catalog";
import { cloneRoutineTemplate, createSessionFromRoutine, switchExerciseVariant, updateSet } from "./index";

describe("workout sessions", () => {
  it("snapshots the exact preferred variant", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const session = createSessionFromRoutine(routine);
    expect(session.exercises[0].variantId).toBe("squat__dumbbell");
    expect(session.exercises[0].sets[0]).toMatchObject({ targetMinReps: 8, targetMaxReps: 12, targetRir: 2 });
    expect(session.exercises[0].trackingProfileSnapshot).toMatchObject({ variantId: "squat__dumbbell" });
  });

  it("snapshots plank as a timed target", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const session = createSessionFromRoutine(routine);
    const plank = session.exercises.find((exercise) => exercise.variantId === "plank__bodyweight")!;
    expect(plank.trackingProfileSnapshot).toMatchObject({ effortKind: "duration" });
    expect(plank.sets[0]).toMatchObject({ targetDurationSeconds: 30, targetRir: 2 });
    expect(plank.sets[0].targetMinReps).toBeUndefined();
  });

  it("creates a new block when switching after a completed set", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    let session = createSessionFromRoutine(routine);
    const exercise = session.exercises.find((item) => item.movementId === "chest_press")!;
    session = updateSet(session, exercise.id, exercise.sets[0].id, { weightKg: 10, reps: 10 }, true);
    session = switchExerciseVariant(session, exercise.id, getVariant("chest_press__cable")!);
    const chestBlocks = session.exercises.filter((item) => item.movementId === "chest_press");
    expect(chestBlocks).toHaveLength(2);
    expect(chestBlocks.map((item) => item.variantId)).toEqual(["chest_press__dumbbell", "chest_press__cable"]);
    expect(chestBlocks[0].sets).toHaveLength(1);
  });

  it("does not create a new block when selecting the current variant", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    let session = createSessionFromRoutine(routine);
    const exercise = session.exercises.find((item) => item.movementId === "chest_press")!;
    session = updateSet(session, exercise.id, exercise.sets[0].id, { weightKg: 10, reps: 10 }, true);
    const updated = switchExerciseVariant(session, exercise.id, getVariant(exercise.variantId)!);
    expect(updated.exercises).toHaveLength(session.exercises.length);
    expect(updated.exercises.find((item) => item.id === exercise.id)?.sets).toHaveLength(3);
  });

  it("clamps RIR to 0–10 and RPE to 1–10", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const session = createSessionFromRoutine(routine);
    const exercise = session.exercises[0];
    const updated = updateSet(session, exercise.id, exercise.sets[0].id, { rir: 99, rpe: 0 });
    expect(updated.exercises[0].sets[0]).toMatchObject({ rir: 10, rpe: 1 });
  });
});
