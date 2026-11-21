import { describe, expect, it } from "vitest";
import {
  blockWeek, calibrateFatigueDrop, calibrateTau, distributeSetDelta, e1rmFromSet, effectiveRir, estimateBaseline,
  muscleRecovery, needsEarlyDeload, nextSetCapacity, performanceScore, prescribeSet, readinessFactor, repsToFailure,
  setFatigueUnits, tempoSlowdown, volumeDecision
} from "./autoregulation";
import { runAutoregulationSample } from "./autoregulation-sample";

const loads = Array.from({ length: 80 }, (_, index) => (index + 1) * 2.5);

describe("rep-max curve and RIR", () => {
  it("adds reps in reserve to the reps done and inverts exactly", () => {
    expect(e1rmFromSet({ loadKg: 100, reps: 8, rir: 2 })).toBeCloseTo(133.33, 2);
    expect(repsToFailure(100, 133.3333)).toBeCloseTo(10, 3);
    // Alpha Progression's example 1 treats 20 kg × 15 and 25 kg × 6 as about equal.
    expect(e1rmFromSet({ loadKg: 20, reps: 15 })).toBeCloseTo(e1rmFromSet({ loadKg: 25, reps: 6 })!, 6);
  });

  it("prefers logged RIR, then RPE, then the target, then failure", () => {
    expect(effectiveRir({ loadKg: 50, reps: 5, rir: 1.5, rpe: 7, targetRir: 3 })).toEqual({ rir: 1.5, source: "logged" });
    expect(effectiveRir({ loadKg: 50, reps: 5, rpe: 8 })).toEqual({ rir: 2, source: "rpe" });
    expect(effectiveRir({ loadKg: 50, reps: 5, targetRir: 3 })).toEqual({ rir: 3, source: "target" });
    expect(effectiveRir({ loadKg: 50, reps: 5 })).toEqual({ rir: 0, source: "assumed" });
  });

  it("refuses sets too far from failure to estimate and rejects bad input", () => {
    expect(e1rmFromSet({ loadKg: 20, reps: 18, rir: 4 })).toBeUndefined();
    expect(e1rmFromSet({ loadKg: 20, reps: 0 })).toBeUndefined();
    expect(() => e1rmFromSet({ loadKg: 0, reps: 5 })).toThrow(RangeError);
    expect(() => e1rmFromSet({ loadKg: 20, reps: 5.5 })).toThrow(RangeError);
    expect(() => e1rmFromSet({ loadKg: 20, reps: 5, rir: 1.2 })).toThrow(RangeError);
    expect(() => e1rmFromSet({ loadKg: 20, reps: 5, targetRir: Number.NaN })).toThrow(RangeError);
    expect(() => nextSetCapacity({ priorE1rmKg: 100, completedSets: [{ loadKg: 80, reps: 5, rir: 2 }], restSeconds: Number.NaN })).toThrow(RangeError);
    expect(() => muscleRecovery([], new Date(), { chest: Number.NaN })).toThrow(RangeError);
  });
});

describe("baseline and fatigue calibration", () => {
  const session = (date: string, reps: number) => ({ finishedAt: date, sets: [{ loadKg: 100, reps, rir: 2 }, { loadKg: 100, reps: reps - 1, rir: 2 }] });

  it("weights recent sessions more and discounts time off", () => {
    const history = [session("2026-11-01T10:00:00Z", 6), session("2026-11-04T10:00:00Z", 7), session("2026-11-08T10:00:00Z", 8)];
    const fresh = estimateBaseline(history, new Date("2026-11-10T10:00:00Z"))!;
    // (133.33 × 1 + 130 × 0.5 + 126.67 × 0.25) / 1.75
    expect(fresh.e1rmKg).toBe(131.4);
    expect(fresh.confidence).toBe("high");
    const later = estimateBaseline(history, new Date("2026-11-29T10:00:00Z"))!;
    expect(later.daysSinceLast).toBe(21);
    expect(later.detrainFactor).toBeCloseTo(0.93, 6);
    expect(estimateBaseline([], new Date())).toBeUndefined();
  });

  it("learns the set-to-set drop only from enough measured pairs", () => {
    expect(calibrateFatigueDrop([session("2026-11-01T10:00:00Z", 8)])).toEqual({ dropPerSet: 0.03, pairs: 1 });
    const many = Array.from({ length: 6 }, (_, index) => session(`2026-11-${String(index + 1).padStart(2, "0")}T10:00:00Z`, 8));
    const learned = calibrateFatigueDrop(many);
    expect(learned.pairs).toBe(6);
    expect(learned.dropPerSet).toBeCloseTo(1 - (1 + 9 / 30) / (1 + 10 / 30), 6);
  });

  it("learns the drop at the reference effort and rest, so it is not counted twice", () => {
    // Failure sets after 60 s rest: the 4.5% seen is 2% × 1.5 (effort) × 1.5 (rest).
    const hard = Array.from({ length: 6 }, (_, index) => ({
      finishedAt: `2026-11-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
      sets: [{ loadKg: 100, reps: 10, rir: 0 }, { loadKg: 95.5, reps: 10, rir: 0, restBeforeSeconds: 60 }]
    }));
    const learned = calibrateFatigueDrop(hard).dropPerSet;
    expect(learned).toBeCloseTo(0.02, 6);
    const next = nextSetCapacity({ completedSets: [{ loadKg: 100, reps: 10, rir: 0 }], restSeconds: 60, fatigueDropPerSet: learned })!;
    expect(next.retained).toBeCloseTo(0.955, 6);
  });

  it("counts time off from the last session that trained the variant, estimable or not", () => {
    const history = [session("2026-11-01T10:00:00Z", 8), { finishedAt: "2026-11-20T10:00:00Z", sets: [{ loadKg: 40, reps: 25, rir: 2 }] }];
    const estimate = estimateBaseline(history, new Date("2026-11-22T10:00:00Z"))!;
    expect(estimate.daysSinceLast).toBe(2);
    expect(estimate.detrainFactor).toBe(1);
  });
});

describe("readiness", () => {
  it("combines recovery, check-in and warm-up feel inside bounds", () => {
    expect(readinessFactor({ primaryMuscleRecovery: [1] }).factor).toBe(1);
    expect(readinessFactor({ primaryMuscleRecovery: [0.5, 1] }).factor).toBeCloseTo(0.95, 6);
    expect(readinessFactor({ primaryMuscleRecovery: [1], warmupFeel: "worse" }).factor).toBeCloseTo(0.974, 6);
    expect(readinessFactor({ primaryMuscleRecovery: [1], checkIn: { sleep: 5, energy: 5, soreness: 5 }, warmupFeel: "better" }).factor).toBeCloseTo(1.043, 6);
    expect(readinessFactor({ primaryMuscleRecovery: [0], checkIn: { sleep: 1, energy: 1, soreness: 1 }, warmupFeel: "worse" }).factor).toBe(0.85);
    expect(() => readinessFactor({ primaryMuscleRecovery: [1.2] })).toThrow(RangeError);
  });
});

describe("capacity during the session", () => {
  it("moves today's estimate toward what was lifted and fatigues the next set", () => {
    const start = nextSetCapacity({ priorE1rmKg: 120, completedSets: [] })!;
    expect(start).toEqual({ freshE1rmKg: 120, e1rmKg: 120, retained: 1 });
    const strong = nextSetCapacity({ priorE1rmKg: 120, completedSets: [{ loadKg: 100, reps: 8, rir: 2 }], restSeconds: 120 })!;
    expect(strong.freshE1rmKg).toBe(130);
    expect(strong.e1rmKg).toBe(126.1);
    const failure = nextSetCapacity({ priorE1rmKg: 120, completedSets: [{ loadKg: 100, reps: 10, rir: 0 }], restSeconds: 60 })!;
    expect(failure.retained).toBeCloseTo(1 - 0.03 * 1.5 * 1.5, 6);
    expect(nextSetCapacity({ completedSets: [] })).toBeUndefined();
  });
});

describe("prescription", () => {
  const target = { minReps: 8, maxReps: 12, rir: 2 };

  it("keeps the load while reps stay in range and changes it when they leave", () => {
    const keep = prescribeSet({ capacityE1rmKg: 100, target, availableLoadsKg: loads, currentLoadKg: 75 });
    expect(keep).toMatchObject({ loadKg: 75, reps: 8, action: "keep_load", inRange: true, expectedRepsToFailure: 10, expectedRir: 2 });
    const up = prescribeSet({ capacityE1rmKg: 118, target, availableLoadsKg: loads, currentLoadKg: 75 });
    expect(up.action).toBe("raise_load");
    expect(up.loadKg).toBeGreaterThan(75);
    expect(up.reps).toBeGreaterThanOrEqual(8);
    const down = prescribeSet({ capacityE1rmKg: 92, target, availableLoadsKg: loads, currentLoadKg: 75 });
    expect(down).toMatchObject({ action: "lower_load", inRange: true });
    expect(down.loadKg).toBeLessThan(75);
  });

  it("starts near the middle of the range and only uses loads the gym has", () => {
    const start = prescribeSet({ capacityE1rmKg: 100, target, availableLoadsKg: [20, 40, 60, 70, 80] });
    expect(start).toMatchObject({ loadKg: 70, reps: 10, action: "start" });
    expect(() => prescribeSet({ capacityE1rmKg: 100, target, availableLoadsKg: [] })).toThrow(RangeError);
    expect(start.feasible).toBe(true);
    // Every load is above today's capacity: the lightest is shown and flagged, never the heaviest.
    expect(prescribeSet({ capacityE1rmKg: 50, target, availableLoadsKg: [60, 80, 100] })).toMatchObject({ loadKg: 60, feasible: false, inRange: false });
    expect(prescribeSet({ capacityE1rmKg: 50, target, availableLoadsKg: [60, 80, 100], currentLoadKg: 100 })).toMatchObject({ loadKg: 60, feasible: false });
    // Sparse loads: the only liftable one is far too light, but it is still the one to use.
    expect(prescribeSet({ capacityE1rmKg: 20, target, availableLoadsKg: [10, 20] })).toMatchObject({ loadKg: 10, reps: 12, feasible: true, inRange: false });
    expect(prescribeSet({ capacityE1rmKg: 20, target, availableLoadsKg: [20, 10], currentLoadKg: 20 })).toMatchObject({ loadKg: 10, feasible: true, action: "lower_load" });
    expect(() => prescribeSet({ capacityE1rmKg: 100, target: { minReps: 10, maxReps: 8, rir: 2 }, availableLoadsKg: loads })).toThrow(RangeError);
  });
});

describe("muscle recovery", () => {
  it("decays fatigue with the muscle's time constant", () => {
    const events = [{ at: "2026-11-10T10:00:00Z", muscle: "chest" as const, units: 8 }];
    const chest = (now: string, tau?: number) => muscleRecovery(events, new Date(now), tau ? { chest: tau } : {}).find((item) => item.muscle === "chest")!;
    expect(chest("2026-11-10T10:00:00Z")).toMatchObject({ recovery: 0.2, fatigueUnits: 8 });
    expect(chest("2026-11-11T16:00:00Z").recovery).toBeCloseTo(1 - 0.8 * Math.exp(-1), 2);
    expect(chest("2026-11-10T10:00:00Z").hoursUntilReady).toBe(Math.ceil(30 * Math.log(8 / 1.5)));
    expect(chest("2026-11-12T10:00:00Z", 60).recovery).toBeLessThan(chest("2026-11-12T10:00:00Z").recovery);
    expect(muscleRecovery(events, new Date("2026-11-10T10:00:00Z")).find((item) => item.muscle === "back")!.recovery).toBe(1);
  });

  it("weights hard sets and primary muscles more, and learns from soreness", () => {
    expect(setFatigueUnits(0, "primary")).toBe(1.25);
    expect(setFatigueUnits(2, "secondary")).toBe(0.5);
    expect(calibrateTau(30, 4)).toBe(33);
    expect(calibrateTau(30, 1)).toBe(28.5);
    expect(calibrateTau(30, 2)).toBe(30);
    expect(calibrateTau(58, 4)).toBe(60);
  });
});

describe("volume", () => {
  const set = (reps: number, rir = 2) => ({ targetMinReps: 8, targetMaxReps: 12, targetRir: 2, loadKg: 60, reps, rir });

  it("scores performance from the log", () => {
    expect(performanceScore([set(12, 3), set(12, 3)])).toBe(1);
    expect(performanceScore([set(10), set(9)])).toBe(2);
    expect(performanceScore([set(10), set(7)])).toBe(3);
    expect(performanceScore([set(7), set(6), set(9)])).toBe(4);
    expect(performanceScore([set(10)], -0.05)).toBe(4);
    expect(performanceScore([set(10)], -0.04)).toBe(2);
  });

  it("follows RP's published table inside the weekly bounds", () => {
    expect(volumeDecision({ soreness: 1, performance: 1, weeklySets: 10 })).toMatchObject({ action: "add", setDelta: 2 });
    expect(volumeDecision({ soreness: 2, performance: 2, weeklySets: 10 })).toMatchObject({ action: "add", setDelta: 1 });
    expect(volumeDecision({ soreness: 3, performance: 2, weeklySets: 10 })).toMatchObject({ action: "hold", setDelta: 0 });
    expect(volumeDecision({ soreness: 4, performance: 2, weeklySets: 10 })).toMatchObject({ action: "remove", setDelta: -1 });
    expect(volumeDecision({ soreness: 2, performance: 4, weeklySets: 10 })).toMatchObject({ action: "recovery_session", setDelta: -5 });
    expect(volumeDecision({ soreness: 1, performance: 1, weeklySets: 20 })).toMatchObject({ action: "hold", setDelta: 0 });
    expect(volumeDecision({ soreness: 1, performance: 1, weeklySets: 19 })).toMatchObject({ action: "add", setDelta: 1 });
    expect(volumeDecision({ soreness: 2, performance: 2, weeklySets: 3 })).toMatchObject({ action: "add", setDelta: 3 });
    // Below the weekly minimum, soreness never raises sets.
    expect(volumeDecision({ soreness: 4, performance: 2, weeklySets: 3 })).toMatchObject({ action: "hold", setDelta: 0 });
    expect(volumeDecision({ soreness: 3, performance: 2, weeklySets: 3 })).toMatchObject({ action: "hold", setDelta: 0 });
    expect(volumeDecision({ soreness: 4, performance: 2, weeklySets: 7 })).toMatchObject({ action: "remove", setDelta: -1 });
    expect(volumeDecision({ soreness: 1, performance: 1, weeklySets: 24 })).toMatchObject({ action: "hold", setDelta: 0 });
  });

  it("spreads a set change across exercises within per-exercise limits", () => {
    expect(distributeSetDelta([{ id: "a", sets: 3 }, { id: "b", sets: 4 }], 2)).toEqual([{ id: "a", sets: 5 }, { id: "b", sets: 4 }]);
    expect(distributeSetDelta([{ id: "a", sets: 3 }, { id: "b", sets: 4 }], -3)).toEqual([{ id: "a", sets: 2 }, { id: "b", sets: 2 }]);
    expect(distributeSetDelta([{ id: "a", sets: 6 }], 2)).toEqual([{ id: "a", sets: 6 }]);
  });
});

describe("block structure", () => {
  it("lowers RIR to the last hard week and ends on a deload", () => {
    expect([1, 2, 3, 4, 5].map((week) => blockWeek(week, 5).targetRir)).toEqual([4, 3, 2, 1, 5]);
    expect(blockWeek(5, 5)).toMatchObject({ deload: true, setFactor: 0.5 });
    expect(blockWeek(1, 8).targetRir).toBe(4);
    expect(() => blockWeek(6, 5)).toThrow(RangeError);
  });

  it("flags an early deload", () => {
    expect(needsEarlyDeload([["chest"], ["chest"]])).toBe(true);
    expect(needsEarlyDeload([[], ["chest", "back"]])).toBe(true);
    expect(needsEarlyDeload([["chest"], ["back"]])).toBe(false);
  });

  it("reports tempo slowdown only for comparable timed sets", () => {
    expect(tempoSlowdown({ loadKg: 60, reps: 10, workSeconds: 30 }, { loadKg: 60, reps: 8, workSeconds: 32 })).toBe(1.33);
    expect(tempoSlowdown({ loadKg: 60, reps: 10, workSeconds: 30 }, { loadKg: 55, reps: 8, workSeconds: 32 })).toBeUndefined();
    expect(tempoSlowdown({ loadKg: 60, reps: 10 }, { loadKg: 60, reps: 8, workSeconds: 32 })).toBeUndefined();
  });
});

describe("sample run", () => {
  it("is deterministic and stays close to a lifter whose real formulas differ", () => {
    const first = runAutoregulationSample();
    const second = runAutoregulationSample();
    expect(second.markdown).toBe(first.markdown);
    expect(first.engine.withinOneRepPercent).toBeGreaterThanOrEqual(70);
    expect(first.engine.inRangePercent).toBeGreaterThanOrEqual(85);
    expect(first.engine.unplannedFailurePercent).toBeLessThanOrEqual(10);
    expect(first.engine.meanRirGap).toBeLessThanOrEqual(1);
    expect(first.weeks.map((week) => week.targetRir)).toEqual([4, 3, 2, 1, 5]);
    expect(first.weeks.at(-1)!.deload).toBe(true);
  });
});
