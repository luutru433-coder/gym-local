import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, getVariant } from "@gym/catalog";
import { WorkoutPage } from "./WorkoutPage";
import { setRestAlertMuted } from "@gym/storage/device";
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
  it("groups two exercises into a superset and alternates sets before resting", async () => {
    const user = userEvent.setup();
    const base = session();
    base.restTimerEndsAt = undefined;
    base.exercises.push({ ...structuredClone(base.exercises[0]), id: "exercise-two", sets: [{ id: "set-three", type: "working" }] });
    arrange(base);

    await user.click(screen.getByRole("button", { name: "Ghép bài sau" }));
    await waitFor(() => expect(useGymStore.getState().activeSession?.exercises.map((exercise) => exercise.supersetGroup)).toEqual(["A", "A"]));
    expect(screen.getByText(/không nghỉ/)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Set 1, Số lần" }), "10");
    await user.click(screen.getByRole("button", { name: "Hoàn tất set 1" }));
    await waitFor(() => expect(useGymStore.getState().activeSession?.activeExerciseId).toBe("exercise-two"));
    expect(useGymStore.getState().activeSession?.restTimerEndsAt).toBeUndefined();
    expect(screen.getByText(/hết lượt: nghỉ 90s/)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Set 1, Số lần" }), "8");
    await user.click(screen.getByRole("button", { name: "Hoàn tất set 1" }));
    await waitFor(() => expect(useGymStore.getState().activeSession?.restTimerEndsAt).toBeDefined());
    expect(useGymStore.getState().activeSession?.activeExerciseId).toBe("exercise-one");
  });

  it("changes set type, removes unfinished sets, and persists notes", async () => {
    const user = userEvent.setup();
    arrange(session());

    expect(screen.getByText("Bạn quyết định")).toBeInTheDocument();
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

  it("completes a set in one tap with last time's weight and reps for the exact variant", async () => {
    const user = userEvent.setup();
    const live = session();
    live.restTimerEndsAt = undefined;
    const lastTime: WorkoutSession = {
      ...session(),
      id: "session-last",
      restTimerEndsAt: undefined,
      finishedAt: "2026-08-10T10:00:00.000Z"
    };
    lastTime.exercises[0].sets = [
      { id: "last-one", type: "working", weightKg: 40, reps: 10, completedAt: "2026-08-10T09:30:00.000Z" },
      { id: "last-two", type: "working", weightKg: 40, reps: 8, completedAt: "2026-08-10T09:35:00.000Z" }
    ];
    arrange(live);
    useGymStore.setState({ sessions: [live, lastTime] });

    const reps = await screen.findByRole("textbox", { name: "Set 1, Số lần" });
    expect(reps).toHaveValue("");
    expect(reps).toHaveAttribute("placeholder", "10");

    await user.click(screen.getByRole("button", { name: "Hoàn tất set 1 với 40 kg × 10" }));
    await waitFor(() => expect(useGymStore.getState().activeSession?.exercises[0]?.sets[0]).toMatchObject({ weightKg: 40, reps: 10 }));
    expect(useGymStore.getState().activeSession?.exercises[0]?.sets[0]?.completedAt).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: "Set 2, Số lần" }), "9");
    await user.click(screen.getByRole("button", { name: "Hoàn tất set 2 với 40 kg × 9" }));
    await waitFor(() => expect(useGymStore.getState().activeSession?.exercises[0]?.sets[1]).toMatchObject({ weightKg: 40, reps: 9 }));
  });

  it("keeps completion disabled when there is nothing to suggest", () => {
    arrange(session());
    expect(screen.getByRole("button", { name: "Set 1: nhập số lần, quãng đường hoặc thời gian trước" })).toBeDisabled();
  });

  it("alerts with vibration once when a running rest countdown ends, unless muted", async () => {
    const user = userEvent.setup();
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    setRestAlertMuted(false);
    const live = session();
    live.restTimerEndsAt = new Date(Date.now() + 1100).toISOString();
    arrange(live);

    expect(vibrate).not.toHaveBeenCalled();
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(screen.getByText("Hết giờ nghỉ, sẵn sàng tập")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Âm báo và rung khi hết giờ nghỉ" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Bắt đầu lại giờ nghỉ" }));
    await user.click(screen.getByRole("button", { name: "Giảm 15 giây nghỉ" }));
    expect(vibrate).toHaveBeenCalledTimes(1);
    setRestAlertMuted(false);
  });

  it("stays silent for a rest timer that had already expired", async () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    const live = session();
    live.restTimerEndsAt = new Date(Date.now() - 60000).toISOString();
    arrange(live);

    expect(await screen.findByText("Hết giờ nghỉ, sẵn sàng tập", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("badges a new exact-variant record live and shows the finish summary", async () => {
    const user = userEvent.setup();
    const live = session();
    live.restTimerEndsAt = undefined;
    live.exercises[0].sets = [
      { id: "set-one", type: "working", weightKg: 40, reps: 10, completedAt: "2026-08-13T10:05:00.000Z" },
      { id: "set-two", type: "working" }
    ];
    const lastTime: WorkoutSession = { ...session(), id: "session-last", restTimerEndsAt: undefined, finishedAt: "2026-08-10T10:00:00.000Z" };
    lastTime.exercises[0].sets = [{ id: "last-one", type: "working", weightKg: 40, reps: 8, completedAt: "2026-08-10T09:30:00.000Z" }];
    arrange(live);
    const completeWorkout = vi.fn(async () => {
      const finished = { ...useGymStore.getState().activeSession!, finishedAt: "2026-08-13T10:45:00.000Z" };
      useGymStore.setState({ activeSession: undefined, sessions: [finished, lastTime] });
      return finished;
    });
    useGymStore.setState({ sessions: [live, lastTime], completeWorkout });

    expect(await screen.findByText("Kỷ lục mới")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kết thúc" }));

    expect(await screen.findByRole("heading", { name: "Hoàn thành buổi tập" })).toBeInTheDocument();
    expect(completeWorkout).toHaveBeenCalledTimes(1);
    expect(screen.getByText("45 phút")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("800 kg")).toBeInTheDocument();
    expect(screen.getByText("1RM ước tính")).toBeInTheDocument();
    expect(screen.getByText("40 kg × 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem tiến độ" })).toBeInTheDocument();
  });

  it("starts and ends a set from the focus panel, then rests and lets the reps be corrected", async () => {
    const user = userEvent.setup();
    const live = session();
    live.restTimerEndsAt = undefined;
    live.exercises[0].sets[0] = { id: "set-one", type: "working", targetMinReps: 8, targetMaxReps: 10, weightKg: 20 };
    arrange(live);

    await user.click(screen.getByRole("button", { name: "Bắt đầu set 1" }));
    const started = useGymStore.getState().activeSession!.exercises[0].sets[0];
    expect(started.startedAt).toBeDefined();
    expect(screen.getByRole("timer", { name: /Thời gian set/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kết thúc set" }));
    const ended = useGymStore.getState().activeSession!;
    expect(ended.exercises[0].sets[0]).toMatchObject({ reps: 10, weightKg: 20 });
    expect(ended.exercises[0].sets[0].completedAt).toBeDefined();
    expect(ended.exercises[0].sets[0].workSeconds).toBeGreaterThanOrEqual(0);
    expect(ended.restTimerEndsAt).toBeDefined();
    expect(screen.getByRole("timer", { name: /Thời gian nghỉ còn lại/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Giảm lần" }));
    expect(useGymStore.getState().activeSession!.exercises[0].sets[0].reps).toBe(9);

    await user.click(screen.getByRole("button", { name: "Bắt đầu set 2" }));
    const next = useGymStore.getState().activeSession!;
    expect(next.restTimerEndsAt).toBeUndefined();
    expect(next.exercises[0].sets[1].restBeforeSeconds).toBeGreaterThanOrEqual(0);
  });
});
