import { create } from "zustand";
import type { AppSettings, BodyMetric, FoodItem, MealEntry, Profile, Routine, WorkoutSession } from "@gym/contracts";
import { cloneRoutineTemplate, createSessionFromRoutine, finishSession } from "@gym/workouts";
import {
  defaultSettings,
  deleteMeal,
  deleteRoutine as deleteRoutineFromDb,
  getActiveSession,
  getProfile,
  getSettings,
  initializeDatabase,
  listBodyMetrics,
  listFoods,
  listMeals,
  listRoutines,
  listSessions,
  replaceAllData,
  saveBodyMetric,
  saveFood,
  saveMeal,
  saveProfile,
  saveInitialSetup,
  saveRoutine,
  saveSession,
  saveSettings
} from "@gym/storage";
import type { BackupPayload } from "@gym/contracts";

interface GymState {
  ready: boolean;
  busy: boolean;
  error?: string;
  notice?: string;
  profile?: Profile;
  routines: Routine[];
  sessions: WorkoutSession[];
  activeSession?: WorkoutSession;
  foods: FoodItem[];
  meals: MealEntry[];
  bodyMetrics: BodyMetric[];
  settings: AppSettings;
  sessionSaveStatus: "idle" | "saving" | "saved" | "error";
  sessionSaveRevision: number;
  hydrate: () => Promise<void>;
  clearNotice: () => void;
  setNotice: (message: string) => void;
  completeOnboarding: (profile: Profile, templateIds: string[]) => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  installTemplate: (templateId: string) => Promise<Routine>;
  saveUserRoutine: (routine: Routine) => Promise<void>;
  removeRoutine: (routineId: string) => Promise<void>;
  startWorkout: (routine: Routine) => Promise<void>;
  setActiveSession: (session: WorkoutSession) => Promise<void>;
  completeWorkout: () => Promise<WorkoutSession | undefined>;
  addFood: (food: FoodItem) => Promise<void>;
  addMeal: (entry: MealEntry) => Promise<void>;
  removeMeal: (id: string) => Promise<void>;
  addBodyMetric: (metric: BodyMetric) => Promise<void>;
  restore: (data: BackupPayload["data"]) => Promise<void>;
  markBackup: () => Promise<void>;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected local data error";
}

async function loadSnapshot() {
  const [profile, routines, sessions, activeSession, foods, meals, bodyMetrics, settings] = await Promise.all([
    getProfile(),
    listRoutines(),
    listSessions(),
    getActiveSession(),
    listFoods(),
    listMeals(),
    listBodyMetrics(),
    getSettings()
  ]);
  return { profile, routines, sessions, activeSession, foods, meals, bodyMetrics, settings };
}

let lastPersistedActiveSession: WorkoutSession | undefined;

export const useGymStore = create<GymState>((set, get) => ({
  ready: false,
  busy: false,
  routines: [],
  sessions: [],
  foods: [],
  meals: [],
  bodyMetrics: [],
  settings: defaultSettings,
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
    await saveRoutine(routine);
    set((state) => ({
      routines: state.routines.some((item) => item.id === routine.id)
        ? state.routines.map((item) => item.id === routine.id ? routine : item)
        : [routine, ...state.routines],
      notice: state.profile?.locale === "en" ? "Routine saved." : "Đã lưu lịch tập."
    }));
  },

  async removeRoutine(routineId) {
    await deleteRoutineFromDb(routineId);
    set((state) => ({ routines: state.routines.filter((routine) => routine.id !== routineId) }));
  },

  async startWorkout(routine) {
    const active = get().activeSession;
    if (active) throw new Error(get().profile?.locale === "en" ? "You already have an unfinished workout" : "Bạn đang có một buổi tập chưa hoàn tất");
    const session = createSessionFromRoutine(routine, get().profile?.activeLocationId);
    await saveSession(session);
    lastPersistedActiveSession = session;
    set((state) => ({ activeSession: session, sessions: [session, ...state.sessions], sessionSaveStatus: "saved" }));
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
    await saveSession(finished);
    lastPersistedActiveSession = undefined;
    set((state) => ({
      activeSession: undefined,
      sessions: state.sessions.map((session) => session.id === finished.id ? finished : session),
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
      set({ ...snapshot, busy: false, notice: snapshot.profile?.locale === "en" ? "Data restored successfully." : "Khôi phục dữ liệu thành công." });
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
