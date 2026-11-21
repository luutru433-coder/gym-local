import { describe, expect, it } from "vitest";
import { getVariant } from "@gym/catalog";
import type { ProgressionRule, Routine, WorkoutSession } from "@gym/contracts";
import {
  cloneRoutineTemplate,
  createAdaptiveSessionFromRoutine,
  createSessionFromRoutine,
  planAdaptiveSession,
  planTrainingWeek,
  switchExerciseVariant,
  updateSet
} from "./index";

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
