import Dexie, { type EntityTable } from "dexie";
import {
  APP_VERSIONS,
  type AppSettings,
  type BackupPayload,
  type BodyMetric,
  type ExerciseVariant,
  type FoodItem,
  type MealEntry,
  type NutritionPackRecord,
  type Profile,
  type Routine,
  type WorkoutSession
} from "@gym/contracts";

export class GymDatabase extends Dexie {
  profiles!: EntityTable<Profile, "id">;
  routines!: EntityTable<Routine, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;
  foods!: EntityTable<FoodItem, "id">;
  meals!: EntityTable<MealEntry, "id">;
  bodyMetrics!: EntityTable<BodyMetric, "id">;
  customVariants!: EntityTable<ExerciseVariant, "id">;
  settings!: EntityTable<AppSettings, "id">;
  nutritionPacks!: EntityTable<NutritionPackRecord, "id">;

  constructor(name = "gym-local") {
    super(name);
    this.version(1).stores({
      profiles: "id, updatedAt",
      routines: "id, goal, updatedAt, sourceTemplateId",
      sessions: "id, routineId, startedAt, finishedAt, locationId",
      foods: "id, barcode, updatedAt",
      meals: "id, date, meal, foodId, createdAt",
      bodyMetrics: "id, date",
      customVariants: "id, movementId, reviewStatus",
      settings: "id"
    });
    this.version(2).stores({
      profiles: "id, updatedAt",
      routines: "id, goal, updatedAt, sourceTemplateId",
      sessions: "id, routineId, startedAt, finishedAt, locationId",
      foods: "id, barcode, updatedAt",
      meals: "id, date, meal, foodId, createdAt",
      bodyMetrics: "id, date",
      customVariants: "id, movementId, reviewStatus",
      settings: "id",
      nutritionPacks: "id, status, version, installedAt"
    }).upgrade(async (transaction) => {
      const settingsTable = transaction.table<AppSettings>("settings");
      const settings = await settingsTable.get("app");
      if (settings) {
        await settingsTable.put({
          ...settings,
          dbSchemaVersion: 2,
          backupVersion: 2
        });
      }
    });
  }
}

export const gymDb = new GymDatabase();
let sessionWriteQueue: Promise<void> = Promise.resolve();

export const defaultSettings: AppSettings = {
  id: "app",
  catalogVersion: APP_VERSIONS.catalog,
  dbSchemaVersion: APP_VERSIONS.database,
  routineTemplateVersion: APP_VERSIONS.routines,
  nutritionFormulaVersion: APP_VERSIONS.nutritionFormula,
  backupVersion: APP_VERSIONS.backup
};

export async function initializeDatabase(db: GymDatabase = gymDb): Promise<void> {
  const settings = await db.settings.get("app");
  if (!settings) await db.settings.put(defaultSettings);
}

export async function persistentStorageStatus(): Promise<boolean | undefined> {
  if (!navigator.storage?.persisted) return undefined;
  try {
    return await navigator.storage.persisted();
  } catch {
    return undefined;
  }
}

export async function requestPersistentStorage(db: GymDatabase = gymDb): Promise<boolean> {
  const granted = navigator.storage?.persist ? await navigator.storage.persist() : false;
  const settings = (await db.settings.get("app")) ?? defaultSettings;
  await db.settings.put({
    ...settings,
    storagePersistenceRequestedAt: new Date().toISOString(),
    storagePersistenceGranted: granted
  });
  return granted;
}

export async function getProfile(db: GymDatabase = gymDb): Promise<Profile | undefined> {
  return db.profiles.toCollection().first();
}

export async function saveProfile(profile: Profile, db: GymDatabase = gymDb): Promise<void> {
  await db.profiles.put({ ...profile, updatedAt: new Date().toISOString() });
}

export async function listRoutines(db: GymDatabase = gymDb): Promise<Routine[]> {
  return db.routines.orderBy("updatedAt").reverse().toArray();
}

export async function saveRoutine(routine: Routine, db: GymDatabase = gymDb): Promise<void> {
  await db.routines.put({ ...routine, updatedAt: new Date().toISOString() });
}

export async function deleteRoutine(id: string, db: GymDatabase = gymDb): Promise<void> {
  await db.routines.delete(id);
}

export async function listSessions(db: GymDatabase = gymDb): Promise<WorkoutSession[]> {
  return db.sessions.orderBy("startedAt").reverse().toArray();
}

export async function saveSession(session: WorkoutSession, db: GymDatabase = gymDb): Promise<void> {
  const commit = () => db.transaction("rw", db.sessions, db.settings, async () => {
    await db.sessions.put(session);
    const settings = (await db.settings.get("app")) ?? defaultSettings;
    await db.settings.put({ ...settings, activeSessionId: session.finishedAt ? undefined : session.id });
  });
  sessionWriteQueue = sessionWriteQueue.then(commit, commit);
  await sessionWriteQueue;
}

export async function getActiveSession(db: GymDatabase = gymDb): Promise<WorkoutSession | undefined> {
  const settings = await db.settings.get("app");
  return settings?.activeSessionId ? db.sessions.get(settings.activeSessionId) : undefined;
}

export async function listFoods(db: GymDatabase = gymDb): Promise<FoodItem[]> {
  return db.foods.orderBy("updatedAt").reverse().toArray();
}

export async function saveFood(food: FoodItem, db: GymDatabase = gymDb): Promise<void> {
  await db.foods.put(food);
}

export async function listMealsForDate(date: string, db: GymDatabase = gymDb): Promise<MealEntry[]> {
  return db.meals.where("date").equals(date).toArray();
}

export async function listMeals(db: GymDatabase = gymDb): Promise<MealEntry[]> {
  return db.meals.orderBy("createdAt").reverse().toArray();
}

export async function saveMeal(entry: MealEntry, db: GymDatabase = gymDb): Promise<void> {
  await db.meals.put(entry);
}

export async function deleteMeal(id: string, db: GymDatabase = gymDb): Promise<void> {
  await db.meals.delete(id);
}

export async function listBodyMetrics(db: GymDatabase = gymDb): Promise<BodyMetric[]> {
  return db.bodyMetrics.orderBy("date").toArray();
}

export async function saveBodyMetric(metric: BodyMetric, db: GymDatabase = gymDb): Promise<void> {
  await db.bodyMetrics.put(metric);
}

export async function getSettings(db: GymDatabase = gymDb): Promise<AppSettings> {
  return (await db.settings.get("app")) ?? defaultSettings;
}

export async function saveSettings(settings: AppSettings, db: GymDatabase = gymDb): Promise<void> {
  await db.settings.put(settings);
}

export async function getNutritionPackRecord(db: GymDatabase = gymDb): Promise<NutritionPackRecord> {
  return (await db.nutritionPacks.get("nutrition-pack")) ?? {
    id: "nutrition-pack",
    status: "not_installed",
    bytesDownloaded: 0
  };
}

export async function saveNutritionPackRecord(record: NutritionPackRecord, db: GymDatabase = gymDb): Promise<void> {
  await db.nutritionPacks.put(record);
}

export async function exportAllData(db: GymDatabase = gymDb): Promise<BackupPayload["data"]> {
  await sessionWriteQueue;
  const [profile, routines, sessions, foods, meals, bodyMetrics, customVariants, settings] = await Promise.all([
    getProfile(db),
    db.routines.toArray(),
    db.sessions.toArray(),
    db.foods.toArray(),
    db.meals.toArray(),
    db.bodyMetrics.toArray(),
    db.customVariants.toArray(),
    db.settings.get("app")
  ]);
  return {
    profile,
    routines,
    sessions,
    foods,
    meals,
    bodyMetrics,
    customVariants,
    settings: settings ?? defaultSettings
  };
}

export async function replaceAllData(data: Awaited<ReturnType<typeof exportAllData>>, db: GymDatabase = gymDb): Promise<void> {
  await sessionWriteQueue;
  const userTables = [db.profiles, db.routines, db.sessions, db.foods, db.meals, db.bodyMetrics, db.customVariants, db.settings];
  await db.transaction("rw", userTables, async () => {
    for (const table of userTables) await table.clear();
    if (data.profile) await db.profiles.put(data.profile);
    await Promise.all([
      db.routines.bulkPut(data.routines),
      db.sessions.bulkPut(data.sessions),
      db.foods.bulkPut(data.foods),
      db.meals.bulkPut(data.meals),
      db.bodyMetrics.bulkPut(data.bodyMetrics),
      db.customVariants.bulkPut(data.customVariants),
      db.settings.put(data.settings)
    ]);
  });
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return undefined;
  return navigator.storage.estimate();
}
