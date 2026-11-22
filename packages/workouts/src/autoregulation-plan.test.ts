import { describe, expect, it } from "vitest";
import type { SetLog, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, getVariant } from "@gym/catalog";
import { adviseSet, buildAdviceContext, personalTauHours, recoveryOverview, sorenessPrompt, usesWarmupFeel } from "./autoregulation-plan";
import { switchExerciseVariant } from "./index";

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

  it("starts from the latest session's load whatever order the sessions arrive in", () => {
    const older = finished("old", "2026-11-08T10:00:00.000Z", barbell, [done("a", 55, 12)]);
    const newer = finished("new", "2026-11-15T10:00:00.000Z", barbell, [done("a", 60, 10)]);
    for (const sessions of [[older, newer], [newer, older]]) {
      expect(adviseSet(buildAdviceContext(sessions, now), exercise(barbell, [open("one")]), "one")!.weightKg).toBe(60);
    }
  });

  it("uses the rest really taken once the set has been started", () => {
    const context = buildAdviceContext([lastWeek], now);
    const next = (restBeforeSeconds?: number) => adviseSet(context, exercise(barbell, [
      done("one", 60, 10, { completedAt: now.toISOString(), rir: 2 }),
      open("two", { startedAt: now.toISOString(), restBeforeSeconds })
    ]), "two")!;
    const short = next(30);
    const long = next(240);
    expect(short.weightKg * (1 + short.reps / 30)).toBeLessThan(long.weightKg * (1 + long.reps / 30));
    expect(next()).toMatchObject({ weightKg: next(120).weightKg, reps: next(120).reps });
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
  it("moves the first set with the pre-workout check-in and names it in the reason", () => {
    const context = buildAdviceContext([lastWeek], now);
    const plan = (checkIn?: { sleep: number; energy: number; soreness: number }) => adviseSet(context, exercise(barbell, [open("one")]), "one", checkIn)!;
    const strength = (advice: { weightKg: number; reps: number; expectedRir: number }) => advice.weightKg * (1 + (advice.reps + advice.expectedRir) / 30);
    expect(plan({ sleep: 3, energy: 3, soreness: 3 })).toEqual(plan());
    expect(plan({ sleep: 1, energy: 1, soreness: 1 }).readinessPercent).toBe(plan().readinessPercent - 3);
    expect(strength(plan({ sleep: 1, energy: 1, soreness: 1 }))).toBeLessThan(strength(plan()));
    expect(plan({ sleep: 1, energy: 1, soreness: 1 }).reason.en).toContain("checked in below normal");
    // Answers outside 1-5 (another build, a hand-edited backup) are ignored, not thrown on.
    expect(plan({ sleep: 9, energy: 3, soreness: 3 })).toEqual(plan());
  });

  it("moves the first set with the warm-up feel of that exercise only", () => {
    const context = buildAdviceContext([lastWeek], now);
    const plan = (warmupFeel?: "worse" | "expected" | "better") => adviseSet(context, { ...exercise(barbell, [open("one")]), warmupFeel }, "one")!;
    expect(plan("expected")).toEqual(plan());
    expect(plan("worse").readinessPercent).toBeLessThan(plan().readinessPercent);
    expect(plan("better").readinessPercent).toBeGreaterThan(plan().readinessPercent);
    expect(plan("worse").reason.vi).toContain("khởi động nặng hơn thường");
  });
  it("names a good check-in even when it only cancels out a recovery penalty", () => {
    const yesterday = finished("s2", "2026-11-22T04:00:00.000Z", barbell, [done("a", 60, 10), done("b", 60, 9), done("c", 60, 8)]);
    const context = buildAdviceContext([lastWeek, yesterday], now);
    const advice = adviseSet(context, exercise(barbell, [open("one")]), "one", { sleep: 5, energy: 5, soreness: 5 })!;
    expect(advice.reason.en).toContain("checked in above normal");
  });

  it("does not carry a warm-up rating to another equipment variant", () => {
    const warm: SetLog = { id: "w", type: "warmup", weightKg: 30, reps: 8, completedAt: "2026-11-22T09:00:00.000Z" };
    const session: WorkoutSession = { id: "live", startedAt: "2026-11-22T09:00:00.000Z", exercises: [{ ...exercise(barbell, [warm, open("one")]), warmupFeel: "worse" }] };
    const switched = switchExerciseVariant(session, "exercise", getVariant(dumbbell)!);
    expect(switched.exercises[0].warmupFeel).toBe("worse");
    expect(switched.exercises[1].variantId).toBe(dumbbell);
    expect(switched.exercises[1].warmupFeel).toBeUndefined();
  });

  it("offers the warm-up rating only where it can change a suggestion", () => {
    expect(usesWarmupFeel(exercise(barbell, [open("one")]))).toBe(true);
    expect(usesWarmupFeel(exercise(barbell, [{ id: "free", type: "working" }]))).toBe(false);
  });
});

describe("soreness feedback", () => {
  const sets = [done("a", 60, 10), done("b", 60, 9), done("c", 60, 8)];
  const yesterday = finished("s2", "2026-11-22T04:00:00.000Z", barbell, [...sets, done("d", 60, 8, { rir: 0 }), done("e", 60, 8, { rir: 0 })]);

  it("asks about the primary muscles of the latest finished session and reads back valid answers only", () => {
    const prompt = sorenessPrompt([lastWeek, { ...yesterday, soreness: { chest: 4, back: 9 as never } }], now)!;
    expect(prompt.sessionId).toBe("s2");
    expect(prompt.muscles).toEqual(getMovement("chest_press")!.primaryMuscles);
    expect(prompt.answers).toEqual({ chest: 4 });
    expect(sorenessPrompt([], now)).toBeUndefined();
    expect(sorenessPrompt([finished("old", "2026-11-01T10:00:00.000Z", barbell, sets)], now)).toBeUndefined();
  });

  it("learns a slower recovery from 'still sore' and a faster one from 'not sore', in date order", () => {
    expect(personalTauHours([lastWeek, yesterday], now)).toEqual({});
    expect(personalTauHours([{ ...yesterday, soreness: { chest: 4 } }, { ...lastWeek, soreness: { chest: 4 } }], now).chest).toBeCloseTo(36.3, 1);
    expect(personalTauHours([{ ...yesterday, soreness: { chest: 1 } }], now).chest).toBeCloseTo(28.5, 1);
    expect(personalTauHours([{ ...yesterday, soreness: { chest: 2 } }], now).chest).toBe(30);
  });

  it("shows a muscle rated still sore as less recovered and feeds the same estimate to set advice", () => {
    const plain = recoveryOverview([yesterday], now).find((item) => item.muscle === "chest")!;
    const sore = recoveryOverview([{ ...yesterday, soreness: { chest: 4 } }], now).find((item) => item.muscle === "chest")!;
    expect(sore.recovery).toBeLessThan(plain.recovery);
    expect(sore.hoursUntilReady).toBeGreaterThan(plain.hoursUntilReady);
    expect(sore).toMatchObject({ personal: true, tauHours: 33 });
    expect(plain).toMatchObject({ personal: false, tauHours: 30 });
    expect(buildAdviceContext([{ ...yesterday, soreness: { chest: 4 } }], now).recovery.find((item) => item.muscle === "chest")!.recovery).toBe(sore.recovery);
    expect(recoveryOverview([], now).every((item) => item.status === "ready")).toBe(true);
  });
});
