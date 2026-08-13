import { create } from "zustand";
import type { AppSettings, BodyMetric, FoodItem, MealEntry, Profile, Program, Routine, WorkoutSession } from "@gym/contracts";
import { cloneRoutineTemplate, createFreestyleSession, createSessionFromRoutine, finishSession } from "@gym/workouts";
import {
  defaultSettings,
  deleteMeal,
  deleteProgram as deleteProgramFromDb,
  deleteRoutine as deleteRoutineFromDb,
  getActiveSession,
  getProfile,
  getSettings,
  initializeDatabase,
  listBodyMetrics,
  listFoods,
  listMeals,
  listPrograms,
  listRecoveryPoints,
  listRoutines,
  listSessions,
  replaceAllData,
  saveBodyMetric,
  saveFood,
  saveMeal,
  saveProfile,
  saveProgram,
  saveCompletedSessionAndAdvanceProgram,
  saveInitialSetup,
  saveRoutine,
  saveSession,
  saveStartedSession,
  saveSettings,
  selectProgram,
  undoLatestRestore
} from "@gym/storage";
import type { BackupPayload } from "@gym/contracts";

interface GymState {
  ready: boolean;
  busy: boolean;
  error?: string;
  notice?: string;
  profile?: Profile;
  routines: Routine[];
  programs: Program[];
  sessions: WorkoutSession[];
  activeSession?: WorkoutSession;
  foods: FoodItem[];
  meals: MealEntry[];
  bodyMetrics: BodyMetric[];
  settings: AppSettings;
  recoveryAvailable: boolean;
  sessionSaveStatus: "idle" | "saving" | "saved" | "error";
  sessionSaveRevision: number;
  hydrate: () => Promise<void>;
  clearNotice: () => void;
  setNotice: (message: string) => void;
  completeOnboarding: (profile: Profile, templateIds: string[]) => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  installTemplate: (templateId: string) => Promise<Routine>;
  saveUserRoutine: (routine: Routine) => Promise<Routine>;
  removeRoutine: (routineId: string) => Promise<void>;
  saveUserProgram: (program: Program) => Promise<Program>;
  removeProgram: (programId: string) => Promise<void>;
  selectUserProgram: (programId?: string) => Promise<void>;
  startWorkout: (routine: Routine, programId?: string) => Promise<void>;
  startFreestyleWorkout: () => Promise<void>;
  setActiveSession: (session: WorkoutSession) => Promise<void>;
  completeWorkout: () => Promise<WorkoutSession | undefined>;
  addFood: (food: FoodItem) => Promise<void>;
  addMeal: (entry: MealEntry) => Promise<void>;
  removeMeal: (id: string) => Promise<void>;
  addBodyMetric: (metric: BodyMetric) => Promise<void>;
  restore: (data: BackupPayload["data"]) => Promise<void>;
  undoRestore: () => Promise<boolean>;
  markBackup: () => Promise<void>;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected local data error";
}

async function loadSnapshot() {
  const [profile, routines, programs, sessions, activeSession, foods, meals, bodyMetrics, settings, recoveryPoints] = await Promise.all([
    getProfile(),
    listRoutines(),
    listPrograms(),
    listSessions(),
    getActiveSession(),
    listFoods(),
    listMeals(),
    listBodyMetrics(),
    getSettings(),
    listRecoveryPoints()
  ]);
  return { profile, routines, programs, sessions, activeSession, foods, meals, bodyMetrics, settings, recoveryAvailable: recoveryPoints.length > 0 };
}

let lastPersistedActiveSession: WorkoutSession | undefined;

export const useGymStore = create<GymState>((set, get) => ({
  ready: false,
  busy: false,
  routines: [],
  programs: [],
  sessions: [],
  foods: [],
  meals: [],
  bodyMetrics: [],
  settings: defaultSettings,
  recoveryAvailable: false,
  sessionSaveStatus: "idle",
  sessionSaveRevision: 0,

  async hydrate() {
    set({ busy: true, error: undefined });
    try {
      await initializeDatabase();
      const snapshot = await loadSnapshot();
      lastPersistedActiveSession = snapshot.activeSession;
      set({ ...snapshot, ready: true, busy: false, sessionSaveStatus: "idle" });
    } catch (error) {
      set({ ready: true, busy: false, error: messageFrom(error) });
    }
  },

  clearNotice: () => set({ notice: undefined }),
  setNotice: (notice) => set({ notice }),

  async completeOnboarding(profile, templateIds) {
    set({ busy: true, error: undefined });
    try {
      const routines = templateIds.map((templateId) => cloneRoutineTemplate(templateId));
      await saveInitialSetup(profile, routines);
      set({ profile, routines, busy: false, notice: profile.locale === "vi" ? "Thiết lập đã được lưu trên thiết bị." : "Setup was saved on this device." });
    } catch (error) {
      set({ busy: false, error: messageFrom(error) });
      throw error;
    }
  },

  async updateProfile(profile) {
    await saveProfile(profile);
    set({ profile });
  },

  async installTemplate(templateId) {
    const routine = cloneRoutineTemplate(templateId);
    await saveRoutine(routine);
    set((state) => ({ routines: [routine, ...state.routines], notice: state.profile?.locale === "en" ? "Routine added." : "Đã thêm lịch tập." }));
    return routine;
  },

  async saveUserRoutine(routine) {
    const saved = await saveRoutine(routine);
    set((state) => ({
      routines: state.routines.some((item) => item.id === saved.id)
        ? state.routines.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...state.routines],
      notice: state.profile?.locale === "en" ? "Routine saved." : "Đã lưu lịch tập."
    }));
    return saved;
  },

  async removeRoutine(routineId) {
    await deleteRoutineFromDb(routineId);
    set((state) => ({
      routines: state.routines.filter((routine) => routine.id !== routineId),
      notice: state.profile?.locale === "en" ? "Routine deleted. Workout history was preserved." : "Đã xóa lịch tập. Lịch sử buổi tập vẫn được giữ."
    }));
  },

  async saveUserProgram(program) {
    const saved = await saveProgram(program);
    set((state) => ({
      programs: state.programs.some((item) => item.id === saved.id)
        ? state.programs.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...state.programs],
      notice: state.profile?.locale === "en" ? "Program saved." : "Đã lưu chương trình."
    }));
    return saved;
  },

  async removeProgram(programId) {
    await deleteProgramFromDb(programId);
    set((state) => ({
      programs: state.programs.filter((program) => program.id !== programId),
      settings: state.settings.activeProgramId === programId ? { ...state.settings, activeProgramId: undefined } : state.settings,
      notice: state.profile?.locale === "en" ? "Program deleted. Routines and history were preserved." : "Đã xóa chương trình. Lịch tập và lịch sử vẫn được giữ."
    }));
  },

  async selectUserProgram(programId) {
    const settings = await selectProgram(programId);
    set((state) => ({
      settings,
      notice: programId
        ? (state.profile?.locale === "en" ? "Active program selected." : "Đã chọn chương trình đang tập.")
        : undefined
    }));
  },

  async startWorkout(routine, programId) {
    const active = get().activeSession;
    if (active) throw new Error(get().profile?.locale === "en" ? "You already have an unfinished workout" : "Bạn đang có một buổi tập chưa hoàn tất");
    const session = { ...createSessionFromRoutine(routine, get().profile?.activeLocationId), programId };
    await saveStartedSession(session);
    lastPersistedActiveSession = session;
    set((state) => ({
      activeSession: session,
      sessions: [session, ...state.sessions],
      settings: { ...state.settings, activeSessionId: session.id, activeProgramId: programId ?? state.settings.activeProgramId },
      sessionSaveStatus: "saved"
    }));
  },

  async startFreestyleWorkout() {
    const active = get().activeSession;
    if (active) throw new Error(get().profile?.locale === "en" ? "You already have an unfinished workout" : "Bạn đang có một buổi tập chưa hoàn tất");
    const session = createFreestyleSession({ locationId: get().profile?.activeLocationId });
    await saveStartedSession(session);
    lastPersistedActiveSession = session;
    set((state) => ({
      activeSession: session,
      sessions: [session, ...state.sessions],
      settings: { ...state.settings, activeSessionId: session.id },
      sessionSaveStatus: "saved"
    }));
  },

  async setActiveSession(session) {
    const revision = get().sessionSaveRevision + 1;
    set((state) => ({
      activeSession: session.finishedAt ? undefined : session,
      sessions: state.sessions.some((item) => item.id === session.id)
        ? state.sessions.map((item) => item.id === session.id ? session : item)
        : [session, ...state.sessions],
      sessionSaveStatus: "saving",
      sessionSaveRevision: revision
    }));
    try {
      await saveSession(session);
      lastPersistedActiveSession = session.finishedAt ? undefined : session;
      if (get().sessionSaveRevision === revision) set({ sessionSaveStatus: "saved" });
    } catch (error) {
      if (get().sessionSaveRevision === revision) {
        set((state) => ({
          activeSession: lastPersistedActiveSession,
          sessions: lastPersistedActiveSession
            ? state.sessions.map((item) => item.id === lastPersistedActiveSession!.id ? lastPersistedActiveSession! : item)
            : state.sessions.filter((item) => item.id !== session.id),
          sessionSaveStatus: "error",
          error: messageFrom(error)
        }));
      }
      throw error;
    }
  },

  async completeWorkout() {
    const active = get().activeSession;
    if (!active) return undefined;
    const finished = finishSession(active);
    const programs = await saveCompletedSessionAndAdvanceProgram(finished);
    lastPersistedActiveSession = undefined;
    set((state) => ({
      activeSession: undefined,
      programs,
      sessions: state.sessions.map((session) => session.id === finished.id ? finished : session),
      settings: { ...state.settings, activeSessionId: undefined },
      sessionSaveStatus: "saved",
      notice: state.profile?.locale === "en" ? "Workout saved. Nice work!" : "Buổi tập đã được lưu. Tuyệt vời!"
    }));
    return finished;
  },

  async addFood(food) {
    await saveFood(food);
    set((state) => ({ foods: [food, ...state.foods.filter((item) => item.id !== food.id)] }));
  },

  async addMeal(entry) {
    await saveMeal(entry);
    set((state) => ({ meals: [entry, ...state.meals] }));
  },

  async removeMeal(id) {
    await deleteMeal(id);
    set((state) => ({ meals: state.meals.filter((entry) => entry.id !== id) }));
  },

  async addBodyMetric(metric) {
    await saveBodyMetric(metric);
    set((state) => ({
      bodyMetrics: [...state.bodyMetrics.filter((item) => item.id !== metric.id), metric]
        .sort((a, b) => a.date.localeCompare(b.date))
    }));
  },

  async restore(data) {
    set({ busy: true, error: undefined });
    try {
      await replaceAllData(data);
      const snapshot = await loadSnapshot();
      lastPersistedActiveSession = snapshot.activeSession;
      set({ ...snapshot, busy: false, notice: snapshot.profile?.locale === "en" ? "Data restored successfully." : "Khôi phục dữ liệu thành công." });
    } catch (error) {
      set({ busy: false, error: messageFrom(error) });
      throw error;
    }
  },

  async undoRestore() {
    set({ busy: true, error: undefined });
    try {
      const restored = await undoLatestRestore();
      if (!restored) {
        set({ busy: false, recoveryAvailable: false });
        return false;
      }
      const snapshot = await loadSnapshot();
      lastPersistedActiveSession = snapshot.activeSession;
      set({
        ...snapshot,
        busy: false,
        notice: snapshot.profile?.locale === "en" ? "The previous data was restored." : "Đã hoàn tác và khôi phục dữ liệu trước đó."
      });
      return true;
    } catch (error) {
      set({ busy: false, error: messageFrom(error) });
      throw error;
    }
  },

  async markBackup() {
    const settings = { ...get().settings, lastBackupAt: new Date().toISOString() };
    await saveSettings(settings);
    set({ settings });
  }
}));
