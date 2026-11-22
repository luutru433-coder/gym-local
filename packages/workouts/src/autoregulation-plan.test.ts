import { describe, expect, it } from "vitest";
import type { SetLog, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, getVariant } from "@gym/catalog";
import { adviseSet, buildAdviceContext } from "./autoregulation-plan";

const now = new Date("2026-11-22T10:00:00.000Z");

function exercise(variantId: string, sets: SetLog[], id = "exercise") {
  const variant = getVariant(variantId)!;
  const movement = getMovement(variant.movementId)!;
  return {
    id,
    movementId: movement.id,
    movementNameSnapshot: movement.name,
    variantId,
    variantNameSnapshot: variant.name,
    loadEntryModeSnapshot: variant.loadEntryMode,
    trackingProfileSnapshot: getTrackingProfile(variantId),
    sets,
    restSeconds: 120
  };
}

function done(id: string, weightKg: number, reps: number, extra: Partial<SetLog> = {}): SetLog {
  return { id, type: "working", targetMinReps: 8, targetMaxReps: 12, weightKg, reps, completedAt: "2026-11-01T10:00:00.000Z", ...extra };
}

const open = (id: string, extra: Partial<SetLog> = {}): SetLog => ({ id, type: "working", targetMinReps: 8, targetMaxReps: 12, ...extra });

function finished(id: string, date: string, variantId: string, sets: SetLog[]): WorkoutSession {
  return { id, startedAt: date, finishedAt: date, exercises: [exercise(variantId, sets)] };
}

const barbell = "chest_press__barbell";
const dumbbell = "chest_press__dumbbell";
const lastWeek = finished("s1", "2026-11-15T10:00:00.000Z", barbell, [done("a", 60, 10), done("b", 60, 9), done("c", 60, 8)]);

describe("adviseSet", () => {
  it("gives no advice without history, so the screen keeps its old suggestion", () => {
    const context = buildAdviceContext([], now);
    expect(adviseSet(context, exercise(barbell, [open("one")]), "one")).toBeUndefined();
  });

  it("repeats last time's first set when recovered and nothing was rated", () => {
    const context = buildAdviceContext([lastWeek], now);
    const advice = adviseSet(context, exercise(barbell, [open("one"), open("two")]), "one")!;
    // Unrated sets are read at the same 2 RIR the set aims for: 60 × 10 last time gives 60 × 10 today.
    expect(advice).toMatchObject({ weightKg: 60, reps: 10, action: "keep_load", readinessPercent: 100 });
    expect(advice.freshE1rmKg).toBe(84);
  });

  it("uses only the exact variant's history", () => {
    const context = buildAdviceContext([lastWeek], now);
    expect(adviseSet(context, exercise(dumbbell, [open("one")]), "one")).toBeUndefined();
  });

  it("re-plans the next set from the sets done today", () => {
    const context = buildAdviceContext([lastWeek], now);
    const today = (reps: number, rir?: number) => exercise(barbell, [done("one", 60, reps, { completedAt: now.toISOString(), rir }), open("two")]);
    const easy = adviseSet(context, today(12, 3), "two")!;
    const hard = adviseSet(context, today(8, 0), "two")!;
    expect(easy.weightKg).toBeGreaterThanOrEqual(hard.weightKg);
    expect(easy.weightKg * (1 + easy.reps / 30)).toBeGreaterThan(hard.weightKg * (1 + hard.reps / 30));
    expect(easy.confidence).toBe("high");
    expect(hard.reason.en).toContain("re-estimated after 1 set today");
  });

  it("lowers the first set when the muscle was trained hard yesterday", () => {
    const yesterday = finished("s2", "2026-11-21T20:00:00.000Z", dumbbell, Array.from({ length: 8 }, (_, index) => done(`y${index}`, 20, 10, { rir: 0 })));
    const rested = adviseSet(buildAdviceContext([lastWeek], now), exercise(barbell, [open("one")]), "one")!;
    const tired = adviseSet(buildAdviceContext([lastWeek, yesterday], now), exercise(barbell, [open("one")]), "one")!;
    expect(tired.readinessPercent).toBeLessThan(100);
    expect(tired.reps).toBeLessThan(rested.reps);
    expect(tired.reason.en).toContain("not fully recovered");
  });

  it("keeps a load the user typed and fits the reps to it", () => {
    const context = buildAdviceContext([lastWeek], now);
    const advice = adviseSet(context, exercise(barbell, [open("one", { weightKg: 65 })]), "one")!;
    expect(advice.weightKg).toBe(65);
    expect(advice.reps).toBeLessThan(10);
  });

  it("skips warm-ups, finished sets, sets without a rep target, and exercises not progressed by load", () => {
    const context = buildAdviceContext([lastWeek], now);
    expect(adviseSet(context, exercise(barbell, [{ id: "w", type: "warmup", targetMinReps: 8, targetMaxReps: 12 }]), "w")).toBeUndefined();
    expect(adviseSet(context, exercise(barbell, [done("d", 60, 10)]), "d")).toBeUndefined();
    expect(adviseSet(context, exercise(barbell, [{ id: "n", type: "working" }]), "n")).toBeUndefined();
    expect(adviseSet(context, exercise(barbell, [open("one")]), "missing")).toBeUndefined();
  });

  it("ignores malformed logged values instead of failing the screen", () => {
    const odd = finished("s3", "2026-11-18T10:00:00.000Z", barbell, [done("a", 60, 10, { rir: 2.3 }), done("b", 0, 10), done("c", 60, 9.5)]);
    const advice = adviseSet(buildAdviceContext([odd], now), exercise(barbell, [open("one")]), "one")!;
    expect(advice).toMatchObject({ weightKg: 60, reps: 10 });
  });
});
