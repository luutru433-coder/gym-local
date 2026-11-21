import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "@gym/contracts";
import { cancelRunningSet, lastFinishedSet, nextOpenSet, reopenSet, runningSeconds, runningSet, stampWorkSeconds, startSet, timingSummary } from "./set-timer";

const name = { vi: "Đẩy ngực", en: "Chest press" };
const at = (seconds: number) => new Date(Date.UTC(2026, 7, 10, 1, 0, seconds)).getTime();
const iso = (seconds: number) => new Date(at(seconds)).toISOString();

function session(): WorkoutSession {
  const block = (id: string) => ({
    id,
    movementId: "chest_press",
    variantId: "chest_press__dumbbell",
    movementNameSnapshot: name,
    variantNameSnapshot: name,
    loadEntryModeSnapshot: "per_hand" as const,
    restSeconds: 90,
    sets: [{ id: `${id}-1`, type: "working" as const }, { id: `${id}-2`, type: "working" as const }]
  });
  return { id: "s", startedAt: iso(0), activeExerciseId: "a", exercises: [block("a"), block("b")] };
}

describe("set timer", () => {
  it("starts a set, stops the rest countdown, and times the set when it ends", () => {
    const started = startSet({ ...session(), restTimerEndsAt: iso(500) }, "a", "a-1", at(10));
    expect(started.restTimerEndsAt).toBeUndefined();
    expect(runningSet(started)).toMatchObject({ setNumber: 1, set: { id: "a-1", startedAt: iso(10) } });
    expect(started.exercises[0].sets[0].restBeforeSeconds).toBeUndefined();
    expect(runningSeconds(started.exercises[0].sets[0], at(52))).toBe(42);

    started.exercises[0].sets[0].completedAt = iso(57);
    const ended = stampWorkSeconds(started, "a", "a-1");
    expect(ended.exercises[0].sets[0].workSeconds).toBe(47);
    expect(runningSet(ended)).toBeUndefined();
    expect(lastFinishedSet(ended)?.set.id).toBe("a-1");
    expect(nextOpenSet(ended)).toMatchObject({ setNumber: 2, set: { id: "a-2" } });

    const second = startSet(ended, "a", "a-2", at(181));
    expect(second.exercises[0].sets[1].restBeforeSeconds).toBe(124);
    second.exercises[0].sets[1].completedAt = iso(231);
    expect(timingSummary(stampWorkSeconds(second, "a", "a-2"))).toEqual({ timedSets: 2, averageWorkSeconds: 49, averageRestSeconds: 124 });
  });

  it("keeps one running set, and cancelling or undoing clears the timing", () => {
    const first = startSet(session(), "a", "a-1", at(5));
    const moved = startSet(first, "b", "b-1", at(9));
    expect(moved.exercises[0].sets[0].startedAt).toBeUndefined();
    expect(runningSet(moved)?.set.id).toBe("b-1");
    expect(moved.activeExerciseId).toBe("b");
    expect(runningSet(cancelRunningSet(moved))).toBeUndefined();

    moved.exercises[1].sets[0].completedAt = iso(40);
    const reopened = reopenSet({ ...stampWorkSeconds(moved, "b", "b-1"), restTimerEndsAt: iso(130) }, "b", "b-1");
    expect(reopened.exercises[1].sets[0]).toEqual({ id: "b-1", type: "working", completedAt: undefined });
    expect(reopened.restTimerEndsAt).toBeUndefined();
  });

  it("stores no timing for a set completed without a start and refuses to start a finished set", () => {
    const live = session();
    live.exercises[0].sets[0].completedAt = iso(30);
    expect(stampWorkSeconds(live, "a", "a-1").exercises[0].sets[0].workSeconds).toBeUndefined();
    expect(() => startSet(live, "a", "a-1", at(40))).toThrow();
    expect(nextOpenSet({ ...live, activeExerciseId: "b" })?.set.id).toBe("b-1");
  });
});
