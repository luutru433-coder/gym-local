import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, getVariant } from "@gym/catalog";
import { WorkoutPage } from "./WorkoutPage";
import { useGymStore } from "../../store/useGymStore";

const timestamp = "2026-08-13T10:00:00.000Z";

const profile: Profile = {
  id: "profile",
  displayName: "Minh",
  locale: "vi",
  units: "metric",
  goal: "hypertrophy",
  experience: "beginner",
  daysPerWeek: 3,
  locations: [{ id: "home", name: "Nhà", equipment: ["dumbbell", "barbell", "bench", "bodyweight"] }],
  activeLocationId: "home",
  onboardingComplete: true,
  createdAt: timestamp,
  updatedAt: timestamp
};

function session(variantId = "chest_press__dumbbell"): WorkoutSession {
  const selectedVariant = getVariant(variantId)!;
  const selectedMovement = getMovement(selectedVariant.movementId)!;
  return {
    id: "session-live",
    startedAt: timestamp,
    activeExerciseId: "exercise-one",
    restTimerEndsAt: "2099-01-01T00:01:30.000Z",
    exercises: [{
      id: "exercise-one",
      movementId: selectedMovement.id,
      movementNameSnapshot: selectedMovement.name,
      variantId: selectedVariant.id,
      variantNameSnapshot: selectedVariant.name,
      loadEntryModeSnapshot: selectedVariant.loadEntryMode,
      trackingProfileSnapshot: getTrackingProfile(selectedVariant.id),
      sets: [
        { id: "set-one", type: "working" },
        { id: "set-two", type: "working" }
      ],
      restSeconds: 90
    }]
  };
}

function arrange(activeSession: WorkoutSession | undefined, persist?: (next: WorkoutSession) => Promise<void>) {
  const defaultPersist = async (next: WorkoutSession) => {
    useGymStore.setState((state) => ({
      activeSession: next,
      sessions: [next, ...state.sessions.filter((candidate) => candidate.id !== next.id)],
      sessionSaveStatus: "saved"
    }));
  };
  const setActiveSession = vi.fn(persist ?? defaultPersist);
  useGymStore.setState({
    profile,
    activeSession,
    sessions: activeSession ? [activeSession] : [],
    sessionSaveStatus: activeSession ? "saved" : "idle",
    error: undefined,
    setActiveSession
  });
  render(<MemoryRouter><WorkoutPage /></MemoryRouter>);
  return { setActiveSession };
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("live workout editing", () => {
  it("changes set type, removes unfinished sets, and persists notes", async () => {
    const user = userEvent.setup();
    arrange(session());

    expect(screen.getByText("Không tự điền")).toBeInTheDocument();
    expect(screen.getByText(/Chưa đủ set chính đã hoàn tất của đúng biến thể/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Loại của set 1" }), "drop");
    await waitFor(() => expect(useGymStore.getState().activeSession?.exercises[0]?.sets[0]?.type).toBe("drop"));

    await user.click(screen.getByRole("button", { name: "Xóa set 2" }));
    await waitFor(() => expect(useGymStore.getState().activeSession?.exercises[0]?.sets).toHaveLength(1));

    const note = screen.getByRole("textbox", { name: "Ghi chú bài tập" });
    await user.type(note, "Ghế nấc 4");
    await user.tab();
    await waitFor(() => expect(useGymStore.getState().activeSession?.exercises[0]?.note).toBe("Ghế nấc 4"));
  });

  it("starts a freestyle session and opens the exact-variant picker", async () => {
    const user = userEvent.setup();
    arrange(undefined);

    await user.click(screen.getByRole("button", { name: "Tập tự do" }));

    expect(await screen.findByRole("dialog", { name: "Thêm bài tập" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Tìm bài tập" })).toBeInTheDocument();
    expect(useGymStore.getState().activeSession).toMatchObject({ exercises: [] });
    expect(useGymStore.getState().activeSession?.routineId).toBeUndefined();
  });

  it("keeps the failed mutation available for an explicit retry", async () => {
    const user = userEvent.setup();
    const original = session();
    let attempt = 0;
    const persist = async (next: WorkoutSession) => {
      attempt += 1;
      if (attempt === 1) {
        useGymStore.setState({ activeSession: original, sessionSaveStatus: "error", error: "disk full" });
        throw new Error("disk full");
      }
      useGymStore.setState({ activeSession: next, sessions: [next], sessionSaveStatus: "saved", error: undefined });
    };
    const { setActiveSession } = arrange(original, persist);

    await user.selectOptions(screen.getByRole("combobox", { name: "Loại của set 1" }), "failure");

    expect(await screen.findByRole("alert")).toHaveTextContent("Thay đổi gần nhất chưa được lưu");
    await user.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(useGymStore.getState().activeSession?.exercises[0]?.sets[0]?.type).toBe("failure"));
    expect(setActiveSession).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Đã lưu trên thiết bị")).toBeInTheDocument();
  });

  it("shows display-only per-side plates for eligible exact variants", () => {
    const barbellSession = session("chest_press__barbell");
    barbellSession.exercises[0].sets[0].weightKg = 100;
    arrange(barbellSession);

    expect(screen.getByText("Mỗi bên: 25 + 15 kg")).toBeInTheDocument();
    expect(screen.getByText("Chỉ tính số bánh mỗi bên; không thay đổi tải của set.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Khối lượng thanh hoặc Smith, kg" })).toHaveValue(20);
  });
});
