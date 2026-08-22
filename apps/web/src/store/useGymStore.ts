import { create } from "zustand";
import type {
  AppSettings,
  BodyMetric,
  FoodItem,
  FoodPreference,
  GeneratedMealPlan,
  MealEntry,
  MealPlanRequest,
  NutritionPackManifest,
  NutritionPackRecord,
  PantryItem,
  Profile,
  Program,
  Recipe,
  Routine,
  SavedMealPlan,
  WaterEntry,
  WorkoutSession
} from "@gym/contracts";
import { cloneRoutineTemplate, createFreestyleSession, createSessionFromRoutine, finishSession } from "@gym/workouts";
import {
  installNutritionPack,
  generateOfflineMealPlan,
  loadNutritionPackManifest,
  lookupFoodByBarcode,
  nutritionPackInfo,
  suggestOfflineMenus,
  removeNutritionPack,
  searchOfflineFoods,
  type FoodLookupCandidate,
  type MenuSuggestionOptions,
  type OfflineMenuSuggestion
} from "@gym/nutrition";
import {
  defaultSettings,
  deleteMeal,
  deleteProgram as deleteProgramFromDb,
  deleteRoutine as deleteRoutineFromDb,
  getActiveSession,
  getNutritionPackRecord,
  getProfile,
  getSettings,
  initializeDatabase,
  listBodyMetrics,
  listFoods,
  listFoodPreferences,
  listMeals,
  listMealPlans,
  listPantryItems,
  listPrograms,
  listRecoveryPoints,
  listRecipes,
  listRoutines,
  listSessions,
  listWaterEntries,
  replaceAllData,
  saveBodyMetric,
  saveFood,
  saveFoodPreference,
  saveMeal,
  saveMealPlan,
  saveMealAndRecordFoodUse,
  savePantryItem,
  saveNutritionPackRecord,
  saveProfile,
  saveProgram,
  saveRecipe,
  saveCompletedSessionAndAdvanceProgram,
  saveInitialSetup,
  saveRoutine,
  saveSession,
  saveStartedSession,
  saveSettings,
  saveWaterEntry,
  selectProgram,
  deleteFoodPreference,
  deletePantryItem,
  deleteRecipe,
  deleteWaterEntry,
  deleteMealPlan,
  loadNutritionPackRecipeDataset,
  logMealPlanDays,
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
  recipes: Recipe[];
  waterEntries: WaterEntry[];
  foodPreferences: FoodPreference[];
  pantryItems: PantryItem[];
  mealPlans: SavedMealPlan[];
  generatedMealPlan?: GeneratedMealPlan;
  mealPlanStatus: "idle" | "loading" | "ready" | "saving" | "error";
  mealPlanError?: string;
  menuSuggestions: OfflineMenuSuggestion[];
  menuSuggestionStatus: "idle" | "loading" | "ready" | "error";
  menuSuggestionError?: string;
  nutritionPackRecord: NutritionPackRecord;
  nutritionPackManifest?: NutritionPackManifest;
  nutritionPackError?: string;
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
  updateMeal: (entry: MealEntry) => Promise<void>;
  removeMeal: (id: string) => Promise<void>;
  saveUserRecipe: (recipe: Recipe) => Promise<Recipe>;
  removeRecipe: (id: string) => Promise<void>;
  addWater: (entry: WaterEntry) => Promise<void>;
  removeWater: (id: string) => Promise<void>;
  saveUserFoodPreference: (preference: FoodPreference) => Promise<FoodPreference>;
  removeFoodPreference: (id: string) => Promise<void>;
  saveUserPantryItem: (item: PantryItem) => Promise<PantryItem>;
  removePantryItem: (id: string) => Promise<void>;
  refreshMenuSuggestions: (options?: MenuSuggestionOptions) => Promise<OfflineMenuSuggestion[]>;
  generateUserMealPlan: (request: MealPlanRequest) => Promise<GeneratedMealPlan>;
  clearGeneratedMealPlan: () => void;
  saveGeneratedMealPlan: (name: string) => Promise<SavedMealPlan>;
  removeSavedMealPlan: (id: string) => Promise<void>;
  logSavedMealPlanDays: (planId: string, dayIndexes: number[]) => Promise<MealEntry[]>;
  refreshNutritionPack: () => Promise<void>;
  installOfflineNutritionPack: () => Promise<void>;
  removeOfflineNutritionPack: () => Promise<void>;
  searchOfflineNutritionFoods: (query: string) => Promise<FoodItem[]>;
  lookupBarcodeFood: (barcode: string) => Promise<FoodLookupCandidate | undefined>;
  addBodyMetric: (metric: BodyMetric) => Promise<void>;
  restore: (data: BackupPayload["data"]) => Promise<void>;
  undoRestore: () => Promise<boolean>;
  markBackup: () => Promise<void>;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected local data error";
}

export function nutritionPackRecordAfterFailedInstall(
  current: NutritionPackRecord,
  attempted: NutritionPackRecord,
  failureMessage: string
): NutritionPackRecord {
  if (current.status !== "ready" || !current.version) {
    return { ...attempted, status: "error", error: failureMessage };
  }
  return {
    ...current,
    status: "ready",
    error: undefined,
    operation: attempted.operation ? {
      ...attempted.operation,
      status: "failed",
      errorCode: "update_failed"
    } : undefined
  };
}

async function loadSnapshot() {
  const [profile, routines, programs, sessions, activeSession, foods, meals, recipes, waterEntries, foodPreferences, pantryItems, mealPlans, bodyMetrics, settings, recoveryPoints] = await Promise.all([
    getProfile(),
    listRoutines(),
    listPrograms(),
    listSessions(),
    getActiveSession(),
    listFoods(),
    listMeals(),
    listRecipes(),
    listWaterEntries(),
    listFoodPreferences(),
    listPantryItems(),
    listMealPlans(),
    listBodyMetrics(),
    getSettings(),
    listRecoveryPoints()
  ]);
  return { profile, routines, programs, sessions, activeSession, foods, meals, recipes, waterEntries, foodPreferences, pantryItems, mealPlans, bodyMetrics, settings, recoveryAvailable: recoveryPoints.length > 0 };
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
  recipes: [],
  waterEntries: [],
  foodPreferences: [],
  pantryItems: [],
  mealPlans: [],
  mealPlanStatus: "idle",
  menuSuggestions: [],
  menuSuggestionStatus: "idle",
  nutritionPackRecord: { id: "nutrition-pack", status: "not_installed", bytesDownloaded: 0 },
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

  async refreshNutritionPack() {
    try {
      const [stored, info, manifest] = await Promise.all([
        getNutritionPackRecord(),
        nutritionPackInfo(),
        loadNutritionPackManifest()
      ]);
      if (info.installed) {
        const installedAt = stored.active?.installedAt ?? stored.installedAt ?? new Date().toISOString();
        const checksum = info.manifest?.sha256 ?? info.metadata?.sha256 ?? stored.active?.checksum ?? stored.checksum ?? "";
        const schemaVersion = Number(info.metadata?.schema_version ?? info.manifest?.schemaVersion ?? stored.schemaVersion ?? 0) || undefined;
        const ready: NutritionPackRecord = {
          ...stored,
          id: "nutrition-pack",
          status: "ready",
          version: info.metadata?.version ?? stored.version,
          schemaVersion,
          bytesDownloaded: stored.bytesDownloaded || manifest.sizeBytes,
          totalBytes: manifest.sizeBytes,
          foodCount: Number(info.metadata?.food_count ?? manifest.foodCount),
          aliasCount: Number(info.metadata?.alias_count ?? manifest.aliasCount),
          vietnameseRecipeCount: Number(info.metadata?.vietnamese_recipe_count ?? manifest.vietnameseRecipeCount),
          foodGroupCount: Number(info.metadata?.food_group_count ?? manifest.foodGroupCount ?? 0) || undefined,
          recipeIngredientCount: Number(info.metadata?.recipe_ingredient_count ?? manifest.recipeIngredientCount ?? 0) || undefined,
          vietnameseDisplayFoodCount: Number(info.metadata?.vietnamese_display_food_count ?? manifest.vietnameseDisplayFoodCount ?? 0) || undefined,
          activeRecipeCount: Number(info.metadata?.active_recipe_count ?? manifest.activeRecipeCount ?? 0) || undefined,
          deprecatedRecipeCount: Number(info.metadata?.deprecated_recipe_count ?? manifest.deprecatedRecipeCount ?? 0) || undefined,
          recipeStepCount: Number(info.metadata?.recipe_step_count ?? manifest.recipeStepCount ?? 0) || undefined,
          cuisineCounts: info.manifest?.cuisineCounts ?? manifest.cuisineCounts,
          active: checksum && (info.metadata?.version ?? stored.version) ? {
            version: info.metadata?.version ?? stored.version!,
            schemaVersion,
            fileName: info.activeFileName?.replace(/^\//, "") ?? info.manifest?.fileName ?? stored.active?.fileName ?? "installed-nutrition-pack.sqlite3",
            checksum,
            installedAt,
            foodCount: Number(info.metadata?.food_count ?? manifest.foodCount),
            aliasCount: Number(info.metadata?.alias_count ?? manifest.aliasCount),
            vietnameseRecipeCount: Number(info.metadata?.vietnamese_recipe_count ?? manifest.vietnameseRecipeCount),
            foodGroupCount: Number(info.metadata?.food_group_count ?? manifest.foodGroupCount ?? 0) || undefined,
            recipeIngredientCount: Number(info.metadata?.recipe_ingredient_count ?? manifest.recipeIngredientCount ?? 0) || undefined,
            vietnameseDisplayFoodCount: Number(info.metadata?.vietnamese_display_food_count ?? manifest.vietnameseDisplayFoodCount ?? 0) || undefined,
            activeRecipeCount: Number(info.metadata?.active_recipe_count ?? manifest.activeRecipeCount ?? 0) || undefined,
            deprecatedRecipeCount: Number(info.metadata?.deprecated_recipe_count ?? manifest.deprecatedRecipeCount ?? 0) || undefined,
            recipeStepCount: Number(info.metadata?.recipe_step_count ?? manifest.recipeStepCount ?? 0) || undefined,
            cuisineCounts: info.manifest?.cuisineCounts ?? manifest.cuisineCounts
          } : stored.active
        };
        await saveNutritionPackRecord(ready);
        set({ nutritionPackManifest: manifest, nutritionPackRecord: ready, nutritionPackError: undefined });
        return;
      }
      const interrupted = stored.status === "ready" || stored.status === "downloading" || stored.status === "installing";
      const record: NutritionPackRecord = interrupted
        ? { id: "nutrition-pack", status: "not_installed", bytesDownloaded: 0 }
        : stored;
      if (interrupted) await saveNutritionPackRecord(record);
      set({ nutritionPackManifest: manifest, nutritionPackRecord: record, nutritionPackError: undefined });
    } catch (error) {
      set({ nutritionPackError: messageFrom(error) });
      throw error;
    }
  },

  async installOfflineNutritionPack() {
    const manifest = get().nutritionPackManifest;
    if (!manifest) throw new Error("Nutrition pack manifest is unavailable");
    const current = get().nutritionPackRecord;
    const operationStartedAt = new Date().toISOString();
    const initial: NutritionPackRecord = {
      id: "nutrition-pack",
      status: "downloading",
      version: manifest.version,
      bytesDownloaded: 0,
      totalBytes: manifest.sizeBytes,
      active: current.active,
      previous: current.previous,
      operation: {
        id: `pack_operation_${crypto.randomUUID()}`,
        kind: current.status === "ready" || current.active ? "update" : "install",
        status: "downloading",
        bytesDownloaded: 0,
        totalBytes: manifest.sizeBytes,
        startedAt: operationStartedAt
      }
    };
    set({ nutritionPackRecord: initial, nutritionPackError: undefined });
    await saveNutritionPackRecord(initial);
    try {
      const result = await installNutritionPack(manifest, (progress) => {
        set((state) => ({
          nutritionPackRecord: {
            ...state.nutritionPackRecord,
            status: "downloading",
            bytesDownloaded: progress.bytesDownloaded,
            totalBytes: progress.totalBytes ?? manifest.sizeBytes,
            operation: state.nutritionPackRecord.operation ? {
              ...state.nutritionPackRecord.operation,
              bytesDownloaded: progress.bytesDownloaded,
              totalBytes: progress.totalBytes ?? manifest.sizeBytes
            } : undefined
          }
        }));
      });
      const installedAt = new Date().toISOString();
      const previous = current.active ?? (
        current.status === "ready" && current.version && current.checksum
          ? {
            version: current.version,
            schemaVersion: current.schemaVersion,
            fileName: "installed-nutrition-pack.sqlite3",
            checksum: current.checksum,
            installedAt: current.installedAt ?? installedAt,
            foodCount: current.foodCount,
            aliasCount: current.aliasCount,
            vietnameseRecipeCount: current.vietnameseRecipeCount,
            foodGroupCount: current.foodGroupCount,
            recipeIngredientCount: current.recipeIngredientCount,
            vietnameseDisplayFoodCount: current.vietnameseDisplayFoodCount,
            activeRecipeCount: current.activeRecipeCount,
            deprecatedRecipeCount: current.deprecatedRecipeCount,
            recipeStepCount: current.recipeStepCount,
            cuisineCounts: current.cuisineCounts
          }
          : undefined
      );
      const active = {
        version: manifest.version,
        schemaVersion: manifest.schemaVersion,
        fileName: manifest.fileName,
        checksum: result.checksum,
        installedAt,
        foodCount: manifest.foodCount,
        aliasCount: manifest.aliasCount,
        vietnameseRecipeCount: manifest.vietnameseRecipeCount,
        foodGroupCount: manifest.foodGroupCount,
        recipeIngredientCount: manifest.recipeIngredientCount,
        vietnameseDisplayFoodCount: manifest.vietnameseDisplayFoodCount,
        activeRecipeCount: manifest.activeRecipeCount,
        deprecatedRecipeCount: manifest.deprecatedRecipeCount,
        recipeStepCount: manifest.recipeStepCount,
        cuisineCounts: manifest.cuisineCounts
      };
      const ready: NutritionPackRecord = {
        id: "nutrition-pack",
        status: "ready",
        version: manifest.version,
        schemaVersion: manifest.schemaVersion,
        bytesDownloaded: result.bytesDownloaded,
        totalBytes: manifest.sizeBytes,
        installedAt,
        checksum: result.checksum,
        foodCount: manifest.foodCount,
        aliasCount: manifest.aliasCount,
        vietnameseRecipeCount: manifest.vietnameseRecipeCount,
        foodGroupCount: manifest.foodGroupCount,
        recipeIngredientCount: manifest.recipeIngredientCount,
        vietnameseDisplayFoodCount: manifest.vietnameseDisplayFoodCount,
        activeRecipeCount: manifest.activeRecipeCount,
        deprecatedRecipeCount: manifest.deprecatedRecipeCount,
        recipeStepCount: manifest.recipeStepCount,
        cuisineCounts: manifest.cuisineCounts,
        active,
        previous: previous?.checksum === active.checksum ? current.previous : previous
      };
      await saveNutritionPackRecord(ready);
      set({ nutritionPackRecord: ready });
    } catch (error) {
      const failureMessage = messageFrom(error);
      const failed = nutritionPackRecordAfterFailedInstall(current, initial, failureMessage);
      await saveNutritionPackRecord(failed).catch(() => undefined);
      set({ nutritionPackRecord: failed, nutritionPackError: failureMessage });
      throw error;
    }
  },

  async removeOfflineNutritionPack() {
    await removeNutritionPack();
    const record: NutritionPackRecord = { id: "nutrition-pack", status: "not_installed", bytesDownloaded: 0 };
    await saveNutritionPackRecord(record);
    set({ nutritionPackRecord: record, nutritionPackError: undefined, menuSuggestions: [], menuSuggestionStatus: "idle", menuSuggestionError: undefined });
  },

  searchOfflineNutritionFoods(query) {
    return searchOfflineFoods(query);
  },

  lookupBarcodeFood(barcode) {
    return lookupFoodByBarcode(barcode);
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
    const preference = await saveMealAndRecordFoodUse(entry, { defaultServingGrams: entry.grams });
    set((state) => ({
      meals: [entry, ...state.meals],
      foodPreferences: [preference, ...state.foodPreferences.filter((item) => item.foodId !== entry.foodId)]
    }));
  },

  async updateMeal(entry) {
    await saveMeal(entry);
    set((state) => ({ meals: state.meals.map((item) => item.id === entry.id ? entry : item) }));
  },

  async removeMeal(id) {
    await deleteMeal(id);
    set((state) => ({ meals: state.meals.filter((entry) => entry.id !== id) }));
  },

  async saveUserRecipe(recipe) {
    const saved = await saveRecipe(recipe);
    set((state) => ({
      recipes: [saved, ...state.recipes.filter((item) => item.id !== saved.id)]
    }));
    return saved;
  },

  async removeRecipe(id) {
    await deleteRecipe(id);
    set((state) => ({ recipes: state.recipes.filter((recipe) => recipe.id !== id) }));
  },

  async addWater(entry) {
    await saveWaterEntry(entry);
    set((state) => ({ waterEntries: [entry, ...state.waterEntries] }));
  },

  async removeWater(id) {
    await deleteWaterEntry(id);
    set((state) => ({ waterEntries: state.waterEntries.filter((entry) => entry.id !== id) }));
  },

  async saveUserFoodPreference(preference) {
    const saved = await saveFoodPreference(preference);
    set((state) => ({
      foodPreferences: [saved, ...state.foodPreferences.filter((item) => item.foodId !== saved.foodId)]
    }));
    return saved;
  },

  async removeFoodPreference(id) {
    await deleteFoodPreference(id);
    set((state) => ({ foodPreferences: state.foodPreferences.filter((item) => item.id !== id) }));
  },

  async saveUserPantryItem(item) {
    const saved = await savePantryItem(item);
    set((state) => ({
      pantryItems: [saved, ...state.pantryItems.filter((current) => current.id !== saved.id)],
      menuSuggestions: [],
      menuSuggestionStatus: "idle",
      menuSuggestionError: undefined
    }));
    return saved;
  },

  async removePantryItem(id) {
    await deletePantryItem(id);
    set((state) => ({
      pantryItems: state.pantryItems.filter((item) => item.id !== id),
      menuSuggestions: [],
      menuSuggestionStatus: "idle",
      menuSuggestionError: undefined
    }));
  },

  async refreshMenuSuggestions(options = {}) {
    set({ menuSuggestionStatus: "loading", menuSuggestionError: undefined });
    try {
      const suggestions = await suggestOfflineMenus(get().pantryItems, options);
      set({ menuSuggestions: suggestions, menuSuggestionStatus: "ready" });
      return suggestions;
    } catch (error) {
      const message = messageFrom(error);
      set({ menuSuggestions: [], menuSuggestionStatus: "error", menuSuggestionError: message });
      throw error;
    }
  },

  async generateUserMealPlan(request) {
    set({ mealPlanStatus: "loading", mealPlanError: undefined });
    try {
      const info = await nutritionPackInfo();
      if (!info.installed) throw new Error("Hãy cài kho dinh dưỡng ngoại tuyến trước khi lập thực đơn.");
      const schemaVersion = Number(info.metadata?.schema_version);
      if (!Number.isFinite(schemaVersion) || schemaVersion < 3) {
        throw new Error("Lập thực đơn 7 ngày cần kho dinh dưỡng schema 3. Hãy cập nhật kho dinh dưỡng.");
      }
      const sourcePackVersion = info.metadata?.version?.trim();
      if (!sourcePackVersion) throw new Error("Không đọc được phiên bản kho dinh dưỡng đang cài.");
      const dataset = await loadNutritionPackRecipeDataset();
      const generatedMealPlan = generateOfflineMealPlan(dataset, get().pantryItems, request, sourcePackVersion);
      set({ generatedMealPlan, mealPlanStatus: "ready" });
      return generatedMealPlan;
    } catch (error) {
      const message = messageFrom(error);
      set({ generatedMealPlan: undefined, mealPlanStatus: "error", mealPlanError: message });
      throw error;
    }
  },

  clearGeneratedMealPlan() {
    set({ generatedMealPlan: undefined, mealPlanStatus: "idle", mealPlanError: undefined });
  },

  async saveGeneratedMealPlan(name) {
    const generated = get().generatedMealPlan;
    if (!generated) throw new Error("Chưa có thực đơn để lưu.");
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("Hãy đặt tên cho thực đơn.");
    set({ mealPlanStatus: "saving", mealPlanError: undefined });
    try {
      const now = new Date().toISOString();
      const saved = await saveMealPlan({
        ...generated,
        id: `meal_plan_${crypto.randomUUID()}`,
        name: { vi: normalizedName, en: normalizedName },
        createdAt: now,
        updatedAt: now
      });
      set((state) => ({
        mealPlans: [saved, ...state.mealPlans.filter((plan) => plan.id !== saved.id)],
        mealPlanStatus: "ready",
        notice: "Đã lưu thực đơn vào thiết bị."
      }));
      return saved;
    } catch (error) {
      const message = messageFrom(error);
      set({ mealPlanStatus: "error", mealPlanError: message });
      throw error;
    }
  },

  async removeSavedMealPlan(id) {
    await deleteMealPlan(id);
    set((state) => ({
      mealPlans: state.mealPlans.filter((plan) => plan.id !== id),
      notice: "Đã xóa thực đơn đã lưu."
    }));
  },

  async logSavedMealPlanDays(planId, dayIndexes) {
    set({ mealPlanStatus: "saving", mealPlanError: undefined });
    try {
      const result = await logMealPlanDays(planId, dayIndexes);
      const [meals, foodPreferences] = await Promise.all([listMeals(), listFoodPreferences()]);
      set({
        meals,
        foodPreferences,
        mealPlanStatus: "ready",
        notice: result.createdMeals.length
          ? `Đã ghi ${result.createdMeals.length} bữa vào nhật ký.`
          : "Các bữa đã được ghi trước đó; không tạo bản ghi trùng."
      });
      return result.createdMeals;
    } catch (error) {
      const message = messageFrom(error);
      set({ mealPlanStatus: "error", mealPlanError: message });
      throw error;
    }
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
