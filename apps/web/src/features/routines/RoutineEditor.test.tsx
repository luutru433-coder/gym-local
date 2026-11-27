import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("RoutineEditor exercise order", () => {
  afterEach(cleanup);

  it("cancels a drag on Escape without closing the editor or losing its draft", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const routine: Routine = {
      id: "routine",
      name: { vi: "Lịch tập", en: "Routine" },
      goal: profile.goal,
      difficulty: profile.experience,
      daysPerWeek: profile.daysPerWeek,
      templateVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      items: ["one", "two"].map((id) => ({
        id,
        movementId: "plank",
        preferredVariantId: "plank__bodyweight",
        restSeconds: 90,
        sets: [{ id: `set-${id}`, type: "working", durationSeconds: 30 }]
      }))
    };
    render(<RoutineEditor routine={routine} profile={profile} onClose={onClose} onSave={vi.fn()} />);
    const name = screen.getByLabelText("English name");
    await user.type(name, " draft");

    const rows = screen.getAllByRole("listitem");
    rows.forEach((row, index) => {
      row.getBoundingClientRect = () => new DOMRect(0, 100 + index * 100, 300, 90);
    });
    const [handle] = screen.getAllByTitle("Drag to reorder exercise");
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn();
    const pointer = { pointerId: 1, isPrimary: true, pointerType: "mouse" };
    fireEvent.pointerDown(handle, { ...pointer, clientY: 125 });
    fireEvent.pointerMove(handle, { ...pointer, clientY: 260 });
    expect(rows[1]).toHaveAttribute("data-exercise-drop", "after");

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(rows[0]).not.toHaveAttribute("data-exercise-dragging");
    expect(rows[1]).not.toHaveAttribute("data-exercise-drop");
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
    fireEvent.pointerUp(handle, { ...pointer, clientY: 260 });
    expect(screen.getAllByRole("listitem")).toEqual(rows);
    expect(name).toHaveValue("Routine draft");

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves a dragged exercise in its new position with its set targets intact", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(routine: Routine) => Promise<void>>().mockResolvedValue(undefined);
    render(<RoutineEditor profile={profile} onClose={() => undefined} onSave={onSave} />);
    await user.type(screen.getByLabelText("English name"), "Core day");
    const search = screen.getByLabelText("Search exercises");
    await user.type(search, "Plank");
    await user.click(screen.getByRole("button", { name: /^Plank/ }));
    await user.clear(search);
    await user.type(search, "Chest Press");
    await user.click(screen.getByRole("button", { name: /^Chest Press/ }));

    screen.getAllByRole("listitem").forEach((row, index) => {
      row.getBoundingClientRect = () => new DOMRect(0, 100 + index * 100, 300, 90);
    });
    const [handle] = screen.getAllByTitle("Drag to reorder exercise");
    handle.setPointerCapture = vi.fn();
    const pointer = { pointerId: 1, isPrimary: true, pointerType: "touch" };
    fireEvent.pointerDown(handle, { ...pointer, clientY: 125 });
    fireEvent.pointerMove(handle, { ...pointer, clientY: 260 });
    fireEvent.pointerUp(handle, { ...pointer, clientY: 260 });

    await user.click(screen.getByRole("button", { name: "Save routine" }));
    expect(onSave.mock.calls[0][0].items).toMatchObject([
      { movementId: "chest_press", sets: [{ minReps: 8 }, { minReps: 8 }, { minReps: 8 }] },
      { movementId: "plank", sets: [{ durationSeconds: 30 }, { durationSeconds: 30 }, { durationSeconds: 30 }] }
    ]);
  });
});
