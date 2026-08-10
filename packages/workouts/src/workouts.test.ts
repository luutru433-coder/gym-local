import { describe, expect, it } from "vitest";
import { getVariant } from "@gym/catalog";
import { cloneRoutineTemplate, createSessionFromRoutine, switchExerciseVariant, updateSet } from "./index";

describe("workout sessions", () => {
  it("snapshots the exact preferred variant", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const session = createSessionFromRoutine(routine);
    expect(session.exercises[0].variantId).toBe("squat__dumbbell");
    expect(session.exercises[0].sets[0]).toMatchObject({ targetMinReps: 8, targetMaxReps: 12, targetRir: 2 });
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
});
