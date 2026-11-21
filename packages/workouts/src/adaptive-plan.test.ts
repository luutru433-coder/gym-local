import { describe, expect, it } from "vitest";
import { getVariant } from "@gym/catalog";
import type { ProgressionRule, Routine, WorkoutSession } from "@gym/contracts";
import { createAdaptiveSessionFromRoutine, planAdaptiveSession, planTrainingWeek } from "./adaptive-plan";
import { cloneRoutineTemplate, createSessionFromRoutine, switchExerciseVariant, updateSet } from "./index";

const rule: ProgressionRule = { type: "double_progression", successSessions: 2, defaultIncrementKg: 2.5, fallbackIncreasePercent: 5 };
const PRESS = "chest_press__dumbbell";

function finished(routine: Routine, id: string, finishedAt: string, reps: number, weightKg = 20, variantId = PRESS): WorkoutSession {
  let session = createSessionFromRoutine(routine);
  const exercise = session.exercises.find((item) => item.movementId === "chest_press")!;
  session = switchExerciseVariant(session, exercise.id, getVariant(variantId)!);
  const block = session.exercises.find((item) => item.variantId === variantId)!;
  block.sets.forEach((set) => {
    session = updateSet(session, block.id, set.id, { weightKg, reps }, true);
  });
  return { ...session, id, finishedAt };
}

const pressItem = (routine: Routine) => routine.items.find((item) => item.movementId === "chest_press")!;

describe("adaptive session plan", () => {
  it("raises the load after the success streak and prefills only the new session", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const before = structuredClone(routine);
    const history = [
      finished(routine, "a", "2026-08-10T10:00:00.000Z", 12),
      finished(routine, "machine", "2026-08-11T10:00:00.000Z", 12, 60, "chest_press__machine"),
      finished(routine, "b", "2026-08-12T10:00:00.000Z", 12)
    ];
    const historyBefore = structuredClone(history);
    const plan = planAdaptiveSession(routine, history, rule, new Date("2026-08-14T10:00:00.000Z"));
    const press = plan.items.find((item) => item.itemId === pressItem(routine).id)!;

    expect(plan.readiness).toBe("on_track");
    expect(press).toMatchObject({ action: "progress", previousLoadKg: 20, loadKg: 22.5 });

    const session = createAdaptiveSessionFromRoutine(routine, plan);
    const block = session.exercises.find((item) => item.variantId === PRESS)!;
    expect(block.sets.every((set) => set.weightKg === 22.5 && !set.completedAt && set.reps === undefined)).toBe(true);
    expect(routine).toEqual(before);
    expect(history).toEqual(historyBefore);
  });

  it("holds the load until the streak is met and ignores other equipment", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const history = [
      finished(routine, "machine", "2026-08-10T10:00:00.000Z", 12, 60, "chest_press__machine"),
      finished(routine, "a", "2026-08-12T10:00:00.000Z", 12)
    ];
    const press = planAdaptiveSession(routine, history, rule, new Date("2026-08-14T10:00:00.000Z"))
      .items.find((item) => item.itemId === pressItem(routine).id)!;
    expect(press).toMatchObject({ action: "hold", loadKg: 20 });
  });

  it("reduces the load after two sessions under the minimum target", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const history = [
      finished(routine, "a", "2026-08-10T10:00:00.000Z", 5),
      finished(routine, "b", "2026-08-12T10:00:00.000Z", 6)
    ];
    const press = planAdaptiveSession(routine, history, rule, new Date("2026-08-14T10:00:00.000Z"))
      .items.find((item) => item.itemId === pressItem(routine).id)!;
    expect(press).toMatchObject({ action: "reduce", previousLoadKg: 20, loadKg: 18 });
  });

  it("eases back after a break and drops a set after a long break", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const history = [
      finished(routine, "a", "2026-08-10T10:00:00.000Z", 12),
      finished(routine, "b", "2026-08-12T10:00:00.000Z", 12)
    ];
    const returning = planAdaptiveSession(routine, history, rule, new Date("2026-08-24T10:00:00.000Z"));
    const press = returning.items.find((item) => item.itemId === pressItem(routine).id)!;
    expect(returning).toMatchObject({ readiness: "returning", daysSinceLastSession: 12 });
    expect(press).toMatchObject({ action: "ease_back", loadKg: 18 });
    expect(press.sets).toHaveLength(pressItem(routine).sets.length);

    const longBreak = planAdaptiveSession(routine, history, rule, new Date("2026-09-12T10:00:00.000Z"));
    const eased = longBreak.items.find((item) => item.itemId === pressItem(routine).id)!;
    expect(longBreak.readiness).toBe("long_break");
    expect(eased).toMatchObject({ action: "ease_back", loadKg: 16 });
    expect(eased.sets).toHaveLength(pressItem(routine).sets.length - 1);
    const session = createAdaptiveSessionFromRoutine(routine, longBreak);
    expect(session.exercises.find((item) => item.variantId === PRESS)!.sets).toHaveLength(pressItem(routine).sets.length - 1);
  });

  it("starts without prefilled loads when there is no history", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const plan = planAdaptiveSession(routine, [], rule, new Date("2026-08-14T10:00:00.000Z"));
    expect(plan.readiness).toBe("first_session");
    expect(plan.items.every((item) => item.action === "start" && item.loadKg === undefined)).toBe(true);
    const session = createAdaptiveSessionFromRoutine(routine, plan);
    expect(session.exercises.flatMap((exercise) => exercise.sets).every((set) => set.weightKg === undefined)).toBe(true);
  });
});

describe("training week plan", () => {
  const at = (day: number, hour = 9) => new Date(2026, 7, day, hour);
  const done = (day: number): WorkoutSession => ({ id: `s${day}`, startedAt: at(day, 8).toISOString(), finishedAt: at(day).toISOString(), exercises: [] });
  const planned = (plan: ReturnType<typeof planTrainingWeek>) => plan.days.filter((day) => day.status === "planned").map((day) => day.date);

  it("spreads a fresh week with rest days between sessions", () => {
    // 2026-08-10 is a Monday.
    const plan = planTrainingWeek({ daysPerWeek: 3, sessions: [], upcomingRoutineIds: ["a", "b"], now: at(10) });
    expect(planned(plan)).toEqual(["2026-08-10", "2026-08-13", "2026-08-16"]);
    expect(plan.days.filter((day) => day.status === "planned").map((day) => day.routineId)).toEqual(["a", "b", "a"]);
    expect(plan.nextTrainingDate).toBe("2026-08-10");
  });

  it("re-flows the remaining sessions after missed days", () => {
    const plan = planTrainingWeek({ daysPerWeek: 3, sessions: [done(10)], now: at(14) });
    expect(plan.days[0].status).toBe("done");
    expect(planned(plan)).toEqual(["2026-08-14", "2026-08-16"]);
    expect(plan.droppedSessions).toBe(0);
  });

  it("rests the day after training when the week has room", () => {
    const plan = planTrainingWeek({ daysPerWeek: 3, sessions: [done(10)], now: at(11) });
    expect(plan.days[1].status).toBe("rest");
    expect(planned(plan)).toEqual(["2026-08-12", "2026-08-16"]);
  });

  it("rolls sessions over when they no longer fit and stops at the weekly target", () => {
    const late = planTrainingWeek({ daysPerWeek: 4, sessions: [], now: at(15) });
    expect(planned(late)).toEqual(["2026-08-15", "2026-08-16"]);
    expect(late.droppedSessions).toBe(2);

    const complete = planTrainingWeek({ daysPerWeek: 2, sessions: [done(10), done(12)], now: at(13) });
    expect(planned(complete)).toEqual([]);
    expect(complete.completedSessions).toBe(2);
  });
});

function finishedItem(
  routine: Routine,
  movementId: string,
  id: string,
  finishedAt: string,
  values: { reps?: number; durationSeconds?: number; distanceMeters?: number; weightKg?: number },
  now?: string
): WorkoutSession {
  const plan = planAdaptiveSession(routine, history[movementId] ?? [], rule, new Date(now ?? finishedAt));
  let session = createAdaptiveSessionFromRoutine(routine, plan);
  const block = session.exercises.find((item) => item.movementId === movementId)!;
  block.sets.forEach((set) => {
    session = updateSet(session, block.id, set.id, values, true);
  });
  const done = { ...session, id, finishedAt };
  history[movementId] = [...(history[movementId] ?? []), done];
  return done;
}
let history: Record<string, WorkoutSession[]> = {};

describe("adaptive targets without a load", () => {
  it("keeps raising rep targets from the last session instead of the routine", () => {
    history = {};
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const item = routine.items.find((entry) => entry.movementId === "squat")!;
    const top = (sessions: WorkoutSession[], now: string) => planAdaptiveSession(routine, sessions, rule, new Date(now))
      .items.find((entry) => entry.itemId === item.id)!;
    finishedItem(routine, "squat", "a", "2026-08-10T10:00:00.000Z", { reps: 12, weightKg: 10 });
    finishedItem(routine, "squat", "b", "2026-08-12T10:00:00.000Z", { reps: 12, weightKg: 10 });
    const first = top(history.squat, "2026-08-14T10:00:00.000Z");
    expect(first.action).toBe("progress");
    expect(first.sets.at(-1)).toMatchObject({ minReps: 9, maxReps: 13 });

    finishedItem(routine, "squat", "c", "2026-08-14T10:00:00.000Z", { reps: 10, weightKg: 10 });
    const held = top(history.squat, "2026-08-15T10:00:00.000Z");
    expect(held.action).toBe("hold");
    expect(held.sets.at(-1)).toMatchObject({ minReps: 9, maxReps: 13 });

    finishedItem(routine, "squat", "d", "2026-08-16T10:00:00.000Z", { reps: 13, weightKg: 10 });
    finishedItem(routine, "squat", "e", "2026-08-18T10:00:00.000Z", { reps: 13, weightKg: 10 });
    const second = top(history.squat, "2026-08-20T10:00:00.000Z");
    expect(second.action).toBe("progress");
    expect(second.sets.at(-1)).toMatchObject({ minReps: 10, maxReps: 14 });
    expect(item.sets.at(-1)).toMatchObject({ minReps: 8, maxReps: 12 });
  });

  it("keeps a progressed duration target on hold", () => {
    history = {};
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const item = routine.items.find((entry) => entry.movementId === "plank")!;
    finishedItem(routine, "plank", "a", "2026-08-10T10:00:00.000Z", { durationSeconds: 30 });
    finishedItem(routine, "plank", "b", "2026-08-12T10:00:00.000Z", { durationSeconds: 30 });
    finishedItem(routine, "plank", "c", "2026-08-14T10:00:00.000Z", { durationSeconds: 20 });
    const plank = planAdaptiveSession(routine, history.plank, rule, new Date("2026-08-15T10:00:00.000Z"))
      .items.find((entry) => entry.itemId === item.id)!;
    expect(plank.action).toBe("hold");
    expect(plank.sets.at(-1)).toMatchObject({ durationSeconds: 35 });
  });

  it("ignores a finished session where the variant was skipped", () => {
    history = {};
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const item = routine.items.find((entry) => entry.movementId === "plank")!;
    finishedItem(routine, "plank", "a", "2026-08-10T10:00:00.000Z", { durationSeconds: 30 });
    const before = planAdaptiveSession(routine, history.plank, rule, new Date("2026-08-12T10:00:00.000Z"));
    const empty = { ...createAdaptiveSessionFromRoutine(routine, before), id: "empty", finishedAt: "2026-08-11T10:00:00.000Z" };
    const after = planAdaptiveSession(routine, [...history.plank, empty], rule, new Date("2026-08-12T10:00:00.000Z"));
    const pick = (plan: typeof before) => plan.items.find((entry) => entry.itemId === item.id)!;
    expect(pick(after).action).not.toBe("start");
    expect(pick(after)).toEqual(pick(before));
  });

  it("keeps unequal set targets unequal on hold", () => {
    history = {};
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const item = routine.items.find((entry) => entry.movementId === "plank")!;
    const working = item.sets.filter((set) => set.type === "working");
    working[0].durationSeconds = 30;
    working.at(-1)!.durationSeconds = 60;
    const expected = item.sets.map((set) => set.durationSeconds);
    finishedItem(routine, "plank", "a", "2026-08-10T10:00:00.000Z", { durationSeconds: 20 });
    const plank = planAdaptiveSession(routine, history.plank, rule, new Date("2026-08-12T10:00:00.000Z"))
      .items.find((entry) => entry.itemId === item.id)!;
    expect(plank.action).toBe("hold");
    expect(plank.sets.map((set) => set.durationSeconds)).toEqual(expected);
  });

  it("reports distance progression instead of a hold", () => {
    history = {};
    const routine = cloneRoutineTemplate("tpl_strength_b");
    const item = routine.items.find((entry) => entry.movementId === "farmer_carry")!;
    finishedItem(routine, "farmer_carry", "a", "2026-08-10T10:00:00.000Z", { distanceMeters: 40, weightKg: 20 });
    finishedItem(routine, "farmer_carry", "b", "2026-08-12T10:00:00.000Z", { distanceMeters: 40, weightKg: 20 });
    const carry = planAdaptiveSession(routine, history.farmer_carry, rule, new Date("2026-08-14T10:00:00.000Z"))
      .items.find((entry) => entry.itemId === item.id)!;
    expect(carry.action).toBe("progress");
    expect(carry.reason.en).toContain("50 meters");
  });

  it("drops a prefilled load when the equipment is switched", () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const sessions = [
      finished(routine, "a", "2026-08-10T10:00:00.000Z", 12),
      finished(routine, "b", "2026-08-12T10:00:00.000Z", 12)
    ];
    const plan = planAdaptiveSession(routine, sessions, rule, new Date("2026-08-14T10:00:00.000Z"));
    let session = createAdaptiveSessionFromRoutine(routine, plan);
    const block = session.exercises.find((entry) => entry.variantId === PRESS)!;
    session = switchExerciseVariant(session, block.id, getVariant("chest_press__machine")!);
    const machine = session.exercises.find((entry) => entry.variantId === "chest_press__machine")!;
    expect(machine.sets.every((set) => set.weightKg === undefined)).toBe(true);

    session = createAdaptiveSessionFromRoutine(routine, plan);
    const again = session.exercises.find((entry) => entry.variantId === PRESS)!;
    session = updateSet(session, again.id, again.sets[0].id, { reps: 12 }, true);
    session = switchExerciseVariant(session, again.id, getVariant("chest_press__machine")!);
    expect(session.exercises.find((entry) => entry.variantId === PRESS)!.sets[0].weightKg).toBe(22.5);
    expect(session.exercises.find((entry) => entry.variantId === "chest_press__machine")!.sets.every((set) => set.weightKg === undefined)).toBe(true);
  });
});
