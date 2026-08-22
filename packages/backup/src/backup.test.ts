import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { PersonalDataSnapshot, SavedMealPlan } from "@gym/contracts";
import { defaultSettings } from "@gym/storage";
import { cloneRoutineTemplate, createSessionFromRoutine } from "@gym/workouts";
import { createBackup, readBackup } from "./index";

function emptyData(overrides: Partial<PersonalDataSnapshot> = {}): PersonalDataSnapshot {
  return {
    profile: undefined,
    routines: [],
    programs: [],
    sessions: [],
    foods: [],
    meals: [],
    recipes: [],
    waterEntries: [],
    foodPreferences: [],
    pantryItems: [],
    bodyMetrics: [],
    customVariants: [],
    settings: { ...defaultSettings },
    ...overrides,
    mealPlans: overrides.mealPlans ?? []
  };
}

function savedMealPlan(): SavedMealPlan {
  const nutrients = { calories: 420, protein: 28, carbs: 52, fat: 11, vitaminCMg: 18 };
  return {
    id: "meal_plan_1",
    name: { vi: "Thực đơn 14 tháng 8", en: "August 14 meal plan" },
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
      seed: "backup-test"
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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function legacyBackup(data: unknown, backupVersion: 1 | 2): Promise<Blob> {
  const serialized = JSON.stringify(data);
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify({
    appVersion: backupVersion === 1 ? "0.1.0" : "0.2.0",
    backupVersion,
    exportedAt: "2026-08-10T00:00:00.000Z",
    checksum: await sha256(serialized)
  }));
  zip.file("data.json", serialized);
  return zip.generateAsync({ type: "blob" });
}

async function v3Backup(): Promise<Blob> {
  const data = emptyData();
  Reflect.deleteProperty(data, "pantryItems");
  Reflect.deleteProperty(data, "mealPlans");
  data.settings = { ...data.settings, dbSchemaVersion: 3, backupVersion: 3 };
  const serialized = JSON.stringify(data);
  const collectionKeys = ["routines", "programs", "sessions", "foods", "meals", "recipes", "waterEntries", "foodPreferences", "bodyMetrics", "customVariants"] as const;
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify({
    appVersion: "0.5.0",
    backupVersion: 3,
    exportedAt: "2026-08-13T00:00:00.000Z",
    checksum: await sha256(serialized),
    format: "gym-local-backup",
    dbSchemaVersion: 3,
    dataBytes: new TextEncoder().encode(serialized).byteLength,
    counts: Object.fromEntries(collectionKeys.map((key) => [key, data[key].length]))
  }));
  zip.file("data.json", serialized);
  return zip.generateAsync({ type: "blob" });
}

async function v4Backup(): Promise<Blob> {
  const data = emptyData();
  Reflect.deleteProperty(data, "mealPlans");
  data.settings = { ...data.settings, dbSchemaVersion: 4, backupVersion: 4 };
  const serialized = JSON.stringify(data);
  const collectionKeys = [
    "routines", "programs", "sessions", "foods", "meals", "recipes", "waterEntries",
    "foodPreferences", "bodyMetrics", "customVariants", "pantryItems"
  ] as const;
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify({
    appVersion: "0.6.0",
    backupVersion: 4,
    exportedAt: "2026-08-14T00:00:00.000Z",
    checksum: await sha256(serialized),
    format: "gym-local-backup",
    dbSchemaVersion: 4,
    dataBytes: new TextEncoder().encode(serialized).byteLength,
    counts: Object.fromEntries(collectionKeys.map((key) => [key, data[key].length]))
  }));
  zip.file("data.json", serialized);
  return zip.generateAsync({ type: "blob" });
}

describe("backup", () => {
  it("round-trips v5 personal data, Vietnamese text, pantry, meal plans, tracking semantics, and manifest metadata", async () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const session = createSessionFromRoutine(routine);
    session.programId = "program_1";
    const data = emptyData({
      routines: [routine],
      programs: [{
        id: "program_1",
        name: { vi: "Chương trình", en: "Program" },
        goal: "hypertrophy",
        difficulty: "beginner",
        days: [{ order: 0, routineId: routine.id }],
        activeDayIndex: 0,
        progressionRule: {
          type: "double_progression",
          successSessions: 2,
          defaultIncrementKg: 2.5,
          fallbackIncreasePercent: 2.5
        },
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z"
      }],
      settings: { ...defaultSettings, activeProgramId: "program_1" },
      sessions: [session],
      foods: [{
        id: "food_oats",
        name: { vi: "Y\u1ebfn m\u1ea1ch hi\u1ec7n t\u1ea1i", en: "Current oats" },
        per100g: { calories: 420, protein: 18, carbs: 70, fat: 8, ironMg: 5.2 },
        source: "custom",
        updatedAt: "2026-08-13T00:00:00.000Z"
      }],
      meals: [{
        id: "meal_historical_oats",
        date: "2026-08-10",
        meal: "breakfast",
        foodId: "food_oats",
        foodNameSnapshot: { vi: "Y\u1ebfn m\u1ea1ch c\u0169", en: "Historical oats" },
        grams: 50,
        nutrientsSnapshot: { calories: 194, protein: 8.45, carbs: 33.15, fat: 3.45, ironMg: 2.35 },
        createdAt: "2026-08-10T01:00:00.000Z"
      }, {
        id: "meal_from_plan",
        date: "2026-08-14",
        meal: "lunch",
        foodId: "pack_recipe_com_ga",
        foodNameSnapshot: { vi: "Cơm gà", en: "Chicken rice" },
        grams: 420,
        nutrientsSnapshot: { calories: 420, protein: 28, carbs: 52, fat: 11, vitaminCMg: 18 },
        sourceMealPlanId: "meal_plan_1",
        sourcePlannedMealId: "planned_meal_1",
        createdAt: "2026-08-14T01:00:00.000Z"
      }],
      recipes: [{
        id: "recipe_1",
        name: { vi: "Yến mạch", en: "Oats" },
        ingredients: [{
          id: "ingredient_1",
          foodId: "food_oats",
          foodNameSnapshot: { vi: "Yến mạch", en: "Oats" },
          grams: 100,
          nutrientsPer100gSnapshot: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, ironMg: 4.7 }
        }],
        yieldGrams: 100,
        servings: 1,
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z"
      }],
      waterEntries: [{
        id: "water_1",
        date: "2026-08-10",
        amountMl: 500,
        createdAt: "2026-08-10T01:00:00.000Z"
      }],
      foodPreferences: [{
        id: "preference_1",
        foodId: "food_oats",
        favorite: true,
        defaultServingGrams: 50,
        useCount: 3
      }],
      pantryItems: [{
        id: "pantry_oats",
        kind: "food",
        foodId: "pack_usda_123",
        foodNameSnapshot: { vi: "Yến mạch", en: "Oats" },
        groupId: "starch",
        availableGrams: 500,
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z"
      }],
      mealPlans: [savedMealPlan()]
    });

    const restored = await readBackup(await createBackup(data));

    expect(restored.data.settings.catalogVersion).toBe(3);
    expect(restored.manifest).toMatchObject({ backupVersion: 5, format: "gym-local-backup", dbSchemaVersion: 5 });
    expect(restored.manifest.counts).toEqual({
      routines: 1,
      programs: 1,
      sessions: 1,
      foods: 1,
      meals: 2,
      recipes: 1,
      waterEntries: 1,
      foodPreferences: 1,
      pantryItems: 1,
      mealPlans: 1,
      bodyMetrics: 0,
      customVariants: 0
    });
    expect(restored.data.routines[0].name.vi).toBe(routine.name.vi);
    expect(restored.data.sessions[0].exercises[0].sets[0]).toMatchObject({ targetMinReps: 8, targetMaxReps: 12 });
    expect(restored.data.sessions[0].exercises[0].trackingProfileSnapshot).toMatchObject({ variantId: "squat__dumbbell" });
    expect(restored.data.sessions[0].programId).toBe("program_1");
    expect(restored.data.recipes[0].ingredients[0].nutrientsPer100gSnapshot).toMatchObject({ ironMg: 4.7 });
    expect(restored.data.meals[0]).toMatchObject({
      foodNameSnapshot: { vi: "Y\u1ebfn m\u1ea1ch c\u0169", en: "Historical oats" },
      nutrientsSnapshot: { calories: 194, ironMg: 2.35 }
    });
    expect(restored.data.foods[0].per100g).toMatchObject({ calories: 420, ironMg: 5.2 });
    expect(restored.data.waterEntries[0]).toMatchObject({ id: "water_1", amountMl: 500 });
    expect(restored.data.foodPreferences[0]).toMatchObject({
      foodId: "food_oats",
      favorite: true,
      defaultServingGrams: 50,
      useCount: 3
    });
    expect(restored.data.pantryItems[0]).toMatchObject({ id: "pantry_oats", groupId: "starch", availableGrams: 500 });
    expect(restored.data.mealPlans[0]).toMatchObject({
      id: "meal_plan_1",
      algorithmVersion: 1,
      sourcePackVersion: "2026.08.3",
      days: [{ meals: [{ recipeNameSnapshot: { vi: "Cơm gà" } }] }]
    });
    expect(restored.data.meals[1]).toMatchObject({
      sourceMealPlanId: "meal_plan_1",
      sourcePlannedMealId: "planned_meal_1"
    });
    expect(restored.data.settings.activeProgramId).toBe("program_1");
  });

  it("keeps micronutrients and upgrades supported v1 settings through v2 to v3", async () => {
    const legacy = {
      profile: undefined,
      routines: [],
      sessions: [],
      foods: [{
        id: "food_spinach",
        name: { vi: "Rau bina", en: "Spinach" },
        per100g: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, ironMg: 2.7, vitaminCMg: 28.1 },
        source: "custom",
        updatedAt: "2026-08-10T00:00:00.000Z"
      }],
      meals: [],
      bodyMetrics: [],
      customVariants: [],
      settings: { ...defaultSettings, dbSchemaVersion: 1, backupVersion: 1 }
    };

    const restored = await readBackup(await legacyBackup(legacy, 1));

    expect(restored.data.foods[0].per100g).toMatchObject({ ironMg: 2.7, vitaminCMg: 28.1 });
    expect(restored.data.settings).toMatchObject({ dbSchemaVersion: 5, backupVersion: 5 });
    expect(restored.data).toMatchObject({ programs: [], recipes: [], waterEntries: [], foodPreferences: [], pantryItems: [], mealPlans: [] });
  });

  it("upgrades v2 nutrition metadata and accepts historical sessions without tracking snapshots", async () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const currentSession = createSessionFromRoutine(routine);
    const sessions = [{
      ...currentSession,
      exercises: currentSession.exercises.map((exercise) => ({ ...exercise, trackingProfileSnapshot: undefined }))
    }];
    const legacy = {
      profile: {
        id: "profile",
        displayName: "Legacy lifter",
        locale: "vi",
        units: "metric",
        goal: "hypertrophy",
        experience: "beginner",
        daysPerWeek: 3,
        age: 30,
        biologicalSex: "male",
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
        },
        locations: [],
        onboardingComplete: true,
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z"
      },
      routines: [routine],
      sessions,
      foods: [],
      meals: [],
      bodyMetrics: [],
      customVariants: [],
      settings: { ...defaultSettings, dbSchemaVersion: 2, backupVersion: 2 }
    };

    const restored = await readBackup(await legacyBackup(legacy, 2));

    expect(restored.data.profile?.nutritionTarget).toMatchObject({
      source: "estimated",
      calculatedAt: "2026-08-10T00:00:00.000Z",
      basis: {
        biologicalSex: "male",
        age: 30,
        heightCm: 180,
        weightKg: 80,
        activityFactor: 1.55,
        goal: "hypertrophy"
      }
    });
    expect(restored.data.sessions[0].exercises[0].trackingProfileSnapshot).toBeUndefined();
    expect(restored.data).toMatchObject({ programs: [], recipes: [], waterEntries: [], foodPreferences: [], pantryItems: [], mealPlans: [] });
  });

  it("migrates a detailed v3 backup to v5 with empty pantry and meal-plan collections", async () => {
    const restored = await readBackup(await v3Backup());

    expect(restored.manifest).toMatchObject({ backupVersion: 3, dbSchemaVersion: 3 });
    expect(restored.data.pantryItems).toEqual([]);
    expect(restored.data.mealPlans).toEqual([]);
    expect(restored.data.settings).toMatchObject({ dbSchemaVersion: 5, backupVersion: 5 });
  });

  it("migrates a detailed v4 backup to v5 without changing older personal data", async () => {
    const restored = await readBackup(await v4Backup());

    expect(restored.manifest).toMatchObject({ backupVersion: 4, dbSchemaVersion: 4 });
    expect(restored.data.pantryItems).toEqual([]);
    expect(restored.data.mealPlans).toEqual([]);
    expect(restored.data.settings).toMatchObject({ dbSchemaVersion: 5, backupVersion: 5 });
  });

  it("rejects a v5 manifest whose collection counts do not exactly match data", async () => {
    const original = await createBackup(emptyData());
    const zip = await JSZip.loadAsync(original);
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) throw new Error("test backup has no manifest");
    const manifest = JSON.parse(await manifestFile.async("text")) as { counts: Record<string, number> };
    manifest.counts.programs = 1;
    zip.file("manifest.json", JSON.stringify(manifest));

    await expect(readBackup(await zip.generateAsync({ type: "blob" }))).rejects.toThrow("collection counts");
  });

  it("rejects a v5 manifest whose byte count does not match serialized data", async () => {
    const original = await createBackup(emptyData());
    const zip = await JSZip.loadAsync(original);
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) throw new Error("test backup has no manifest");
    const manifest = JSON.parse(await manifestFile.async("text")) as { dataBytes: number };
    manifest.dataBytes += 1;
    zip.file("manifest.json", JSON.stringify(manifest));

    await expect(readBackup(await zip.generateAsync({ type: "blob" }))).rejects.toThrow("byte count");
  });

  it("validates tracking-profile snapshots instead of accepting arbitrary nested data", async () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const session = createSessionFromRoutine(routine);
    session.exercises[0].trackingProfileSnapshot = {
      ...session.exercises[0].trackingProfileSnapshot!,
      laterality: "invalid" as "bilateral"
    };

    await expect(createBackup(emptyData({ routines: [routine], sessions: [session] }))).rejects.toThrow();
  });

  it("rejects malformed program, recipe, water, and food-preference records", async () => {
    const invalidSnapshots: Array<[string, PersonalDataSnapshot]> = [
      ["program", emptyData({ programs: [{ id: "program_missing_fields" }] as PersonalDataSnapshot["programs"] })],
      ["recipe", emptyData({ recipes: [{ id: "recipe_missing_fields" }] as PersonalDataSnapshot["recipes"] })],
      ["water", emptyData({ waterEntries: [{
        id: "water_negative",
        date: "2026-08-10",
        amountMl: -1,
        createdAt: "2026-08-10T00:00:00.000Z"
      }] })],
      ["food preference", emptyData({ foodPreferences: [{
        id: "preference_bad_count",
        foodId: "food_1",
        favorite: true,
        useCount: -1
      }] })],
      ["pantry item", emptyData({ pantryItems: [{
        id: "pantry_invalid",
        kind: "group",
        groupId: "invalid_group",
        groupNameSnapshot: { vi: "Sai", en: "Invalid" },
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z"
      }] as unknown as PersonalDataSnapshot["pantryItems"] })]
    ];

    for (const [label, data] of invalidSnapshots) {
      await expect(createBackup(data), label).rejects.toThrow();
    }
  });

  it("rejects malformed saved meal plans and invalid append-only meal links", async () => {
    const invalidDayPlan = savedMealPlan();
    invalidDayPlan.days[0].dayIndex = 1;
    await expect(createBackup(emptyData({ mealPlans: [invalidDayPlan] }))).rejects.toThrow("meal plan day");

    const plan = savedMealPlan();
    await expect(createBackup(emptyData({
      mealPlans: [plan],
      meals: [{
        id: "meal_incomplete_plan_link",
        date: "2026-08-14",
        meal: "lunch",
        foodId: "pack_recipe_com_ga",
        foodNameSnapshot: { vi: "Cơm gà", en: "Chicken rice" },
        grams: 420,
        nutrientsSnapshot: { calories: 420, protein: 28, carbs: 52, fat: 11 },
        sourceMealPlanId: plan.id,
        createdAt: "2026-08-14T01:00:00.000Z"
      }]
    }))).rejects.toThrow("link is incomplete");

    await expect(createBackup(emptyData({
      mealPlans: [plan],
      meals: [{
        id: "meal_unknown_planned_meal",
        date: "2026-08-14",
        meal: "lunch",
        foodId: "pack_recipe_com_ga",
        foodNameSnapshot: { vi: "Cơm gà", en: "Chicken rice" },
        grams: 420,
        nutrientsSnapshot: { calories: 420, protein: 28, carbs: 52, fat: 11 },
        sourceMealPlanId: plan.id,
        sourcePlannedMealId: "planned_meal_missing",
        createdAt: "2026-08-14T01:00:00.000Z"
      }]
    }))).rejects.toThrow("link is invalid");
  });

  it("rejects a backup whose data no longer matches its checksum", async () => {
    const data = emptyData();
    const original = await createBackup(data);
    const zip = await JSZip.loadAsync(original);
    zip.file("data.json", JSON.stringify({ ...data, routines: [{ id: "tampered" }] }));

    await expect(readBackup(await zip.generateAsync({ type: "blob" }))).rejects.toThrow("checksum");
  });

  it("rejects malformed nested records before replacing local data", async () => {
    const malformedData = {
      routines: [],
      sessions: [{ id: "broken-session", exercises: "not-an-array" }],
      foods: [],
      meals: [],
      bodyMetrics: [],
      customVariants: [],
      settings: defaultSettings
    };

    await expect(readBackup(await legacyBackup(malformedData, 1))).rejects.toThrow();
  });

  it("refuses to create a backup containing non-finite nutrition data", async () => {
    const data = emptyData({
      foods: [{
        id: "food_bad",
        name: { vi: "Lỗi", en: "Bad" },
        per100g: { calories: Number.NaN, protein: 1, carbs: 1, fat: 1 },
        source: "custom" as const,
        updatedAt: "2026-08-10T00:00:00.000Z"
      }]
    });

    await expect(createBackup(data)).rejects.toThrow();
  });

  it("refuses to create a backup with an invalid active-session pointer", async () => {
    const data = emptyData({ settings: { ...defaultSettings, activeSessionId: "session_missing" } });
    await expect(createBackup(data)).rejects.toThrow("active workout pointer");
  });

  it("refuses to create a backup with an invalid active-program pointer", async () => {
    const data = emptyData({ settings: { ...defaultSettings, activeProgramId: "program_missing" } });
    await expect(createBackup(data)).rejects.toThrow("active program pointer");
  });
});
