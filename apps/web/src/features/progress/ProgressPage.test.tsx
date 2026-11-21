import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BodyMetric, Profile, WorkoutSession } from "@gym/contracts";
import { defaultSettings } from "@gym/storage";
import { useGymStore } from "../../store/useGymStore";
import { removeBodyMetric, removePastSession, updatePastSession } from "./history-actions";
import { ProgressPage } from "./ProgressPage";

vi.mock("./history-actions", () => ({
  removeBodyMetric: vi.fn(async () => undefined),
  removePastSession: vi.fn(async () => undefined),
  updatePastSession: vi.fn(async () => undefined)
}));

const timestamp = "2026-08-13T10:00:00.000Z";

function profile(): Profile {
  return {
    id: "profile", displayName: "Minh", locale: "vi", units: "metric", experience: "intermediate", daysPerWeek: 4,
    locations: [], onboardingComplete: true, biologicalSex: "male", age: 30, heightCm: 175, weightKg: 75,
    activityFactor: 1.55, goal: "hypertrophy", createdAt: timestamp, updatedAt: timestamp
  } as Profile;
}

function pastSession(): WorkoutSession {
  return {
    id: "session_past",
    startedAt: "2026-08-10T11:00:00.000Z",
    finishedAt: "2026-08-10T12:00:00.000Z",
    exercises: [{
      id: "exercise_1", movementId: "chest_press", movementNameSnapshot: { vi: "Đẩy ngực ngang", en: "Chest Press" },
      variantId: "chest_press__barbell", variantNameSnapshot: { vi: "Đẩy ngực tạ đòn", en: "Barbell Chest Press" },
      loadEntryModeSnapshot: "total_weight", restSeconds: 120,
      sets: [{ id: "set_1", type: "working", weightKg: 60, reps: 8, completedAt: "2026-08-10T11:10:00.000Z" }]
    }]
  };
}

function setup(overrides: Partial<ReturnType<typeof useGymStore.getState>> = {}) {
  useGymStore.setState({
    profile: profile(), settings: defaultSettings, activeSession: undefined,
    sessions: [pastSession()], bodyMetrics: [{ id: "metric_1", date: "2026-08-10", weightKg: 75 }],
    ...overrides
  });
  render(<ProgressPage />);
  return userEvent.setup();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("editing history", () => {
  it("saves corrected set numbers for a past workout", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: /Đẩy ngực tạ đòn|Buổi tập/ }));
    await user.click(screen.getByRole("button", { name: "Sửa buổi tập" }));
    const dialog = screen.getByRole("dialog", { name: "Sửa buổi tập" });
    const reps = within(dialog).getByRole("textbox", { name: "Đẩy ngực tạ đòn, set 1, reps" });
    await user.clear(reps);
    expect(within(dialog).getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    await user.type(reps, "10");
    await user.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(updatePastSession).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(updatePastSession).mock.calls[0]![0];
    expect(saved.exercises[0]!.sets[0]).toMatchObject({ id: "set_1", weightKg: 60, reps: 10 });
    expect(saved.exercises[0]!.variantId).toBe("chest_press__barbell");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Sửa buổi tập" })).toBeNull());
  });

  it("deletes a past workout only after confirmation", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: /Đẩy ngực tạ đòn|Buổi tập/ }));
    await user.click(screen.getByRole("button", { name: "Xóa buổi tập" }));
    expect(removePastSession).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog", { name: "Xóa buổi tập?" })).getByRole("button", { name: "Xóa" }));
    await waitFor(() => expect(removePastSession).toHaveBeenCalledWith("session_past"));
  });

  it("edits a body measurement in place and deletes one after confirmation", async () => {
    const addBodyMetric = vi.fn<(metric: BodyMetric) => Promise<void>>(async () => undefined);
    const user = setup({ addBodyMetric });

    await user.click(screen.getByRole("button", { name: /^Sửa số đo ngày/ }));
    const dialog = screen.getByRole("dialog", { name: "Sửa số đo cơ thể" });
    const weight = within(dialog).getAllByRole("spinbutton")[0]!;
    expect(weight).toHaveValue(75);
    await user.clear(weight);
    await user.type(weight, "74");
    await user.click(within(dialog).getByRole("button", { name: "Lưu số đo" }));
    await waitFor(() => expect(addBodyMetric).toHaveBeenCalledWith(expect.objectContaining({ id: "metric_1", date: "2026-08-10", weightKg: 74 })));

    await user.click(screen.getByRole("button", { name: /^Xóa số đo ngày/ }));
    expect(removeBodyMetric).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog", { name: "Xóa số đo?" })).getByRole("button", { name: "Xóa" }));
    await waitFor(() => expect(removeBodyMetric).toHaveBeenCalledWith("metric_1"));
  });
});
