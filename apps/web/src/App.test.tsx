import "fake-indexeddb/auto";
import { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chip, Modal, ProgressBar, ToggleGroup, ToggleGroupItem } from "@gym/ui";
import type { NutritionPackRecord, Profile, WorkoutSession } from "@gym/contracts";
import { defaultSettings, exportAllData, getProfile, gymDb, initializeDatabase, listRoutines, saveProfile, saveSession } from "@gym/storage";
import { getTrackingProfile, getVariant, getVariantsForMovement, searchCatalog } from "@gym/catalog";
import type { CustomExerciseInput } from "@gym/catalog/custom";
import { removeUserCustomExercise, saveUserCustomExercise } from "./features/catalog/customExerciseActions";
import { addExerciseBlock, createFreestyleSession } from "@gym/workouts";
import { App } from "./App";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { nutritionPackRecordAfterFailedInstall, useGymStore } from "./store/useGymStore";

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
    recipes: [],
    waterEntries: [],
    foodPreferences: [],
    nutritionPackRecord: { id: "nutrition-pack", status: "not_installed", bytesDownloaded: 0 },
    nutritionPackManifest: undefined,
    nutritionPackError: undefined,
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

describe("nutrition pack update recovery", () => {
  it("keeps the previous ready pack usable after an update fails", () => {
    const current: NutritionPackRecord = {
      id: "nutrition-pack",
      status: "ready",
      version: "2026.08",
      schemaVersion: 2,
      checksum: "a".repeat(64),
      bytesDownloaded: 24_000_000
    };
    const attempted: NutritionPackRecord = {
      id: "nutrition-pack",
      status: "downloading",
      version: "2026.08.1",
      bytesDownloaded: 10,
      operation: {
        id: "pack_operation_test",
        kind: "update",
        status: "downloading",
        bytesDownloaded: 10,
        startedAt: "2026-08-22T00:00:00.000Z"
      }
    };

    expect(nutritionPackRecordAfterFailedInstall(current, attempted, "checksum failed")).toEqual({
      ...current,
      operation: {
        ...attempted.operation,
        status: "failed",
        errorCode: "update_failed"
      }
    });
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
      pantryItems: [],
      mealPlans: [],
      bodyMetrics: [],
      customMovements: [],
      customVariants: [],
      settings: defaultSettings
    });

    expect(useGymStore.getState()).toMatchObject({ recoveryAvailable: true, profile: { displayName: "After restore" } });
    await expect(useGymStore.getState().undoRestore()).resolves.toBe(true);
    expect(useGymStore.getState()).toMatchObject({ recoveryAvailable: false, profile: { displayName: "Before restore" } });
  });
});

describe("custom exercises", () => {
  it("creates, edits, logs, and deletes a custom exercise through the same lookups as the catalog", async () => {
    await initializeDatabase();
    await useGymStore.getState().hydrate();
    const input: CustomExerciseInput = { name: "  Kéo cáp một tay ", primaryMuscle: "back", secondaryMuscles: ["biceps"], equipment: "cable", loadEntryMode: "per_hand" };

    const created = await saveUserCustomExercise(input);
    const variant = getVariantsForMovement(created.id)[0];

    expect(created.name).toEqual({ vi: "Kéo cáp một tay", en: "Kéo cáp một tay" });
    expect(searchCatalog("keo cap", "back", "cable")[0]?.id).toBe(created.id);
    expect(getTrackingProfile(variant.id)).toMatchObject({ loadEntryMode: "per_hand", effortKind: "reps" });
    await expect(saveUserCustomExercise(input)).rejects.toThrow();

    const session = addExerciseBlock(createFreestyleSession(), variant);
    expect(session.exercises[0]).toMatchObject({ movementId: created.id, variantId: variant.id, variantNameSnapshot: created.name });

    const edited = await saveUserCustomExercise({ ...input, name: "Kéo cáp", loadEntryMode: "reps_only" }, created.id);
    expect(edited).toMatchObject({ id: created.id, contentVersion: 2 });
    expect(getVariant(variant.id)).toMatchObject({ id: variant.id, loadEntryMode: "reps_only" });
    await expect(exportAllData()).resolves.toMatchObject({ customMovements: [{ id: created.id }], customVariants: [{ id: variant.id }] });

    await removeUserCustomExercise(created.id);
    expect(getVariant(variant.id)).toBeUndefined();
    expect(useGymStore.getState().customMovements).toEqual([]);
    await expect(exportAllData()).resolves.toMatchObject({ customMovements: [], customVariants: [] });
  });

  it("keeps a logged custom exercise for history: no setup change, and delete only hides it", async () => {
    await initializeDatabase();
    await useGymStore.getState().hydrate();
    const input: CustomExerciseInput = { name: "Kéo cáp một tay", primaryMuscle: "back", secondaryMuscles: [], equipment: "cable", loadEntryMode: "per_hand" };
    const created = await saveUserCustomExercise(input);
    const variant = getVariantsForMovement(created.id)[0];
    const logged = addExerciseBlock(createFreestyleSession(), variant);
    await saveSession({ ...logged, finishedAt: "2026-08-12T11:00:00.000Z" });
    await useGymStore.getState().hydrate();
    await expect(saveUserCustomExercise({ ...input, loadEntryMode: "total_weight" }, created.id)).resolves.toMatchObject({ id: created.id });
    await saveUserCustomExercise(input, created.id);
    useGymStore.setState({ activeSession: logged });
    await expect(saveUserCustomExercise({ ...input, loadEntryMode: "total_weight" }, created.id)).rejects.toThrow();
    useGymStore.setState({ activeSession: undefined });

    const completedSet = { id: "set_done", type: "working" as const, weightKg: 20, reps: 8, completedAt: "2026-08-12T10:30:00.000Z" };
    await saveSession({ ...logged, finishedAt: "2026-08-12T11:00:00.000Z", exercises: logged.exercises.map((exercise) => ({ ...exercise, sets: [completedSet] })) });
    await useGymStore.getState().hydrate();

    await expect(saveUserCustomExercise({ ...input, loadEntryMode: "total_weight" }, created.id)).rejects.toThrow();
    await expect(saveUserCustomExercise({ ...input, equipment: "dumbbell" }, created.id)).rejects.toThrow();
    await expect(saveUserCustomExercise({ ...input, name: "Kéo cáp", primaryMuscle: "biceps" }, created.id)).resolves.toMatchObject({ id: created.id });

    await removeUserCustomExercise(created.id);
    expect(searchCatalog("keo cap")).toEqual([]);
    expect(getVariant(variant.id)).toMatchObject({ reviewStatus: "deprecated" });
    await expect(saveUserCustomExercise({ ...input, name: "Kéo cáp" })).resolves.toMatchObject({ reviewStatus: "draft" });
    await useGymStore.getState().hydrate();
    expect(getVariant(variant.id)).toBeDefined();
  });
});
