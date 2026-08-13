import { describe, expect, it } from "vitest";
import { getVariant } from "@gym/catalog";
import {
  addExerciseBlock,
  calculatePlateLoading,
  cloneRoutineTemplate,
  createFreestyleSession,
  createSessionFromRoutine,
  removeExerciseBlock,
  removeSet,
  reorderExerciseBlock,
  suggestDoubleProgression,
  switchExerciseVariant,
  updateSet
} from "./index";

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

  it("creates freestyle sessions and snapshots newly added exact variants", () => {
    const freestyle = createFreestyleSession({
      locationId: "home",
      startedAt: "2026-08-13T10:00:00.000Z"
    });
    const updated = addExerciseBlock(freestyle, getVariant("chest_press__machine")!, {
      setCount: 4,
      restSeconds: 120
    });

    expect(freestyle.exercises).toEqual([]);
    expect(updated).toMatchObject({ locationId: "home", routineNameSnapshot: { en: "Freestyle workout" } });
    expect(updated.exercises[0]).toMatchObject({
      movementId: "chest_press",
      variantId: "chest_press__machine",
      restSeconds: 120,
      trackingProfileSnapshot: { variantId: "chest_press__machine" }
    });
    expect(updated.exercises[0].sets).toHaveLength(4);
  });

  it("reorders unfinished blocks but never destructively removes completed work", () => {
    let session = createFreestyleSession();
    session = addExerciseBlock(session, getVariant("chest_press__machine")!);
    session = addExerciseBlock(session, getVariant("horizontal_row__cable")!);
    const [press, row] = session.exercises;

    const reordered = reorderExerciseBlock(session, row.id, 0);
    expect(reordered.exercises.map((exercise) => exercise.id)).toEqual([row.id, press.id]);
    expect(session.exercises.map((exercise) => exercise.id)).toEqual([press.id, row.id]);

    const completed = updateSet(session, press.id, press.sets[0].id, { weightKg: 40, reps: 10 }, true);
    expect(() => removeExerciseBlock(completed, press.id)).toThrow("Completed exercise work cannot be removed");
    const withoutRow = removeExerciseBlock(completed, row.id);
    expect(withoutRow.exercises).toHaveLength(1);
    expect(withoutRow.exercises[0].id).toBe(press.id);
  });

  it("removes only unfinished non-final sets", () => {
    let session = createFreestyleSession();
    session = addExerciseBlock(session, getVariant("chest_press__dumbbell")!, { setCount: 2 });
    const exercise = session.exercises[0];
    const completed = updateSet(session, exercise.id, exercise.sets[0].id, { weightKg: 20, reps: 10 }, true);

    expect(() => removeSet(completed, exercise.id, exercise.sets[0].id)).toThrow("completed set");
    const oneSet = removeSet(completed, exercise.id, exercise.sets[1].id);
    expect(oneSet.exercises[0].sets).toHaveLength(1);
    expect(() => removeSet(oneSet, exercise.id, oneSet.exercises[0].sets[0].id)).toThrow("at least one set");
  });

  it("suggests load progression only from consecutive exact-variant completed working sets", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const buildFinished = (id: string, finishedAt: string, variantId: string, reps: number) => {
      let session = createSessionFromRoutine(routine);
      const exercise = session.exercises.find((item) => item.movementId === "chest_press")!;
      session = switchExerciseVariant(session, exercise.id, getVariant(variantId)!);
      const block = session.exercises.find((item) => item.variantId === variantId)!;
      block.sets.forEach((set) => {
        session = updateSet(session, block.id, set.id, { weightKg: 20, reps }, true);
      });
      return { ...session, id, finishedAt };
    };
    const dumbbellOne = buildFinished("db_1", "2026-08-10T10:00:00.000Z", "chest_press__dumbbell", 12);
    const machine = buildFinished("machine", "2026-08-11T10:00:00.000Z", "chest_press__machine", 12);
    const dumbbellTwo = buildFinished("db_2", "2026-08-12T10:00:00.000Z", "chest_press__dumbbell", 12);
    const unfinished = { ...buildFinished("active", "2026-08-13T10:00:00.000Z", "chest_press__dumbbell", 12), finishedAt: undefined };

    const suggestion = suggestDoubleProgression(
      [machine, dumbbellOne, unfinished, dumbbellTwo],
      "chest_press__dumbbell",
      { type: "double_progression", successSessions: 2, defaultIncrementKg: 2.5, fallbackIncreasePercent: 5 }
    );

    expect(suggestion).toMatchObject({
      variantId: "chest_press__dumbbell",
      action: "increase_load",
      currentValue: 20,
      suggestedValue: 22.5,
      successStreak: 2
    });
    expect(suggestion.evidence.map((entry) => entry.sessionId)).toEqual(["db_2", "db_1"]);
  });

  it("ignores warmups and incomplete work when evaluating progression", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    let session = createSessionFromRoutine(routine);
    const exercise = session.exercises.find((item) => item.variantId === "chest_press__dumbbell")!;
    session = updateSet(session, exercise.id, exercise.sets[0].id, { weightKg: 20, reps: 12, type: "warmup" }, true);
    session = updateSet(session, exercise.id, exercise.sets[1].id, { weightKg: 20, reps: 12 }, true);
    const suggestion = suggestDoubleProgression(
      [{ ...session, finishedAt: "2026-08-12T10:00:00.000Z" }],
      exercise.variantId,
      { type: "double_progression", successSessions: 1, defaultIncrementKg: 2.5, fallbackIncreasePercent: 5 }
    );

    expect(suggestion.action).toBe("repeat");
    expect(suggestion.successStreak).toBe(0);
    expect(suggestion.evidence[0]).toMatchObject({ completedWorkingSets: 1, plannedWorkingSets: 2, reachedTopTarget: false });
  });

  it("reduces assistance after a successful exact-variant streak", () => {
    let session = addExerciseBlock(createFreestyleSession(), getVariant("pull_up__machine")!, { setCount: 2 });
    const assisted = session.exercises[0];
    const targetSetIds = assisted.sets.map((set) => {
      set.targetMinReps = 8;
      set.targetMaxReps = 10;
      return set.id;
    });
    targetSetIds.forEach((setId) => {
      session = updateSet(session, assisted.id, setId, { weightKg: 30, reps: 10 }, true);
    });
    const suggestion = suggestDoubleProgression(
      [{ ...session, finishedAt: "2026-08-12T10:00:00.000Z" }],
      assisted.variantId,
      { type: "double_progression", successSessions: 1, defaultIncrementKg: 5, fallbackIncreasePercent: 5 }
    );
    expect(suggestion).toMatchObject({ action: "decrease_assistance", currentValue: 30, suggestedValue: 25 });
  });

  it("calculates a paired plate guide without altering the entered total", () => {
    expect(calculatePlateLoading(100)).toEqual({
      targetTotalKg: 100,
      barWeightKg: 20,
      targetPerSideKg: 40,
      platesPerSideKg: [25, 15],
      achievedTotalKg: 100,
      remainderKg: 0,
      exact: true
    });
    expect(calculatePlateLoading(101, { availablePlateKg: [20, 10, 5, 2.5, 1.25] })).toMatchObject({
      targetTotalKg: 101,
      achievedTotalKg: 100,
      remainderKg: 1,
      exact: false
    });
  });
});
