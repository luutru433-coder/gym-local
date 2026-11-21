import { describe, expect, it } from "vitest";
import { cloneRoutineTemplate, createSessionFromRoutine, updateSet } from "./index";
import { advanceSuperset, linkSupersetWithNext, nextInSupersetRound, restingExercise, supersetMembers, unlinkSuperset } from "./superset";

function pairedSession() {
  const routine = cloneRoutineTemplate("tpl_full_body_a");
  routine.items[0].supersetGroup = "A";
  routine.items[1].supersetGroup = "A";
  return createSessionFromRoutine(routine);
}

function complete(session: ReturnType<typeof pairedSession>, exerciseIndex: number, setIndex: number) {
  const exercise = session.exercises[exerciseIndex];
  return advanceSuperset(updateSet(session, exercise.id, exercise.sets[setIndex].id, { reps: 10 }, true), exercise.id);
}

describe("supersets", () => {
  it("copies the routine's superset label into the live session", () => {
    const session = pairedSession();
    expect(session.exercises.map((exercise) => exercise.supersetGroup)).toEqual(["A", "A", undefined, undefined, undefined, undefined]);
    expect(supersetMembers(session, session.exercises[1].id)).toHaveLength(2);
    expect(supersetMembers(session, session.exercises[2].id)).toEqual([]);
  });

  it("alternates sets with no rest and rests only after the round", () => {
    let session = pairedSession();
    const [first, second] = session.exercises;
    session = complete(session, 0, 0);
    expect(session.restTimerEndsAt).toBeUndefined();
    expect(session.activeExerciseId).toBe(second.id);
    session = complete(session, 1, 0);
    expect(session.restTimerEndsAt).toBeDefined();
    expect(session.activeExerciseId).toBe(first.id);
    expect(nextInSupersetRound(session, first.id)?.id).toBe(second.id);
    expect(restingExercise(session)?.id).toBe(second.id);
  });

  it("rests after every set once the other member has no sets left", () => {
    let session = pairedSession();
    session.exercises[1].sets = session.exercises[1].sets.slice(0, 1);
    session = complete(session, 0, 0);
    session = complete(session, 1, 0);
    session = complete(session, 0, 1);
    expect(session.restTimerEndsAt).toBeDefined();
    expect(session.activeExerciseId).toBe(session.exercises[0].id);
  });

  it("leaves ungrouped exercises on the normal rest timer", () => {
    const session = complete(pairedSession(), 2, 0);
    expect(session.restTimerEndsAt).toBeDefined();
    expect(session.activeExerciseId).toBe(session.exercises[2].id);
  });

  it("groups with the next exercise, merges groups, and dissolves a group of one", () => {
    let session = createSessionFromRoutine(cloneRoutineTemplate("tpl_full_body_a"));
    const ids = session.exercises.map((exercise) => exercise.id);
    session = linkSupersetWithNext(session, ids[0]);
    session = linkSupersetWithNext(session, ids[2]);
    expect(session.exercises.slice(0, 4).map((exercise) => exercise.supersetGroup)).toEqual(["A", "A", "B", "B"]);
    session = linkSupersetWithNext(session, ids[1]);
    expect(session.exercises.slice(0, 4).map((exercise) => exercise.supersetGroup)).toEqual(["A", "A", "A", "A"]);
    session = unlinkSuperset(session, ids[3]);
    session = unlinkSuperset(session, ids[2]);
    session = unlinkSuperset(session, ids[1]);
    expect(session.exercises.every((exercise) => exercise.supersetGroup === undefined)).toBe(true);
    expect(() => linkSupersetWithNext(session, ids.at(-1)!)).toThrow();
  });
});
