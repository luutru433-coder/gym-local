import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { PersonalDataSnapshot } from "@gym/contracts";
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
    bodyMetrics: [],
    customVariants: [],
    settings: { ...defaultSettings },
    ...overrides
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

describe("backup", () => {
  it("round-trips v3 personal data, Vietnamese text, tracking semantics, and manifest metadata", async () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const session = createSessionFromRoutine(routine);
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
      sessions: [session],
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
      }]
    });

    const restored = await readBackup(await createBackup(data));

    expect(restored.data.settings.catalogVersion).toBe(3);
    expect(restored.manifest).toMatchObject({ backupVersion: 3, format: "gym-local-backup", dbSchemaVersion: 3 });
    expect(restored.manifest.counts).toEqual({
      routines: 1,
      programs: 1,
      sessions: 1,
      foods: 0,
      meals: 0,
      recipes: 1,
      waterEntries: 1,
      foodPreferences: 1,
      bodyMetrics: 0,
      customVariants: 0
    });
    expect(restored.data.routines[0].name.vi).toBe(routine.name.vi);
    expect(restored.data.sessions[0].exercises[0].sets[0]).toMatchObject({ targetMinReps: 8, targetMaxReps: 12 });
    expect(restored.data.sessions[0].exercises[0].trackingProfileSnapshot).toMatchObject({ variantId: "squat__dumbbell" });
    expect(restored.data.recipes[0].ingredients[0].nutrientsPer100gSnapshot).toMatchObject({ ironMg: 4.7 });
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
    expect(restored.data.settings).toMatchObject({ dbSchemaVersion: 3, backupVersion: 3 });
    expect(restored.data).toMatchObject({ programs: [], recipes: [], waterEntries: [], foodPreferences: [] });
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
    expect(restored.data).toMatchObject({ programs: [], recipes: [], waterEntries: [], foodPreferences: [] });
  });

  it("rejects a v3 manifest whose collection counts do not exactly match data", async () => {
    const original = await createBackup(emptyData());
    const zip = await JSZip.loadAsync(original);
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) throw new Error("test backup has no manifest");
    const manifest = JSON.parse(await manifestFile.async("text")) as { counts: Record<string, number> };
    manifest.counts.programs = 1;
    zip.file("manifest.json", JSON.stringify(manifest));

    await expect(readBackup(await zip.generateAsync({ type: "blob" }))).rejects.toThrow("collection counts");
  });

  it("rejects a v3 manifest whose byte count does not match serialized data", async () => {
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
      }] })]
    ];

    for (const [label, data] of invalidSnapshots) {
      await expect(createBackup(data), label).rejects.toThrow();
    }
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
});
