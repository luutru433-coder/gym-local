import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PersonalDataSnapshot, Profile, Program, Routine, SavedMealPlan, WorkoutSession } from "@gym/contracts";
import {
  GymDatabase,
  defaultSettings,
  exportAllData,
  getActiveSession,
  getProfile,
  initializeDatabase,
  deleteProgram,
  deleteFood,
  deleteFoodPreference,
  deletePantryItem,
  deleteRecipe,
  deleteRoutine,
  deleteWaterEntry,
  findSavedFoodByBarcode,
  listPrograms,
  listFoodPreferences,
  listMealPlans,
  listPantryItems,
  listRecipes,
  listRecoveryPoints,
  listWaterEntries,
  listWaterEntriesForDate,
  replaceAllData,
  getNutritionPackRecord,
  saveProfile,
  saveProgram,
  saveCompletedSessionAndAdvanceProgram,
  saveInitialSetup,
  saveFood,
  saveFoodPreference,
  savePantryItem,
  saveMeal,
  saveMealPlan,
  saveMealAndRecordFoodUse,
  saveNutritionPackRecord,
  saveRecipe,
  saveSession,
  saveStartedSession,
  saveWaterEntry,
  selectProgram,
  deleteMealPlan,
  logMealPlanDays,
  undoLatestRestore
} from "./index";

const databases: GymDatabase[] = [];

function makeDatabase(): GymDatabase {
  const db = new GymDatabase(`gym-local-test-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}

function profile(): Profile {
  const now = "2026-08-10T00:00:00.000Z";
  return {
    id: "profile",
    displayName: "Local lifter",
    locale: "vi",
    units: "metric",
    goal: "hypertrophy",
    experience: "beginner",
    daysPerWeek: 3,
    locations: [{ id: "home", name: "Home", equipment: ["dumbbell", "bench"] }],
    activeLocationId: "home",
    onboardingComplete: true,
    createdAt: now,
    updatedAt: now
  };
}

function routine(): Routine {
  const now = "2026-08-10T00:00:00.000Z";
  return {
    id: "routine_starter",
    name: { vi: "Toàn thân", en: "Full body" },
    goal: "general",
    difficulty: "beginner",
    daysPerWeek: 3,
    templateVersion: 1,
    items: [],
    createdAt: now,
    updatedAt: now
  };
}

function program(id = "program_starter"): Program {
  const now = "2026-08-10T00:00:00.000Z";
  return {
    id,
    name: { vi: "Chương trình", en: "Program" },
    goal: "hypertrophy",
    difficulty: "beginner",
    days: [{ order: 0, routineId: "routine_starter" }],
    activeDayIndex: 0,
    progressionRule: {
      type: "double_progression",
      successSessions: 2,
      defaultIncrementKg: 2.5,
      fallbackIncreasePercent: 2.5
    },
    createdAt: now,
    updatedAt: now
  };
}

function snapshot(displayName: string): PersonalDataSnapshot {
  return {
    profile: { ...profile(), displayName },
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
    customVariants: [],
    settings: { ...defaultSettings }
  };
}

function savedMealPlan(id = "meal_plan_1"): SavedMealPlan {
  const nutrients = { calories: 420, protein: 28, carbs: 52, fat: 11, vitaminCMg: 18 };
  return {
    id,
    name: { vi: "Thực đơn kiểm thử", en: "Test meal plan" },
    durationDays: 1,
    startDate: "2026-08-14",
    targetSnapshot: {
      calories: 2_000,
      protein: 150,
      carbs: 220,
      fat: 65,
      formulaVersion: 1,
      confirmedAt: "2026-08-14T00:00:00.000Z",
      source: "manual"
    },
    filtersSnapshot: {
      includeSnack: false,
      cuisines: ["vietnamese"],
      dietaryTags: [],
      excludedAllergens: ["peanut"],
      seed: "storage-test"
    },
    days: [{
      dayIndex: 0,
      date: "2026-08-14",
      meals: [{
        id: "planned_meal_1",
        dayIndex: 0,
        meal: "lunch",
        recipeId: "recipe_com_ga",
        recipeNameSnapshot: { vi: "Cơm gà", en: "Chicken rice" },
        cuisine: "vietnamese",
        servingGrams: 420,
        nutrientsSnapshot: nutrients,
        ingredientSnapshots: [{
          foodId: "food_rice",
          nameSnapshot: { vi: "Gạo", en: "Rice" },
          grams: 100,
          groupId: "starch",
          required: true,
          availableGrams: 50,
          missingGrams: 50,
          nutrientsPer100gSnapshot: { calories: 360, protein: 7, carbs: 79, fat: 0.6 }
        }],
        sourcePackVersion: "2026.08.3"
      }],
      totalsSnapshot: nutrients
    }],
    shoppingListSnapshot: [{
      foodId: "food_rice",
      nameSnapshot: { vi: "Gạo", en: "Rice" },
      groupId: "starch",
      missingGrams: 50
    }],
    warnings: [],
    algorithmVersion: 1,
    sourcePackVersion: "2026.08.3",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z"
  };
}

const v1Stores = {
  profiles: "id, updatedAt",
  routines: "id, goal, updatedAt, sourceTemplateId",
  sessions: "id, routineId, startedAt, finishedAt, locationId",
  foods: "id, barcode, updatedAt",
  meals: "id, date, meal, foodId, createdAt",
  bodyMetrics: "id, date",
  customVariants: "id, movementId, reviewStatus",
  settings: "id"
};

const v2Stores = {
  ...v1Stores,
  nutritionPacks: "id, status, version, installedAt"
};

const v3Stores = {
  profiles: "id, updatedAt",
  routines: "id, goal, updatedAt, sourceTemplateId",
  programs: "id, goal, updatedAt",
  sessions: "id, routineId, startedAt, finishedAt, locationId",
  foods: "id, barcode, updatedAt",
  meals: "id, date, meal, foodId, createdAt",
  recipes: "id, updatedAt",
  waterEntries: "id, date, createdAt",
  foodPreferences: "id, foodId, favorite, lastUsedAt",
  bodyMetrics: "id, date",
  customVariants: "id, movementId, reviewStatus",
  settings: "id",
  nutritionPacks: "id, status, version, installedAt",
  recoveryPoints: "id, createdAt"
};

const v4Stores = {
  ...v3Stores,
  pantryItems: "id, kind, foodId, groupId, updatedAt"
};

async function createV2Database(name: string): Promise<void> {
  const legacy = new Dexie(name);
  legacy.version(1).stores(v1Stores);
  legacy.version(2).stores(v2Stores);
  await legacy.open();
  await legacy.table("settings").put({ ...defaultSettings, dbSchemaVersion: 2, backupVersion: 2 });
  legacy.close();
}

async function createV3Database(name: string, includeRecoveryPoint = false): Promise<void> {
  const legacy = new Dexie(name);
  legacy.version(1).stores(v1Stores);
  legacy.version(2).stores(v2Stores);
  legacy.version(3).stores(v3Stores);
  await legacy.open();
  await legacy.table("settings").put({ ...defaultSettings, dbSchemaVersion: 3, backupVersion: 3 });
  await legacy.table("routines").put(routine());
  if (includeRecoveryPoint) {
    const legacySnapshot = snapshot("Before schema v4");
    Reflect.deleteProperty(legacySnapshot, "pantryItems");
    await legacy.table("recoveryPoints").put({
      id: "recovery_v3",
      reason: "before_restore",
      createdAt: "2026-08-10T00:00:00.000Z",
      snapshot: {
        ...legacySnapshot,
        settings: { ...legacySnapshot.settings, dbSchemaVersion: 3, backupVersion: 3 }
      }
    });
  }
  legacy.close();
}

async function createV4Database(name: string, includeRecoveryPoint = false): Promise<void> {
  const legacy = new Dexie(name);
  legacy.version(1).stores(v1Stores);
  legacy.version(2).stores(v2Stores);
  legacy.version(3).stores(v3Stores);
  legacy.version(4).stores(v4Stores);
  await legacy.open();
  await legacy.table("settings").put({ ...defaultSettings, dbSchemaVersion: 4, backupVersion: 4 });
  await legacy.table("routines").put(routine());
  if (includeRecoveryPoint) {
    const legacySnapshot = snapshot("Before schema v5");
    Reflect.deleteProperty(legacySnapshot, "mealPlans");
    await legacy.table("recoveryPoints").put({
      id: "recovery_v4",
      reason: "before_restore",
      createdAt: "2026-08-14T00:00:00.000Z",
      snapshot: {
        ...legacySnapshot,
        settings: { ...legacySnapshot.settings, dbSchemaVersion: 4, backupVersion: 4 }
      }
    });
  }
  legacy.close();
}

beforeEach(() => databases.splice(0));
afterEach(async () => {
  for (const db of databases) {
    db.close();
    await db.delete();
  }
});

describe("IndexedDB schema and recovery", () => {
  it("saves onboarding profile and starter routines atomically", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);

    await saveInitialSetup(profile(), [routine()], db);

    expect((await getProfile(db))?.displayName).toBe("Local lifter");
    expect(await db.routines.toArray()).toHaveLength(1);
  });

  it("rolls onboarding back when a starter routine cannot be stored", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    db.routines.hook("creating", () => {
      throw new Error("simulated routine failure");
    });

    await expect(saveInitialSetup(profile(), [routine()], db)).rejects.toThrow("simulated routine failure");

    expect(await getProfile(db)).toBeUndefined();
    expect(await db.routines.count()).toBe(0);
  });

  it("initializes schema v5 and round-trips every personal-data collection", async () => {
    const source = makeDatabase();
    await initializeDatabase(source);
    await saveProfile(profile(), source);
    await source.routines.put(routine());
    await source.programs.put(program());
    await source.recipes.put({
      id: "recipe_oats",
      name: { vi: "Yến mạch", en: "Oats" },
      ingredients: [{
        id: "ingredient_oats",
        foodId: "food_oats",
        foodNameSnapshot: { vi: "Yến mạch", en: "Oats" },
        grams: 100,
        nutrientsPer100gSnapshot: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 }
      }],
      yieldGrams: 100,
      servings: 1,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z"
    });
    await source.waterEntries.put({ id: "water_1", date: "2026-08-10", amountMl: 500, createdAt: "2026-08-10T01:00:00.000Z" });
    await source.foodPreferences.put({ id: "preference_oats", foodId: "food_oats", favorite: true, defaultServingGrams: 50, useCount: 3 });
    await savePantryItem({
      id: "pantry_oats",
      kind: "food",
      foodId: "food_oats",
      foodNameSnapshot: { vi: "Yến mạch", en: "Oats" },
      groupId: "starch",
      availableGrams: 500,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z"
    }, source);
    await saveMealPlan(savedMealPlan(), source);
    const exported = await exportAllData(source);

    expect(source.verno).toBe(5);
    expect(exported.settings.dbSchemaVersion).toBe(5);
    expect(exported.profile?.displayName).toBe("Local lifter");
    expect(exported).toMatchObject({
      programs: [{ id: "program_starter" }],
      recipes: [{ id: "recipe_oats" }],
      waterEntries: [{ id: "water_1" }],
      foodPreferences: [{ id: "preference_oats" }],
      pantryItems: [{ id: "pantry_oats", groupId: "starch" }],
      mealPlans: [{ id: "meal_plan_1", sourcePackVersion: "2026.08.3" }]
    });

    const target = makeDatabase();
    await initializeDatabase(target);
    await replaceAllData(exported, target);

    expect(await getProfile(target)).toEqual(exported.profile);
    expect(await exportAllData(target)).toEqual(exported);
  });

  it("updates catalog and template metadata without replacing user routines", async () => {
    const db = makeDatabase();
    await db.open();
    await db.settings.put({ ...defaultSettings, catalogVersion: 2, routineTemplateVersion: 1 });
    await db.routines.put(routine());

    await initializeDatabase(db);

    expect(await db.settings.get("app")).toMatchObject({ catalogVersion: 3, routineTemplateVersion: 2 });
    expect((await db.routines.get("routine_starter"))?.name.en).toBe("Full body");
  });

  it("migrates v1 settings additively and keeps an installed nutrition pack during restore", async () => {
    const name = `gym-local-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores(v1Stores);
    await legacy.table("settings").put({ ...defaultSettings, dbSchemaVersion: 1, backupVersion: 1 });
    legacy.close();

    const db = new GymDatabase(name);
    databases.push(db);
    await initializeDatabase(db);
    expect((await db.settings.get("app"))?.dbSchemaVersion).toBe(5);

    await saveNutritionPackRecord({ id: "nutrition-pack", status: "ready", version: "2026.04", bytesDownloaded: 123, installedAt: "2026-08-10T00:00:00.000Z" }, db);
    const data = await exportAllData(db);
    await replaceAllData(data, db);
    expect(await getNutritionPackRecord(db)).toMatchObject({ status: "ready", version: "2026.04" });
  });

  it("migrates v2 nutrition metadata and the legacy installed-pack record without losing data", async () => {
    const name = `gym-local-v2-migration-${crypto.randomUUID()}`;
    await createV2Database(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores(v1Stores);
    legacy.version(2).stores(v2Stores);
    await legacy.open();
    await legacy.table("profiles").put({
      ...profile(),
      biologicalSex: "male",
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityFactor: 1.55,
      nutritionTarget: {
        calories: 2600,
        protein: 160,
        carbs: 320,
        fat: 75,
        waterMl: 2800,
        formulaVersion: 1
      }
    });
    await legacy.table("routines").put(routine());
    await legacy.table("nutritionPacks").put({
      id: "nutrition-pack",
      status: "ready",
      version: "2026.04",
      bytesDownloaded: 123,
      installedAt: "2026-08-10T00:00:00.000Z",
      checksum: "legacy-checksum",
      foodCount: 42
    });
    legacy.close();

    const db = new GymDatabase(name);
    databases.push(db);
    await db.open();

    expect(db.verno).toBe(5);
    expect(await db.routines.count()).toBe(1);
    expect((await db.profiles.get("profile"))?.nutritionTarget).toMatchObject({
      source: "estimated",
      calculatedAt: "2026-08-10T00:00:00.000Z",
      basis: { biologicalSex: "male", age: 30, heightCm: 180, weightKg: 80, activityFactor: 1.55, goal: "hypertrophy" }
    });
    expect(await getNutritionPackRecord(db)).toMatchObject({
      status: "ready",
      active: { version: "2026.04", checksum: "legacy-checksum", foodCount: 42 }
    });
    expect(await Promise.all([
      db.programs.count(),
      db.recipes.count(),
      db.waterEntries.count(),
      db.foodPreferences.count(),
      db.pantryItems.count(),
      db.mealPlans.count(),
      db.recoveryPoints.count()
    ])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("rolls the entire v2-to-v3 upgrade back if its transaction fails", async () => {
    const name = `gym-local-failed-v3-migration-${crypto.randomUUID()}`;
    await createV2Database(name);
    const legacyWriter = new Dexie(name);
    legacyWriter.version(1).stores(v1Stores);
    legacyWriter.version(2).stores(v2Stores);
    await legacyWriter.open();
    await legacyWriter.table("routines").put(routine());
    legacyWriter.close();

    const failing = new GymDatabase(name, {
      beforeV3Commit: () => {
        throw new Error("simulated v3 migration failure");
      }
    });
    await expect(failing.open()).rejects.toThrow("simulated v3 migration failure");
    failing.close();

    const verifier = new Dexie(name);
    verifier.version(1).stores(v1Stores);
    verifier.version(2).stores(v2Stores);
    await verifier.open();
    expect(verifier.verno).toBe(2);
    expect(await verifier.table("routines").count()).toBe(1);
    expect(await verifier.table("settings").get("app")).toMatchObject({ dbSchemaVersion: 2, backupVersion: 2 });
    verifier.close();

    const recovered = new GymDatabase(name);
    databases.push(recovered);
    await recovered.open();
    expect(recovered.verno).toBe(5);
    expect(await recovered.routines.count()).toBe(1);
  });

  it("migrates v3 through v5 additively and upgrades recovery snapshots", async () => {
    const name = `gym-local-v3-migration-${crypto.randomUUID()}`;
    await createV3Database(name, true);

    const db = new GymDatabase(name);
    databases.push(db);
    await db.open();

    expect(db.verno).toBe(5);
    expect(await db.routines.count()).toBe(1);
    expect(await db.pantryItems.toArray()).toEqual([]);
    expect(await db.mealPlans.toArray()).toEqual([]);
    expect(await db.settings.get("app")).toMatchObject({ dbSchemaVersion: 5, backupVersion: 5 });
    expect((await db.recoveryPoints.get("recovery_v3"))?.snapshot).toMatchObject({
      pantryItems: [],
      mealPlans: [],
      settings: { dbSchemaVersion: 5, backupVersion: 5 }
    });
  });

  it("rolls the entire v3-to-v4 upgrade back when its transaction fails", async () => {
    const name = `gym-local-failed-v4-migration-${crypto.randomUUID()}`;
    await createV3Database(name);

    const failing = new GymDatabase(name, {
      beforeV4Commit: () => {
        throw new Error("simulated v4 migration failure");
      }
    });
    await expect(failing.open()).rejects.toThrow("simulated v4 migration failure");
    failing.close();

    const verifier = new Dexie(name);
    verifier.version(1).stores(v1Stores);
    verifier.version(2).stores(v2Stores);
    verifier.version(3).stores(v3Stores);
    await verifier.open();
    expect(verifier.verno).toBe(3);
    expect(await verifier.table("routines").count()).toBe(1);
    expect(await verifier.table("settings").get("app")).toMatchObject({ dbSchemaVersion: 3, backupVersion: 3 });
    verifier.close();

    const recovered = new GymDatabase(name);
    databases.push(recovered);
    await recovered.open();
    expect(recovered.verno).toBe(5);
    expect(await recovered.routines.count()).toBe(1);
  });

  it("migrates v4 to v5 additively and gives recovery snapshots an empty meal-plan list", async () => {
    const name = `gym-local-v4-migration-${crypto.randomUUID()}`;
    await createV4Database(name, true);

    const db = new GymDatabase(name);
    databases.push(db);
    await db.open();

    expect(db.verno).toBe(5);
    expect(await db.routines.count()).toBe(1);
    expect(await db.mealPlans.toArray()).toEqual([]);
    expect(await db.settings.get("app")).toMatchObject({ dbSchemaVersion: 5, backupVersion: 5 });
    expect((await db.recoveryPoints.get("recovery_v4"))?.snapshot).toMatchObject({
      mealPlans: [],
      settings: { dbSchemaVersion: 5, backupVersion: 5 }
    });
  });

  it("rolls the entire v4-to-v5 upgrade back when its transaction fails", async () => {
    const name = `gym-local-failed-v5-migration-${crypto.randomUUID()}`;
    await createV4Database(name);

    const failing = new GymDatabase(name, {
      beforeV5Commit: () => {
        throw new Error("simulated v5 migration failure");
      }
    });
    await expect(failing.open()).rejects.toThrow("simulated v5 migration failure");
    failing.close();

    const verifier = new Dexie(name);
    verifier.version(1).stores(v1Stores);
    verifier.version(2).stores(v2Stores);
    verifier.version(3).stores(v3Stores);
    verifier.version(4).stores(v4Stores);
    await verifier.open();
    expect(verifier.verno).toBe(4);
    expect(await verifier.table("routines").count()).toBe(1);
    expect(await verifier.table("settings").get("app")).toMatchObject({ dbSchemaVersion: 4, backupVersion: 4 });
    verifier.close();

    const recovered = new GymDatabase(name);
    databases.push(recovered);
    await recovered.open();
    expect(recovered.verno).toBe(5);
    expect(await recovered.routines.count()).toBe(1);
  });

  it("blocks restore while a workout is active without changing data or recovery points", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await saveProfile(profile(), db);
    await replaceAllData(snapshot("First restore"), db);
    await saveSession({ id: "session_active_restore", startedAt: "2026-08-10T01:00:00.000Z", exercises: [] }, db);
    const before = await exportAllData(db);
    const recoveryBefore = await listRecoveryPoints(db);

    await expect(replaceAllData(snapshot("Blocked restore"), db)).rejects.toThrow("active workout");

    expect(await exportAllData(db)).toEqual(before);
    expect(await listRecoveryPoints(db)).toEqual(recoveryBefore);
  });

  it("rolls back both recovery creation and personal-data replacement when restore fails", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await saveProfile(profile(), db);
    await replaceAllData(snapshot("Baseline restored"), db);
    await db.routines.put(routine());
    const before = await exportAllData(db);
    const recoveryBefore = await listRecoveryPoints(db);
    db.programs.hook("creating", () => {
      throw new Error("simulated restore failure");
    });
    const replacement = snapshot("Restored");
    replacement.programs = [program("program_failure")];

    await expect(replaceAllData(replacement, db)).rejects.toThrow("simulated restore failure");

    expect(await exportAllData(db)).toEqual(before);
    expect(await listRecoveryPoints(db)).toEqual(recoveryBefore);
  });

  it("preserves the installed pack and consumes the latest recovery point when undoing", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await saveProfile({ ...profile(), displayName: "Before restore" }, db);
    await saveNutritionPackRecord({
      id: "nutrition-pack",
      status: "ready",
      version: "2026.04",
      bytesDownloaded: 123,
      installedAt: "2026-08-10T00:00:00.000Z"
    }, db);

    await replaceAllData(snapshot("After restore"), db);
    expect((await getProfile(db))?.displayName).toBe("After restore");
    expect(await listRecoveryPoints(db)).toHaveLength(1);
    expect(await undoLatestRestore(db)).toBe(true);

    expect((await getProfile(db))?.displayName).toBe("Before restore");
    expect(await listRecoveryPoints(db)).toEqual([]);
    expect(await undoLatestRestore(db)).toBe(false);
    expect(await getNutritionPackRecord(db)).toMatchObject({ status: "ready", version: "2026.04" });
  });

  it("keeps only the two newest pre-restore recovery points", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await saveProfile({ ...profile(), displayName: "A" }, db);

    await replaceAllData(snapshot("B"), db);
    await replaceAllData(snapshot("C"), db);
    await replaceAllData(snapshot("D"), db);

    const points = await listRecoveryPoints(db);
    expect(points).toHaveLength(2);
    expect(points.map((point) => point.snapshot.profile?.displayName)).toEqual(["C", "B"]);
  });

  it("recovers an unfinished session and clears the pointer after finish", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    const session: WorkoutSession = {
      id: "session_active",
      startedAt: "2026-08-10T01:00:00.000Z",
      exercises: []
    };

    await saveSession(session, db);
    expect((await getActiveSession(db))?.id).toBe(session.id);

    await saveSession({ ...session, finishedAt: "2026-08-10T02:00:00.000Z" }, db);
    expect(await getActiveSession(db)).toBeUndefined();
    expect((await db.settings.get("app")) ?? defaultSettings).toMatchObject({ activeSessionId: undefined });
  });

  it("creates, updates, lists, and deletes programs without changing routines", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await db.routines.put(routine());

    const saved = await saveProgram({
      ...program(),
      activeDayIndex: 9,
      days: [
        { order: 4, routineId: "routine_starter" },
        { order: 2, routineId: "routine_starter" }
      ]
    }, db);
    expect(saved.days.map((day) => day.order)).toEqual([0, 1]);
    expect(saved.activeDayIndex).toBe(1);
    expect(await listPrograms(db)).toEqual([saved]);

    const renamed = await saveProgram({ ...saved, name: { vi: "Đã đổi tên", en: "Renamed" } }, db);
    expect(await listPrograms(db)).toEqual([renamed]);
    expect((await db.routines.get("routine_starter"))?.name.en).toBe("Full body");

    await selectProgram(saved.id, db);
    await expect(deleteRoutine("routine_starter", db)).rejects.toThrow("used by a program");
    expect(await db.routines.get("routine_starter")).toBeDefined();
    await deleteProgram(saved.id, db);
    expect(await listPrograms(db)).toEqual([]);
    expect((await db.settings.get("app"))?.activeProgramId).toBeUndefined();
    await deleteRoutine("routine_starter", db);
    expect(await db.routines.get("routine_starter")).toBeUndefined();
  });

  it("finishes a session and persistently advances matching program days atomically", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await db.routines.put(routine());
    await db.programs.put({
      ...program(),
      days: [
        { order: 0, routineId: "routine_starter" },
        { order: 1, routineId: "routine_next" }
      ]
    });
    await db.programs.put({
      ...program("program_same_routine_not_started"),
      days: [
        { order: 0, routineId: "routine_starter" },
        { order: 1, routineId: "routine_next" }
      ]
    });
    await selectProgram("program_starter", db);
    const active: WorkoutSession = {
      id: "session_program_day",
      programId: "program_starter",
      routineId: "routine_starter",
      startedAt: "2026-08-10T01:00:00.000Z",
      exercises: []
    };
    await saveStartedSession(active, db);

    const programs = await saveCompletedSessionAndAdvanceProgram({
      ...active,
      finishedAt: "2026-08-10T02:00:00.000Z"
    }, db);

    expect(programs[0]?.activeDayIndex).toBe(1);
    expect((await db.programs.get("program_starter"))?.activeDayIndex).toBe(1);
    expect((await db.programs.get("program_same_routine_not_started"))?.activeDayIndex).toBe(0);
    expect((await db.sessions.get(active.id))?.finishedAt).toBe("2026-08-10T02:00:00.000Z");
    expect(await getActiveSession(db)).toBeUndefined();
  });

  it("rolls completion back when advancing a program cannot be persisted", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await db.programs.put(program());
    await selectProgram("program_starter", db);
    const active: WorkoutSession = {
      id: "session_program_failure",
      programId: "program_starter",
      routineId: "routine_starter",
      startedAt: "2026-08-10T01:00:00.000Z",
      exercises: []
    };
    await saveStartedSession(active, db);
    const failUpdate = () => {
      throw new Error("simulated program failure");
    };
    const updatingHook = db.programs.hook("updating");
    updatingHook.subscribe(failUpdate);

    try {
      await expect(saveCompletedSessionAndAdvanceProgram({
        ...active,
        finishedAt: "2026-08-10T02:00:00.000Z"
      }, db)).rejects.toThrow("simulated program failure");
    } finally {
      updatingHook.unsubscribe(failUpdate);
    }

    expect((await db.sessions.get(active.id))?.finishedAt).toBeUndefined();
    expect((await db.programs.get("program_starter"))?.activeDayIndex).toBe(0);
    expect((await getActiveSession(db))?.id).toBe(active.id);
  });

  it("does not advance an unselected program when a routine is completed", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await db.programs.bulkPut([
      program("program_selected_other_routine"),
      { ...program("program_same_routine_unselected"), activeDayIndex: 0 }
    ]);
    await db.programs.update("program_selected_other_routine", {
      days: [{ order: 0, routineId: "routine_other" }]
    });
    await selectProgram("program_selected_other_routine", db);
    const active: WorkoutSession = {
      id: "session_unselected_program",
      routineId: "routine_starter",
      startedAt: "2026-08-10T01:00:00.000Z",
      exercises: []
    };
    await saveSession(active, db);

    await saveCompletedSessionAndAdvanceProgram({ ...active, finishedAt: "2026-08-10T02:00:00.000Z" }, db);

    expect((await db.programs.get("program_selected_other_routine"))?.activeDayIndex).toBe(0);
    expect((await db.programs.get("program_same_routine_unselected"))?.activeDayIndex).toBe(0);
  });

  it("validates a program workout at start and preserves selection for standalone workouts", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await db.programs.put(program());
    await selectProgram("program_starter", db);
    const standalone: WorkoutSession = {
      id: "session_standalone",
      routineId: "routine_other",
      startedAt: "2026-08-10T01:00:00.000Z",
      exercises: []
    };
    await saveStartedSession(standalone, db);
    expect(await db.settings.get("app")).toMatchObject({
      activeSessionId: standalone.id,
      activeProgramId: "program_starter"
    });

    await saveSession({ ...standalone, finishedAt: "2026-08-10T01:30:00.000Z" }, db);
    await expect(saveStartedSession({
      ...standalone,
      id: "session_wrong_day",
      programId: "program_starter"
    }, db)).rejects.toThrow("does not match");
    expect(await getActiveSession(db)).toBeUndefined();
  });

  it("serializes concurrent autosaves in call order", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    const session: WorkoutSession = {
      id: "session_queued",
      startedAt: "2026-08-10T01:00:00.000Z",
      exercises: []
    };
    const finished = { ...session, finishedAt: "2026-08-10T02:00:00.000Z" };

    await Promise.all([saveSession(session, db), saveSession(finished, db)]);

    expect((await db.sessions.get(session.id))?.finishedAt).toBe(finished.finishedAt);
    expect(await getActiveSession(db)).toBeUndefined();
  });

  it("persists nutrition editor records and records recent food use atomically", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    const food = {
      id: "food_milk",
      name: { vi: "Sá»¯a", en: "Milk" },
      barcode: "0123456789012",
      per100g: { calories: 60, protein: 3, carbs: 5, fat: 3 },
      source: "custom" as const,
      updatedAt: "2026-08-13T00:00:00.000Z"
    };
    await saveFood(food, db);
    expect((await findSavedFoodByBarcode("0 123 456 789 012", db))?.id).toBe(food.id);

    const recipe = await saveRecipe({
      id: "recipe_milk",
      name: { vi: "Sá»¯a", en: "Milk" },
      ingredients: [{
        id: "ingredient_milk",
        foodId: food.id,
        foodNameSnapshot: food.name,
        grams: 200,
        nutrientsPer100gSnapshot: food.per100g
      }],
      yieldGrams: 200,
      servings: 1,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z"
    }, db);
    await saveWaterEntry({ id: "water_1", date: "2026-08-13", amountMl: 350, createdAt: "2026-08-13T01:00:00.000Z" }, db);
    await saveWaterEntry({ id: "water_2", date: "2026-08-12", amountMl: 500, createdAt: "2026-08-12T01:00:00.000Z" }, db);
    expect((await listRecipes(db))[0]?.id).toBe(recipe.id);
    expect(await listWaterEntriesForDate("2026-08-13", db)).toHaveLength(1);
    expect(await listWaterEntries(db)).toHaveLength(2);

    const preference = await saveFoodPreference({
      id: "preference_milk",
      foodId: food.id,
      favorite: true,
      defaultServingGrams: 250,
      useCount: 0
    }, db);
    const meal = {
      id: "meal_milk",
      date: "2026-08-13",
      meal: "breakfast" as const,
      foodId: food.id,
      foodNameSnapshot: food.name,
      grams: 250,
      nutrientsSnapshot: { calories: 150, protein: 7.5, carbs: 12.5, fat: 7.5 },
      createdAt: "2026-08-13T02:00:00.000Z"
    };
    const used = await saveMealAndRecordFoodUse(meal, {}, db);
    expect(used).toMatchObject({ id: preference.id, favorite: true, defaultServingGrams: 250, useCount: 1, lastUsedAt: meal.createdAt });
    expect(await listFoodPreferences(db)).toEqual([used]);

    await deleteFood(food.id, db);
    expect(await findSavedFoodByBarcode(food.barcode, db)).toBeUndefined();
    expect(await db.meals.get(meal.id)).toEqual(meal);
    expect(await db.recipes.get(recipe.id)).toBeDefined();
    expect(await listFoodPreferences(db)).toEqual([]);
    await deleteRecipe(recipe.id, db);
    await deleteWaterEntry("water_1", db);
    await deleteFoodPreference("missing", db);
    expect(await listRecipes(db)).toEqual([]);
    expect(await listWaterEntriesForDate("2026-08-13", db)).toEqual([]);
  });

  it("stores exact foods and broad food groups in the pantry without touching nutrition history", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await saveMeal({
      id: "meal_before_pantry",
      date: "2026-08-14",
      meal: "lunch",
      foodId: "pack_usda_2708403",
      foodNameSnapshot: { vi: "Cơm", en: "Rice" },
      grams: 150,
      nutrientsSnapshot: { calories: 195, protein: 4, carbs: 42, fat: 0.5 },
      createdAt: "2026-08-14T01:00:00.000Z"
    }, db);

    const createdAt = "2026-08-14T00:00:00.000Z";
    await savePantryItem({
      id: "pantry_rice",
      kind: "food",
      foodId: "pack_usda_2708403",
      foodNameSnapshot: { vi: "Cơm trắng", en: "White rice" },
      groupId: "starch",
      availableGrams: 500,
      createdAt,
      updatedAt: createdAt
    }, db);
    await savePantryItem({
      id: "pantry_any_meat",
      kind: "group",
      groupId: "meat",
      groupNameSnapshot: { vi: "Thịt", en: "Meat" },
      createdAt,
      updatedAt: createdAt
    }, db);

    expect(await listPantryItems(db)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "pantry_rice", foodId: "pack_usda_2708403", availableGrams: 500 }),
      expect.objectContaining({ id: "pantry_any_meat", groupId: "meat" })
    ]));
    await expect(savePantryItem({
      id: "pantry_invalid",
      kind: "group",
      groupId: "fruit",
      groupNameSnapshot: { vi: "Trái cây", en: "Fruit" },
      availableGrams: 0,
      createdAt,
      updatedAt: createdAt
    }, db)).rejects.toThrow("Pantry amount");
    await deletePantryItem("pantry_rice", db);
    expect(await db.pantryItems.get("pantry_rice")).toBeUndefined();
    expect(await db.meals.get("meal_before_pantry")).toBeDefined();
  });

  it("creates, updates, lists, and deletes saved meal-plan snapshots", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    const original = await saveMealPlan(savedMealPlan(), db);
    const updated = await saveMealPlan({
      ...original,
      name: { vi: "Thực đơn đã sửa", en: "Updated meal plan" },
      createdAt: "2099-01-01T00:00:00.000Z"
    }, db);

    expect(updated.createdAt).toBe(original.createdAt);
    expect((await listMealPlans(db))[0]).toMatchObject({
      id: original.id,
      name: { vi: "Thực đơn đã sửa" },
      sourcePackVersion: "2026.08.3"
    });

    await deleteMealPlan(original.id, db);
    expect(await listMealPlans(db)).toEqual([]);
  });

  it("logs a saved meal-plan day append-only, never consumes pantry, and skips duplicate writes", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    await savePantryItem({
      id: "pantry_rice_for_plan",
      kind: "food",
      foodId: "food_rice",
      foodNameSnapshot: { vi: "Gạo", en: "Rice" },
      groupId: "starch",
      availableGrams: 50,
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z"
    }, db);
    const plan = await saveMealPlan(savedMealPlan(), db);

    const first = await logMealPlanDays(plan.id, [0], db);
    const second = await logMealPlanDays(plan.id, [0], db);

    expect(first.createdMeals).toHaveLength(1);
    expect(first.createdMeals[0]).toMatchObject({
      date: "2026-08-14",
      meal: "lunch",
      foodNameSnapshot: { vi: "Cơm gà" },
      sourceMealPlanId: plan.id,
      sourcePlannedMealId: "planned_meal_1"
    });
    expect(second.createdMeals).toEqual([]);
    expect(second.skippedPlannedMealIds).toEqual(["planned_meal_1"]);
    expect(await db.meals.count()).toBe(1);
    expect((await db.foodPreferences.where("foodId").equals("pack_recipe_com_ga").first())?.useCount).toBe(1);
    expect((await db.pantryItems.get("pantry_rice_for_plan"))?.availableGrams).toBe(50);
    expect(await db.mealPlans.get(plan.id)).toEqual(plan);
  });

  it("rolls an entire meal-plan logging transaction back when a preference write fails", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    const plan = await saveMealPlan(savedMealPlan("meal_plan_rollback"), db);
    db.foodPreferences.hook("creating", () => {
      throw new Error("simulated meal-plan preference failure");
    });

    await expect(logMealPlanDays(plan.id, [0], db)).rejects.toThrow("simulated meal-plan preference failure");
    expect(await db.meals.count()).toBe(0);
    expect(await db.foodPreferences.count()).toBe(0);
    expect(await db.mealPlans.get(plan.id)).toEqual(plan);
  });

  it("rolls back a meal when recent-food preference persistence fails", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    db.foodPreferences.hook("creating", () => {
      throw new Error("simulated preference failure");
    });
    const meal = {
      id: "meal_rollback",
      date: "2026-08-13",
      meal: "snack" as const,
      foodId: "food_rollback",
      foodNameSnapshot: { vi: "Táº¡m", en: "Temporary" },
      grams: 100,
      nutrientsSnapshot: { calories: 100, protein: 1, carbs: 20, fat: 1 },
      createdAt: "2026-08-13T02:00:00.000Z"
    };

    await expect(saveMealAndRecordFoodUse(meal, {}, db)).rejects.toThrow("simulated preference failure");
    expect(await db.meals.count()).toBe(0);
    expect(await db.foodPreferences.count()).toBe(0);
  });

  it("rejects non-finite numeric values at the storage boundary", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);

    await expect(saveMeal({
      id: "meal_invalid",
      date: "2026-08-12",
      meal: "lunch",
      foodId: "food_invalid",
      foodNameSnapshot: { vi: "Không hợp lệ", en: "Invalid" },
      grams: Number.NaN,
      nutrientsSnapshot: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      createdAt: "2026-08-12T12:00:00.000Z"
    }, db)).rejects.toThrow("finite numbers");

    expect(await db.meals.count()).toBe(0);
  });
});
