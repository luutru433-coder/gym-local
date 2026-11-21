import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile, Routine } from "@gym/contracts";
import { RoutineEditor } from "./RoutineEditor";

const timestamp = "2026-08-13T10:00:00.000Z";

const profile: Profile = {
  id: "profile",
  displayName: "Minh",
  locale: "en",
  units: "metric",
  goal: "hypertrophy",
  experience: "beginner",
  daysPerWeek: 3,
  locations: [{ id: "home", name: "Home", equipment: ["dumbbell", "barbell", "bench", "bodyweight"] }],
  activeLocationId: "home",
  onboardingComplete: true,
  createdAt: timestamp,
  updatedAt: timestamp
};

async function saveRoutineWith(exerciseName: string, addSet = false): Promise<Routine> {
  const user = userEvent.setup();
  const onSave = vi.fn<(routine: Routine) => Promise<void>>().mockResolvedValue(undefined);
  render(<RoutineEditor profile={profile} onClose={() => undefined} onSave={onSave} />);
  await user.type(screen.getByLabelText("English name"), "Core day");
  await user.type(screen.getByLabelText("Search exercises"), exerciseName);
  await user.click(screen.getByRole("button", { name: new RegExp(`^${exerciseName}`) }));
  if (addSet) await user.click(screen.getByRole("button", { name: "Add set" }));
  await user.click(screen.getByRole("button", { name: "Save routine" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  return onSave.mock.calls[0][0];
}

describe("RoutineEditor default set targets", () => {
  afterEach(cleanup);

  it("saves a timed exercise with a duration target and no rep range", async () => {
    const routine = await saveRoutineWith("Plank", true);
    expect(routine.items[0].preferredVariantId).toBe("plank__bodyweight");
    expect(routine.items[0].sets).toHaveLength(4);
    for (const set of routine.items[0].sets) {
      expect(set.durationSeconds).toBe(30);
      expect(set.minReps).toBeUndefined();
      expect(set.maxReps).toBeUndefined();
    }
  });

  it("saves a distance-tracked exercise with a duration target and no rep range", async () => {
    const routine = await saveRoutineWith("Farmer Carry");
    for (const set of routine.items[0].sets) {
      expect(set.durationSeconds).toBe(30);
      expect(set.minReps).toBeUndefined();
      expect(set.maxReps).toBeUndefined();
    }
  });

  it("keeps the 8 to 12 rep default for a rep-tracked exercise", async () => {
    const routine = await saveRoutineWith("Chest Press");
    for (const set of routine.items[0].sets) {
      expect(set).toMatchObject({ minReps: 8, maxReps: 12 });
      expect(set.durationSeconds).toBeUndefined();
    }
  });
});
