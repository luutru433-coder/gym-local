import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PersonalDataSnapshot, Profile, Program, Routine, WorkoutSession } from "@gym/contracts";
import {
  GymDatabase,
  defaultSettings,
  exportAllData,
  getActiveSession,
  getProfile,
  initializeDatabase,
  listRecoveryPoints,
  replaceAllData,
  getNutritionPackRecord,
  saveProfile,
  saveInitialSetup,
  saveMeal,
  saveNutritionPackRecord,
  saveSession,
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
    bodyMetrics: [],
    customVariants: [],
    settings: { ...defaultSettings }
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

async function createV2Database(name: string): Promise<void> {
  const legacy = new Dexie(name);
  legacy.version(1).stores(v1Stores);
  legacy.version(2).stores(v2Stores);
  await legacy.open();
  await legacy.table("settings").put({ ...defaultSettings, dbSchemaVersion: 2, backupVersion: 2 });
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

  it("initializes schema v3 and round-trips every personal-data collection", async () => {
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
    const exported = await exportAllData(source);

    expect(source.verno).toBe(3);
    expect(exported.settings.dbSchemaVersion).toBe(3);
    expect(exported.profile?.displayName).toBe("Local lifter");
    expect(exported).toMatchObject({
      programs: [{ id: "program_starter" }],
      recipes: [{ id: "recipe_oats" }],
      waterEntries: [{ id: "water_1" }],
      foodPreferences: [{ id: "preference_oats" }]
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
    expect((await db.settings.get("app"))?.dbSchemaVersion).toBe(3);

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

    expect(db.verno).toBe(3);
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
      db.recoveryPoints.count()
    ])).toEqual([0, 0, 0, 0, 0]);
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
    expect(recovered.verno).toBe(3);
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
