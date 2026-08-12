import { describe, expect, it } from "vitest";
import type { SessionExercise, SetLog, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, getVariant } from "@gym/catalog";
import {
  estimatedOneRepMax,
  latestVariantHistory,
  personalRecord,
  sessionVolumeMetrics,
  setPerformanceMetrics,
  variantHistory
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
});
