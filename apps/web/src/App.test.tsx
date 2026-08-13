import "fake-indexeddb/auto";
import { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chip, Modal, ProgressBar, ToggleGroup, ToggleGroupItem } from "@gym/ui";
import type { Profile, WorkoutSession } from "@gym/contracts";
import { defaultSettings, exportAllData, getProfile, gymDb, initializeDatabase, listRoutines, saveProfile, saveSession } from "@gym/storage";
import { App } from "./App";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { useGymStore } from "./store/useGymStore";

beforeEach(async () => {
  document.documentElement.lang = "vi";
  gymDb.close();
  await gymDb.delete();
  await gymDb.open();
  useGymStore.setState({
    ready: false,
    busy: false,
    error: undefined,
    notice: undefined,
    profile: undefined,
    routines: [],
    programs: [],
    sessions: [],
    activeSession: undefined,
    foods: [],
    meals: [],
    bodyMetrics: [],
    settings: defaultSettings,
    recoveryAvailable: false,
    sessionSaveStatus: "idle",
    sessionSaveRevision: 0
  });
});

afterEach(async () => {
  cleanup();
  gymDb.close();
  await gymDb.delete();
});

describe("application onboarding", () => {
  it("hydrates an empty database and persists the starter profile and routines", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Tập thông minh hơn. Dữ liệu vẫn là của bạn." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tăng cơ" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tăng sức mạnh" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "3 buổi mỗi tuần" })).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText("Tên hiển thị"), "Minh");
    await user.click(screen.getByRole("button", { name: /Tiếp tục/ }));
    expect(screen.getByRole("button", { name: /tạ đơn/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Tiếp tục/ }));
    await user.click(screen.getByRole("button", { name: /Bắt đầu/ }));

    await waitFor(() => expect(useGymStore.getState().profile?.onboardingComplete).toBe(true));
    expect((await getProfile())?.displayName).toBe("Minh");
    expect(await listRoutines()).toHaveLength(2);
  });

  it("synchronizes the document language during onboarding", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Tập thông minh hơn. Dữ liệu vẫn là của bạn." })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "vi");

    await user.click(screen.getByRole("button", { name: /English/ }));

    expect(await screen.findByRole("heading", { name: "Train smarter. Keep your data yours." })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "en");
  });
});

function ModalHarness({ revision = 0 }: { revision?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      <Modal open={open} title="Accessible dialog" onClose={() => setOpen(false)}>
        <span>Revision {revision}</span>
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Modal>
    </>
  );
}

describe("accessible UI primitives", () => {
  it("exposes selection and progress states", () => {
    render(
      <ToggleGroup label="Equipment">
        <ToggleGroupItem pressed>Machine</ToggleGroupItem>
        <ToggleGroupItem pressed={false}>Cable</ToggleGroupItem>
        <Chip active>Dumbbell</Chip>
        <ProgressBar value={42} label="Workout progress" />
      </ToggleGroup>
    );

    expect(screen.getByRole("group", { name: "Equipment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Machine" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Cable" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dumbbell" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("progressbar", { name: "Workout progress" })).toHaveAttribute("aria-valuetext", "42%");
  });

  it("keeps focus inside a modal, closes with Escape, and restores its trigger", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<ModalHarness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Accessible dialog" });
    const closeButton = screen.getByRole("button", { name: "Đóng" });
    const firstAction = screen.getByRole("button", { name: "First action" });
    const lastAction = screen.getByRole("button", { name: "Last action" });
    expect(dialog).toBeInTheDocument();
    expect(closeButton).toHaveFocus();
    expect(container).toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(firstAction);
    rerender(<ModalHarness revision={1} />);
    expect(firstAction).toHaveFocus();

    await user.click(lastAction);
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(lastAction).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Accessible dialog" })).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute("inert");
    expect(container).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });
});

describe("PWA update prompt", () => {
  it("re-prompts after a deferred workout ends", async () => {
    const user = userEvent.setup();
    const postMessage = vi.fn();
    const registration = {
      waiting: { postMessage },
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as ServiceWorkerRegistration;
    const serviceWorker = {
      ready: Promise.resolve(registration),
      controller: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as ServiceWorkerContainer;
    const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
    useGymStore.setState({
      activeSession: {
        id: "session-update-test",
        startedAt: new Date().toISOString(),
        exercises: []
      }
    });

    try {
      render(<UpdatePrompt />);
      expect(await screen.findByText("Có phiên bản mới")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Để sau" }));
      expect(screen.queryByText("Có phiên bản mới")).not.toBeInTheDocument();

      await act(async () => {
        useGymStore.setState({ activeSession: undefined });
      });

      expect(await screen.findByText("Có phiên bản mới")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cập nhật" }));
      expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    } finally {
      if (originalServiceWorker) Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
      else Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });
});

describe("workout autosave state", () => {
  it("rolls the latest optimistic mutation back when persistence fails", async () => {
    await initializeDatabase();
    const persisted: WorkoutSession = {
      id: "session_active",
      startedAt: "2026-08-12T10:00:00.000Z",
      exercises: []
    };
    await saveSession(persisted);
    await useGymStore.getState().hydrate();

    const failUpdate = () => {
      throw new Error("simulated quota failure");
    };
    const updatingHook = gymDb.sessions.hook("updating");
    updatingHook.subscribe(failUpdate);

    try {
      await expect(useGymStore.getState().setActiveSession({ ...persisted, notes: "not persisted" }))
        .rejects.toThrow("simulated quota failure");

      expect(useGymStore.getState().activeSession).toEqual(persisted);
      expect(useGymStore.getState().sessionSaveStatus).toBe("error");
      expect(useGymStore.getState().error).toContain("simulated quota failure");
      await expect(exportAllData()).resolves.toMatchObject({ sessions: [persisted] });
    } finally {
      updatingHook.unsubscribe(failUpdate);
    }
  });
});

describe("restore recovery state", () => {
  it("exposes recovery after restore and clears it after undo", async () => {
    const timestamp = "2026-08-12T10:00:00.000Z";
    const before: Profile = {
      id: "profile",
      displayName: "Before restore",
      locale: "en",
      units: "metric",
      goal: "general",
      experience: "beginner",
      daysPerWeek: 3,
      locations: [],
      onboardingComplete: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await initializeDatabase();
    await saveProfile(before);
    await useGymStore.getState().hydrate();

    await useGymStore.getState().restore({
      profile: { ...before, displayName: "After restore" },
      routines: [],
      programs: [],
      sessions: [],
      foods: [],
      meals: [],
      recipes: [],
      waterEntries: [],
      foodPreferences: [],
      bodyMetrics: [],
      customVariants: [],
      settings: defaultSettings
    });

    expect(useGymStore.getState()).toMatchObject({ recoveryAvailable: true, profile: { displayName: "After restore" } });
    await expect(useGymStore.getState().undoRestore()).resolves.toBe(true);
    expect(useGymStore.getState()).toMatchObject({ recoveryAvailable: false, profile: { displayName: "Before restore" } });
  });
});
