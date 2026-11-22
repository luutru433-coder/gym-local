import { describe, expect, it } from "vitest";
import type { Routine, SetLog, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, getVariant } from "@gym/catalog";
import { DEFAULT_PROGRESSION_RULE, createAdaptiveSessionFromRoutine, planAdaptiveSession } from "./adaptive-plan";
import { currentBlockWeek, planEngineSession } from "./autoregulation-week";

// Sunday of a week whose Monday is 2026-11-16.
const now = new Date(2026, 10, 22, 10);
const variantId = "chest_press__barbell";
const variant = getVariant(variantId)!;
const movement = getMovement(variant.movementId)!;

const routine: Routine = {
  id: "routine", name: { vi: "Ngực", en: "Chest" }, goal: "hypertrophy", createdAt: "", updatedAt: "",
  items: [{ id: "item", movementId: movement.id, preferredVariantId: variantId, restSeconds: 120, sets: [1, 2, 3].map((n) => ({ id: `t${n}`, type: "working" as const, minReps: 8, maxReps: 12, targetRir: 2 })) }]
} as Routine;

function session(daysAgo: number, reps: number, extra: Partial<WorkoutSession> = {}, setCount = 3, rir?: number): WorkoutSession {
  const at = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  const sets: SetLog[] = Array.from({ length: setCount }, (_, n) => ({ id: `s${daysAgo}_${n}`, type: "working", targetMinReps: 8, targetMaxReps: 12, targetRir: 2, weightKg: 60, reps, rir, completedAt: at }));
  return {
    id: `session_${daysAgo}`, startedAt: at, finishedAt: at, ...extra,
    exercises: [{ id: `e${daysAgo}`, movementId: movement.id, movementNameSnapshot: movement.name, variantId, variantNameSnapshot: variant.name, loadEntryModeSnapshot: variant.loadEntryMode, trackingProfileSnapshot: getTrackingProfile(variantId), sets, restSeconds: 120 }]
  };
}

const plan = (sessions: WorkoutSession[]) => planEngineSession(planAdaptiveSession(routine, sessions, DEFAULT_PROGRESSION_RULE, now), routine, sessions, now);
const working = (sessions: WorkoutSession[]) => plan(sessions).items[0].sets.filter((set) => set.type === "working");

describe("currentBlockWeek", () => {
  it("counts weeks trained in a row, restarts after a week off and cycles after the deload", () => {
    expect(currentBlockWeek([], now)).toBe(1);
    expect(currentBlockWeek([session(7, 10)], now)).toBe(2);
    expect(currentBlockWeek([session(7, 10), session(21, 10)], now)).toBe(2);
    expect(currentBlockWeek([7, 14, 21, 28].map((days) => session(days, 10)), now)).toBe(5);
    expect(currentBlockWeek([7, 14, 21, 28, 35].map((days) => session(days, 10)), now)).toBe(1);
  });
});

describe("planEngineSession", () => {
  it("leaves a first session untouched", () => {
    expect(plan([]).engine).toBeUndefined();
  });

  it("sets the block week's target RIR and holds sets without a soreness answer", () => {
    const result = plan([session(7, 10)]);
    expect(result.engine!.block).toMatchObject({ week: 2, deload: false, targetRir: 3 });
    expect(result.engine!.muscles[0]).toMatchObject({ muscle: "chest", action: "hold", sessionSetDelta: 0 });
    expect(working([session(7, 10)]).map((set) => set.targetRir)).toEqual([3, 3, 3]);
  });

  it("adds one set when not sore and on target, building on the sets planned last time, never past six", () => {
    expect(working([session(7, 10, { soreness: { chest: 1 } })])).toHaveLength(4);
    expect(working([session(7, 10, { soreness: { chest: 1 } }, 4), session(14, 10)])).toHaveLength(5);
    expect(working([session(7, 10, { soreness: { chest: 1 } }, 6)])).toHaveLength(6);
  });

  it("removes a set when still sore, holds when sore just in time, and halves after missed targets", () => {
    expect(working([session(7, 10, { soreness: { chest: 4 } }, 8)])).toHaveLength(5);
    expect(working([session(7, 10, { soreness: { chest: 3 } })])).toHaveLength(3);
    const missed = plan([session(7, 5, { soreness: { chest: 2 } }, 4)]);
    expect(missed.engine!.muscles[0]).toMatchObject({ action: "recovery_session", performance: 4 });
    expect(missed.items[0].sets.filter((set) => set.type === "working")).toHaveLength(2);
  });

  it("deloads in week five and early after two weeks of missed targets, with half the sets at RIR 5", () => {
    const fifth = plan([7, 14, 21, 28].map((days) => session(days, 10, { soreness: { chest: 1 } })));
    expect(fifth.engine!.block).toMatchObject({ week: 5, deload: true, early: false });
    expect(fifth.items[0].sets.map((set) => set.targetRir)).toEqual([5, 5]);
    const early = plan([session(3, 5), session(10, 5)]);
    expect(early.engine!.block).toMatchObject({ week: 2, deload: true, early: true });
  });

  it("changes only the new session: the routine keeps its sets and the started session carries the plan", () => {
    const sessions = [session(7, 10, { soreness: { chest: 1 } })];
    const started = createAdaptiveSessionFromRoutine(routine, plan(sessions));
    expect(routine.items[0].sets).toHaveLength(3);
    expect(started.exercises[0].sets.filter((set) => set.type === "working").map((set) => set.targetRir)).toEqual([3, 3, 3, 3]);
    expect(new Set(started.exercises[0].sets.map((set) => set.id)).size).toBe(4);
  });

  it("never reads performance from another equipment variant", () => {
    const other = getVariant("chest_press__dumbbell")!;
    const swap = (item: WorkoutSession): WorkoutSession => ({ ...item, exercises: item.exercises.map((exercise) => ({ ...exercise, variantId: other.id, variantNameSnapshot: other.name, loadEntryModeSnapshot: other.loadEntryMode, trackingProfileSnapshot: getTrackingProfile(other.id) })) });
    const missed = plan([swap(session(7, 5, { soreness: { chest: 2 } }, 4))]);
    expect(missed.engine!.muscles[0]).toMatchObject({ action: "hold", performance: undefined });
    expect(missed.items[0].sets.filter((set) => set.type === "working")).toHaveLength(3);
    expect(plan([swap(session(3, 5)), swap(session(10, 5))]).engine!.block.early).toBe(false);
  });

  it("does not count drop or failure sets as working sets planned last time", () => {
    const last = session(7, 10);
    last.exercises[0].sets.push({ ...last.exercises[0].sets[0], id: "drop", type: "drop" });
    expect(working([last])).toHaveLength(3);
  });

  it("leaves the load to the set suggestions instead of prefilling last time's at a new target effort", () => {
    const result = plan([7, 14, 21, 28].map((days) => session(days, 10)));
    expect(result.items[0]).toMatchObject({ action: "hold", loadKg: undefined, previousLoadKg: undefined });
    expect(createAdaptiveSessionFromRoutine(routine, result).exercises[0].sets.every((set) => set.weightKg === undefined)).toBe(true);
  });

  it("explains a still-sore muscle that is already at the weekly minimum", () => {
    const result = plan([session(7, 10, { soreness: { chest: 4 } })]);
    expect(result.engine!.muscles[0]).toMatchObject({ action: "hold", sessionSetDelta: 0, soreness: 4 });
    expect(result.engine!.muscles[0].reason.en).toContain("minimum");
  });

  it("keeps the planned load when history gives the engine no strength estimate", () => {
    const result = plan([session(7, 40)]);
    expect(result.items[0].loadKg).toBe(60);
  });
});
