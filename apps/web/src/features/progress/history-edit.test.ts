import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "@gym/contracts";
import { applySessionDraft, draftProblem, newSetDraft, sessionDraft } from "./history-edit";

function session(): WorkoutSession {
  return {
    id: "session_1",
    startedAt: new Date(2026, 7, 10, 18, 0).toISOString(),
    finishedAt: new Date(2026, 7, 10, 19, 0).toISOString(),
    exercises: [{
      id: "exercise_1",
      movementId: "chest_press",
      movementNameSnapshot: { vi: "Đẩy ngực ngang", en: "Chest Press" },
      variantId: "chest_press__barbell",
      variantNameSnapshot: { vi: "Đẩy ngực ngang · Tạ đòn", en: "Barbell Chest Press" },
      loadEntryModeSnapshot: "total_weight",
      restSeconds: 120,
      sets: [
        { id: "set_1", type: "working", weightKg: 60, reps: 8, rir: 2, rpe: 8, completedAt: new Date(2026, 7, 10, 18, 10).toISOString() },
        { id: "set_2", type: "working", weightKg: 60, reps: 7, completedAt: new Date(2026, 7, 10, 18, 15).toISOString() },
        { id: "set_3", type: "working", targetMinReps: 8 }
      ]
    }]
  };
}

describe("history edit drafts", () => {
  it("drafts only logged sets and round-trips unchanged", () => {
    const original = session();
    const draft = sessionDraft(original);
    expect(draft).toMatchObject({ date: "2026-08-10", time: "18:00", durationMinutes: "60" });
    expect(draft.exercises[0]!.sets.map((set) => set.id)).toEqual(["set_1", "set_2"]);
    expect(draftProblem(original, draft)).toBeUndefined();
    expect(applySessionDraft(original, draft)).toEqual(original);
  });

  it("applies corrected numbers, removed and added sets, and a moved date", () => {
    const original = session();
    const draft = sessionDraft(original);
    draft.date = "2026-08-09";
    draft.durationMinutes = "45";
    draft.notes = "  sửa lại  ";
    const sets = draft.exercises[0]!.sets;
    sets[0] = { ...sets[0]!, weightKg: "62,5", reps: "9", rir: "" };
    sets.splice(1, 1, { ...newSetDraft(sets[0]), id: "set_new" });

    const updated = applySessionDraft(original, draft);
    const exercise = updated.exercises[0]!;
    expect(updated.startedAt).toBe(new Date(2026, 7, 9, 18, 0).toISOString());
    expect(updated.finishedAt).toBe(new Date(2026, 7, 9, 18, 45).toISOString());
    expect(updated.notes).toBe("sửa lại");
    expect(exercise.variantId).toBe("chest_press__barbell");
    expect(exercise.sets.map((set) => set.id)).toEqual(["set_1", "set_new", "set_3"]);
    expect(exercise.sets[0]).toEqual({ id: "set_1", type: "working", weightKg: 62.5, reps: 9, rpe: 8, completedAt: new Date(2026, 7, 9, 18, 10).toISOString() });
    expect(exercise.sets[1]).toMatchObject({ weightKg: 62.5, reps: 9, completedAt: updated.finishedAt });
    expect(exercise.sets[2]!.completedAt).toBeUndefined();
    expect(original.exercises[0]!.sets[0]!.weightKg).toBe(60);
  });

  it("rejects empty sets, future dates, and bad durations", () => {
    const original = session();
    const empty = sessionDraft(original);
    empty.exercises[0]!.sets[0]!.reps = "0";
    expect(draftProblem(original, empty)).toBe("set");

    const future = sessionDraft(original);
    future.date = "2999-01-01";
    expect(draftProblem(original, future)).toBe("date");

    const long = sessionDraft(original);
    long.durationMinutes = "5000";
    expect(draftProblem(original, long)).toBe("duration");
  });

  it("drops an exercise removed from the draft", () => {
    const original = session();
    const draft = sessionDraft(original);
    draft.exercises = [];
    expect(applySessionDraft(original, draft).exercises).toEqual([]);
  });
});
