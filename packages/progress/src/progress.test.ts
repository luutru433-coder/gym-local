import { describe, expect, it } from "vitest";
import type { BodyMetric, SessionExercise, SetLog, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, getVariant } from "@gym/catalog";
import {
  bodyMetricSeries,
  estimatedOneRepMax,
  exactVariantTrend,
  muscleRecoveryMap,
  latestVariantHistory,
  personalRecord,
  sessionVolumeMetrics,
  setPerformanceMetrics,
  variantHistory,
  variantVolumeSummary,
  weeklyTrainingSummary,
  workoutCalendar
} from "./index";

let exerciseSequence = 0;

function exercise(variantId: string, sets: SetLog[], overrides: Partial<SessionExercise> = {}): SessionExercise {
  const variant = getVariant(variantId)!;
  const movement = getMovement(variant.movementId)!;
  return {
    id: `exercise_${variantId}_${++exerciseSequence}`,
    movementId: movement.id,
    movementNameSnapshot: movement.name,
    variantId,
    variantNameSnapshot: variant.name,
    loadEntryModeSnapshot: variant.loadEntryMode,
    trackingProfileSnapshot: getTrackingProfile(variantId),
    sets,
    restSeconds: 90,
    ...overrides
  };
}

function session(id: string, finishedAt: string | undefined, exercises: SessionExercise[]): WorkoutSession {
  return {
    id,
    startedAt: finishedAt ?? "2026-08-10T09:00:00.000Z",
    finishedAt,
    exercises
  };
}

function completedSet(id: string, values: Partial<SetLog>): SetLog {
  return { id, type: "working", completedAt: "2026-08-10T10:00:00.000Z", ...values };
}

describe("progress calculations", () => {
  it("uses Epley only for supported working rep ranges", () => {
    expect(estimatedOneRepMax(100, 5)).toBe(116.7);
    expect(estimatedOneRepMax(100, 11)).toBeUndefined();
  });

  it("uses only the latest finished exact-variant block for previous values", () => {
    const older = session("older", "2026-08-08T10:00:00.000Z", [exercise("chest_press__dumbbell", [
      completedSet("old_1", { weightKg: 16, reps: 12 }),
      completedSet("old_2", { weightKg: 16, reps: 11 }),
      completedSet("old_3", { weightKg: 16, reps: 10 })
    ])]);
    const newer = session("newer", "2026-08-10T10:00:00.000Z", [exercise("chest_press__dumbbell", [
      completedSet("new_1", { weightKg: 20, reps: 9 }),
      { id: "new_incomplete", type: "working", weightKg: 20, reps: 8 }
    ])]);
    const unfinished = session("unfinished", undefined, [exercise("chest_press__dumbbell", [
      completedSet("active_1", { weightKg: 99, reps: 1 })
    ])]);

    expect(latestVariantHistory([older, unfinished, newer], "chest_press__dumbbell")).toMatchObject([
      { sessionId: "newer", weightKg: 20, reps: 9 }
    ]);
    expect(variantHistory([unfinished, newer], "chest_press__barbell")).toEqual([]);
  });

  it("calculates only compatible completed external-load volume", () => {
    const workout = session("volume", "2026-08-10T10:00:00.000Z", [
      exercise("chest_press__barbell", [
        completedSet("barbell", { weightKg: 100, reps: 5 }),
        completedSet("warmup", { type: "warmup", weightKg: 50, reps: 5 }),
        { id: "incomplete", type: "working", weightKg: 500, reps: 1 }
      ]),
      exercise("chest_press__dumbbell", [completedSet("dumbbell", { weightKg: 20, reps: 10 })]),
      exercise("push_up__bodyweight", [completedSet("pushup", { weightKg: 10, reps: 10 })]),
      exercise("pull_up__machine", [completedSet("assisted", { weightKg: 30, reps: 8 })]),
      exercise("biceps_curl__resistance_band", [completedSet("band", { reps: 15 })]),
      exercise("farmer_carry__dumbbell", [completedSet("carry", { weightKg: 20, distanceMeters: 30, durationSeconds: 25 })]),
      exercise("one_arm_row__dumbbell", [completedSet("unilateral", { weightKg: 30, reps: 10 })])
    ]);

    expect(sessionVolumeMetrics(workout)).toEqual({
      externalLoadVolumeKg: 1000,
      contributingSets: 3,
      excludedSets: 4
    });
  });

  it("prefers snapshotted semantics over later catalog semantics", () => {
    const profile = getTrackingProfile("chest_press__dumbbell")!;
    const workout = session("snapshot", "2026-08-10T10:00:00.000Z", [exercise(
      "chest_press__dumbbell",
      [completedSet("set", { weightKg: 20, reps: 10 })],
      { trackingProfileSnapshot: { ...profile, volumeMultiplier: 1 } }
    )]);
    expect(sessionVolumeMetrics(workout).externalLoadVolumeKg).toBe(200);
  });

  it("tracks assisted load as lower-is-better without producing an e1RM", () => {
    const workouts = [
      session("assist_old", "2026-08-08T10:00:00.000Z", [exercise("pull_up__machine", [completedSet("a", { weightKg: 40, reps: 8 })])]),
      session("assist_new", "2026-08-10T10:00:00.000Z", [exercise("pull_up__machine", [completedSet("b", { weightKg: 30, reps: 8 })])])
    ];
    expect(personalRecord(workouts, "pull_up__machine")).toEqual({
      maxWeightKg: 0,
      maxE1rm: 0,
      minAssistanceKg: 30
    });
  });

  it("returns typed metrics and explicit exclusion reasons per set", () => {
    const dumbbellPress = exercise("chest_press__dumbbell", []);
    expect(setPerformanceMetrics(dumbbellPress, completedSet("press", { weightKg: 20, reps: 10 }))).toEqual({
      externalLoadVolumeKg: 400,
      e1rmKg: 26.7
    });

    const assistedPullUp = exercise("pull_up__machine", []);
    expect(setPerformanceMetrics(assistedPullUp, completedSet("assist", { weightKg: 30, reps: 8 }))).toEqual({
      assistanceKg: 30,
      e1rmKg: undefined,
      exclusionReason: "unsupported_load_semantics"
    });

    const plank = exercise("plank__bodyweight", []);
    expect(setPerformanceMetrics(plank, completedSet("plank", { durationSeconds: 45 }))).toEqual({
      e1rmKg: undefined,
      exclusionReason: "non_repetition_effort"
    });
    expect(setPerformanceMetrics(dumbbellPress, { id: "incomplete", type: "working", weightKg: 20, reps: 10 }))
      .toEqual({ exclusionReason: "incomplete" });
  });

  it("builds a workout calendar from finished sessions only", () => {
    const sessions = [
      session("day_one_a", "2026-08-10T09:30:00.000Z", [exercise("chest_press__barbell", [completedSet("a", { weightKg: 100, reps: 5 })])]),
      session("day_one_b", "2026-08-10T11:00:00.000Z", [exercise("chest_press__dumbbell", [completedSet("b", { weightKg: 20, reps: 10 })])]),
      session("unfinished", undefined, [exercise("chest_press__barbell", [completedSet("c", { weightKg: 999, reps: 1 })])])
    ];
    sessions[0].startedAt = "2026-08-10T09:00:00.000Z";
    sessions[1].startedAt = "2026-08-10T10:00:00.000Z";

    expect(workoutCalendar(sessions)).toEqual([{
      date: "2026-08-10",
      sessions: 2,
      completedWorkingSets: 2,
      externalLoadVolumeKg: 900,
      durationMinutes: 90
    }]);
  });

  it("builds PR markers and trends for the exact variant without mixing equipment", () => {
    const sessions = [
      session("db_old", "2026-08-08T10:00:00.000Z", [exercise("chest_press__dumbbell", [completedSet("a", { weightKg: 16, reps: 10 })])]),
      session("machine", "2026-08-09T10:00:00.000Z", [exercise("chest_press__machine", [completedSet("b", { weightKg: 100, reps: 10 })])]),
      session("db_new", "2026-08-10T10:00:00.000Z", [exercise("chest_press__dumbbell", [completedSet("c", { weightKg: 20, reps: 8 })])])
    ];
    const trend = exactVariantTrend(sessions, "chest_press__dumbbell");

    expect(trend.map((point) => point.sessionId)).toEqual(["db_old", "db_new"]);
    expect(trend.map((point) => point.bestLoadKg)).toEqual([16, 20]);
    expect(trend.every((point) => point.variantId === "chest_press__dumbbell")).toBe(true);
    expect(trend.map((point) => point.isLoadPr)).toEqual([true, true]);
  });

  it("summarizes working volume per exact variant", () => {
    const workout = session("variants", "2026-08-10T10:00:00.000Z", [
      exercise("chest_press__barbell", [completedSet("barbell", { weightKg: 100, reps: 5 })]),
      exercise("chest_press__dumbbell", [completedSet("dumbbell", { weightKg: 20, reps: 10 })])
    ]);
    expect(variantVolumeSummary([workout])).toMatchObject([
      { variantId: "chest_press__dumbbell", externalLoadVolumeKg: 400, completedWorkingSets: 1 },
      { variantId: "chest_press__barbell", externalLoadVolumeKg: 500, completedWorkingSets: 1 }
    ].sort((left, right) => right.externalLoadVolumeKg - left.externalLoadVolumeKg));
  });

  it("adds total reps to each exact-variant trend point", () => {
    const trend = exactVariantTrend([
      session("reps", "2026-08-10T10:00:00.000Z", [exercise("chest_press__dumbbell", [
        completedSet("a", { weightKg: 16, reps: 10 }),
        completedSet("b", { weightKg: 16, reps: 8 }),
        completedSet("warm", { type: "warmup", weightKg: 8, reps: 15 })
      ])])
    ], "chest_press__dumbbell");
    expect(trend[0].totalReps).toBe(18);
  });

  it("summarizes training per local week and keeps empty weeks", () => {
    const local = (year: number, month: number, day: number, hour: number) => new Date(year, month - 1, day, hour).toISOString();
    const sessions = [
      // Monday 2026-08-03 and Sunday 2026-08-09 belong to the same week.
      session("mon", local(2026, 8, 3, 10), [exercise("chest_press__barbell", [completedSet("a", { weightKg: 100, reps: 5 })])]),
      session("sun", local(2026, 8, 9, 10), [exercise("chest_press__dumbbell", [
        completedSet("b", { weightKg: 20, reps: 10 }),
        completedSet("warm", { type: "warmup", weightKg: 10, reps: 10 })
      ])]),
      session("latest", local(2026, 8, 19, 10), [exercise("chest_press__barbell", [completedSet("c", { weightKg: 100, reps: 5 })])]),
      session("too_old", local(2026, 7, 1, 10), [exercise("chest_press__barbell", [completedSet("d", { weightKg: 100, reps: 5 })])]),
      session("unfinished", undefined, [exercise("chest_press__barbell", [completedSet("e", { weightKg: 999, reps: 1 })])])
    ];
    sessions[0].startedAt = local(2026, 8, 3, 9);
    sessions[1].startedAt = local(2026, 8, 9, 9);
    sessions[2].startedAt = local(2026, 8, 19, 9);

    const weeks = weeklyTrainingSummary(sessions, 3, new Date(2026, 7, 20, 12));
    expect(weeks.map((week) => week.weekStart)).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
    expect(weeks[0]).toMatchObject({ sessions: 2, completedWorkingSets: 2, externalLoadVolumeKg: 900, durationMinutes: 120 });
    expect(weeks[0].muscleSets.chest).toBe(2);
    expect(weeks[1]).toEqual({ weekStart: "2026-08-10", sessions: 0, completedWorkingSets: 0, externalLoadVolumeKg: 0, durationMinutes: 0, muscleSets: {} });
    expect(weeks[2]).toMatchObject({ sessions: 1, completedWorkingSets: 1, externalLoadVolumeKg: 500 });
  });

  it("builds a sorted series for one body measurement and skips missing values", () => {
    const metrics: BodyMetric[] = [
      { id: "m3", date: "2026-08-20", weightKg: 71.5, waistCm: 80 },
      { id: "m1", date: "2026-08-01", weightKg: 73 },
      { id: "m2", date: "2026-08-10", waistCm: 82 }
    ];
    expect(bodyMetricSeries(metrics, "weightKg")).toEqual([{ date: "2026-08-01", value: 73 }, { date: "2026-08-20", value: 71.5 }]);
    expect(bodyMetricSeries(metrics, "waistCm")).toEqual([{ date: "2026-08-10", value: 82 }, { date: "2026-08-20", value: 80 }]);
    expect(bodyMetricSeries(metrics, "armCm")).toEqual([]);
  });

  it("estimates muscle recovery from finished working sets", () => {
    const sets = (prefix: string, count: number, type: SetLog["type"] = "working") => Array.from({ length: count }, (_, index) => completedSet(`${prefix}_${index}`, { type, weightKg: 20, reps: 10 }));
    const sessions = [
      session("push", "2026-08-10T10:00:00.000Z", [exercise("chest_press__dumbbell", [...sets("warm", 2, "warmup"), ...sets("push", 3), { id: "open", type: "working" }])]),
      session("unfinished", undefined, [exercise("squat__barbell", sets("legs", 5))])
    ];
    const at = (iso: string) => Object.fromEntries(muscleRecoveryMap(sessions, new Date(iso)).map((item) => [item.muscle, item]));

    // Chest: 3 primary sets -> 48 h window. Triceps: 1.5 effective sets -> 42 h window.
    const early = at("2026-08-11T06:00:00.000Z");
    expect(early.chest).toMatchObject({ status: "fatigued", recoveryPercent: 41, hoursUntilReady: 28, lastTrainedAt: "2026-08-10T10:00:00.000Z" });
    expect(early.triceps).toMatchObject({ status: "fatigued", recoveryPercent: 47, hoursUntilReady: 22 });
    expect(early.quadriceps).toMatchObject({ status: "ready", recoveryPercent: 100, hoursUntilReady: 0, lastTrainedAt: undefined });
    expect(early.full_body).toBeUndefined();

    const later = at("2026-08-11T22:00:00.000Z");
    expect(later.chest.status).toBe("recovering");
    expect(later.triceps.status).toBe("recovering");
    expect(at("2026-08-12T10:00:00.000Z").chest).toMatchObject({ status: "ready", hoursUntilReady: 0 });
    expect(at("2026-08-12T10:00:00.000Z").chest.weeklySets).toBe(3);
    expect(at("2026-08-09T10:00:00.000Z").chest.status).toBe("ready");

    // Heavy session (15 sets -> 96 h window) then a light one (1 set -> 40 h) 31 h later: the light one
    // is the least recovered (19/40), but the heavy one still needs 46 h.
    const overlapping = [
      session("heavy", "2026-08-10T10:00:00.000Z", [exercise("chest_press__dumbbell", sets("heavy", 15))]),
      session("light", "2026-08-11T17:00:00.000Z", [exercise("chest_press__dumbbell", sets("light", 1))])
    ];
    const chest = muscleRecoveryMap(overlapping, new Date("2026-08-12T12:00:00.000Z")).find((item) => item.muscle === "chest");
    expect(chest).toMatchObject({ status: "fatigued", recoveryPercent: 47, hoursUntilReady: 46, lastTrainedAt: "2026-08-11T17:00:00.000Z" });
  });
});
