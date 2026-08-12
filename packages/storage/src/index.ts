import Dexie, { type EntityTable } from "dexie";
import {
  APP_VERSIONS,
  type AppSettings,
  type BodyMetric,
  type ExerciseVariant,
  type FoodPreference,
  type FoodItem,
  type MealEntry,
  type NutritionPackRecord,
  type PersonalDataSnapshot,
  type Profile,
  type Program,
  type Recipe,
  type RecoveryPoint,
  type Routine,
  type WaterEntry,
  type WorkoutSession
} from "@gym/contracts";

export * from "./nutrition-pack-client";

function assertFiniteRecord(value: unknown, path = "record"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite numbers`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteRecord(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertFiniteRecord(item, `${path}.${key}`));
  }
}

export class GymDatabase extends Dexie {
  profiles!: EntityTable<Profile, "id">;
  routines!: EntityTable<Routine, "id">;
  programs!: EntityTable<Program, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;
  foods!: EntityTable<FoodItem, "id">;
  meals!: EntityTable<MealEntry, "id">;
  recipes!: EntityTable<Recipe, "id">;
  waterEntries!: EntityTable<WaterEntry, "id">;
  foodPreferences!: EntityTable<FoodPreference, "id">;
  bodyMetrics!: EntityTable<BodyMetric, "id">;
  customVariants!: EntityTable<ExerciseVariant, "id">;
  settings!: EntityTable<AppSettings, "id">;
  nutritionPacks!: EntityTable<NutritionPackRecord, "id">;
  recoveryPoints!: EntityTable<RecoveryPoint, "id">;

  constructor(name = "gym-local", migrationHooks: { beforeV3Commit?: () => void | Promise<void> } = {}) {
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
    this.version(3).stores({
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
    }).upgrade(async (transaction) => {
      const settingsTable = transaction.table<AppSettings>("settings");
      const profilesTable = transaction.table<Profile>("profiles");
      const packTable = transaction.table<NutritionPackRecord>("nutritionPacks");
      const settings = await settingsTable.get("app");
      if (settings) {
        await settingsTable.put({
          ...settings,
          dbSchemaVersion: 3,
          backupVersion: 3
        });
      }
      await profilesTable.toCollection().modify((profile) => {
        const target = profile.nutritionTarget;
        if (!target || target.source) return;
        const hasBasis = (profile.biologicalSex === "female" || profile.biologicalSex === "male")
          && Boolean(profile.age && profile.heightCm && profile.weightKg && profile.activityFactor);
        profile.nutritionTarget = {
          ...target,
          source: hasBasis ? "estimated" : "legacy",
          basis: hasBasis ? {
            biologicalSex: profile.biologicalSex as "female" | "male",
            age: profile.age!,
            heightCm: profile.heightCm!,
            weightKg: profile.weightKg!,
            activityFactor: profile.activityFactor!,
            goal: profile.goal
          } : undefined,
          calculatedAt: profile.updatedAt
        };
      });
      const pack = await packTable.get("nutrition-pack");
      if (pack?.status === "ready" && pack.version && pack.installedAt && !pack.active) {
        await packTable.put({
          ...pack,
          active: {
            version: pack.version,
            fileName: "/gym-local-nutrition.sqlite3",
            checksum: pack.checksum ?? "legacy-unverified",
            installedAt: pack.installedAt,
            foodCount: pack.foodCount,
            aliasCount: pack.aliasCount,
            vietnameseRecipeCount: pack.vietnameseRecipeCount
          }
        });
      } else if (pack && (pack.status === "downloading" || pack.status === "installing") && !pack.operation) {
        await packTable.put({
          ...pack,
          status: "error",
          error: pack.error ?? "Previous nutrition pack operation was interrupted",
          operation: {
            id: `pack_operation_${Date.now()}`,
            kind: pack.active ? "update" : "install",
            status: "failed",
            bytesDownloaded: pack.bytesDownloaded,
            totalBytes: pack.totalBytes,
            startedAt: settings?.storagePersistenceRequestedAt ?? new Date(0).toISOString(),
            errorCode: "interrupted_by_upgrade"
          }
        });
      }
      await migrationHooks.beforeV3Commit?.();
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
  if (!settings) {
    await db.settings.put(defaultSettings);
    return;
  }
  if (
    settings.catalogVersion !== APP_VERSIONS.catalog
    || settings.routineTemplateVersion !== APP_VERSIONS.routines
    || settings.nutritionFormulaVersion !== APP_VERSIONS.nutritionFormula
    || settings.backupVersion !== APP_VERSIONS.backup
    || settings.dbSchemaVersion !== APP_VERSIONS.database
  ) {
    await db.settings.put({
      ...settings,
      catalogVersion: APP_VERSIONS.catalog,
      routineTemplateVersion: APP_VERSIONS.routines,
      nutritionFormulaVersion: APP_VERSIONS.nutritionFormula,
      dbSchemaVersion: APP_VERSIONS.database,
      backupVersion: APP_VERSIONS.backup
    });
  }
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
  assertFiniteRecord(profile, "profile");
  await db.profiles.put({ ...profile, updatedAt: new Date().toISOString() });
}

export async function listRoutines(db: GymDatabase = gymDb): Promise<Routine[]> {
  return db.routines.orderBy("updatedAt").reverse().toArray();
}

export async function saveRoutine(routine: Routine, db: GymDatabase = gymDb): Promise<void> {
  assertFiniteRecord(routine, "routine");
  await db.routines.put({ ...routine, updatedAt: new Date().toISOString() });
}

export async function saveInitialSetup(profile: Profile, routines: Routine[], db: GymDatabase = gymDb): Promise<void> {
  assertFiniteRecord(profile, "profile");
  assertFiniteRecord(routines, "routines");
  await db.transaction("rw", db.profiles, db.routines, async () => {
    await db.profiles.put({ ...profile, updatedAt: new Date().toISOString() });
    if (routines.length) {
      await db.routines.bulkPut(routines.map((routine) => ({
        ...routine,
        updatedAt: new Date().toISOString()
      })));
    }
  });
}

export async function deleteRoutine(id: string, db: GymDatabase = gymDb): Promise<void> {
  await db.routines.delete(id);
}

export async function listSessions(db: GymDatabase = gymDb): Promise<WorkoutSession[]> {
  return db.sessions.orderBy("startedAt").reverse().toArray();
}

export async function saveSession(session: WorkoutSession, db: GymDatabase = gymDb): Promise<void> {
  assertFiniteRecord(session, "session");
  const commit = () => db.transaction("rw", db.sessions, db.settings, async () => {
    await db.sessions.put(session);
    const settings = (await db.settings.get("app")) ?? defaultSettings;
    await db.settings.put({ ...settings, activeSessionId: session.finishedAt ? undefined : session.id });
  });
  const operation = sessionWriteQueue.then(commit, commit);
  sessionWriteQueue = operation.then(() => undefined, () => undefined);
  await operation;
}

export async function getActiveSession(db: GymDatabase = gymDb): Promise<WorkoutSession | undefined> {
  const settings = await db.settings.get("app");
  return settings?.activeSessionId ? db.sessions.get(settings.activeSessionId) : undefined;
}

export async function listFoods(db: GymDatabase = gymDb): Promise<FoodItem[]> {
  return db.foods.orderBy("updatedAt").reverse().toArray();
}

export async function saveFood(food: FoodItem, db: GymDatabase = gymDb): Promise<void> {
  assertFiniteRecord(food, "food");
  await db.foods.put(food);
}

export async function listMealsForDate(date: string, db: GymDatabase = gymDb): Promise<MealEntry[]> {
  return db.meals.where("date").equals(date).toArray();
}

export async function listMeals(db: GymDatabase = gymDb): Promise<MealEntry[]> {
  return db.meals.orderBy("createdAt").reverse().toArray();
}

export async function saveMeal(entry: MealEntry, db: GymDatabase = gymDb): Promise<void> {
  assertFiniteRecord(entry, "meal");
  await db.meals.put(entry);
}

export async function deleteMeal(id: string, db: GymDatabase = gymDb): Promise<void> {
  await db.meals.delete(id);
}

export async function listBodyMetrics(db: GymDatabase = gymDb): Promise<BodyMetric[]> {
  return db.bodyMetrics.orderBy("date").toArray();
}

export async function saveBodyMetric(metric: BodyMetric, db: GymDatabase = gymDb): Promise<void> {
  assertFiniteRecord(metric, "body metric");
  await db.bodyMetrics.put(metric);
}

export async function getSettings(db: GymDatabase = gymDb): Promise<AppSettings> {
  return (await db.settings.get("app")) ?? defaultSettings;
}

export async function saveSettings(settings: AppSettings, db: GymDatabase = gymDb): Promise<void> {
  assertFiniteRecord(settings, "settings");
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
  assertFiniteRecord(record, "nutrition pack record");
  await db.nutritionPacks.put(record);
}

const personalTableNames = [
  "profiles",
  "routines",
  "programs",
  "sessions",
  "foods",
  "meals",
  "recipes",
  "waterEntries",
  "foodPreferences",
  "bodyMetrics",
  "customVariants",
  "settings"
] as const;

function personalTables(db: GymDatabase) {
  return personalTableNames.map((name) => db.table(name));
}

async function readSnapshotInCurrentTransaction(db: GymDatabase): Promise<PersonalDataSnapshot> {
  const [profile, routines, programs, sessions, foods, meals, recipes, waterEntries, foodPreferences, bodyMetrics, customVariants, settings] = await Promise.all([
    db.profiles.toCollection().first(),
    db.routines.toArray(),
    db.programs.toArray(),
    db.sessions.toArray(),
    db.foods.toArray(),
    db.meals.toArray(),
    db.recipes.toArray(),
    db.waterEntries.toArray(),
    db.foodPreferences.toArray(),
    db.bodyMetrics.toArray(),
    db.customVariants.toArray(),
    db.settings.get("app")
  ]);
  return {
    profile,
    routines,
    programs,
    sessions,
    foods,
    meals,
    recipes,
    waterEntries,
    foodPreferences,
    bodyMetrics,
    customVariants,
    settings: settings ?? defaultSettings
  };
}

async function putSnapshotInCurrentTransaction(data: PersonalDataSnapshot, db: GymDatabase): Promise<void> {
  for (const table of personalTables(db)) await table.clear();
  if (data.profile) await db.profiles.put(data.profile);
  await db.routines.bulkPut(data.routines);
  await db.programs.bulkPut(data.programs);
  await db.sessions.bulkPut(data.sessions);
  await db.foods.bulkPut(data.foods);
  await db.meals.bulkPut(data.meals);
  await db.recipes.bulkPut(data.recipes);
  await db.waterEntries.bulkPut(data.waterEntries);
  await db.foodPreferences.bulkPut(data.foodPreferences);
  await db.bodyMetrics.bulkPut(data.bodyMetrics);
  await db.customVariants.bulkPut(data.customVariants);
  await db.settings.put(data.settings);
}

export async function exportAllData(db: GymDatabase = gymDb): Promise<PersonalDataSnapshot> {
  await sessionWriteQueue;
  return db.transaction("r", personalTables(db), () => readSnapshotInCurrentTransaction(db));
}

export async function replaceAllData(data: PersonalDataSnapshot, db: GymDatabase = gymDb): Promise<void> {
  await sessionWriteQueue;
  assertFiniteRecord(data, "restore data");
  const tables = [...personalTables(db), db.recoveryPoints];
  await db.transaction("rw", tables, async () => {
    const currentSettings = await db.settings.get("app");
    const activeSession = currentSettings?.activeSessionId ? await db.sessions.get(currentSettings.activeSessionId) : undefined;
    if (activeSession && !activeSession.finishedAt) throw new Error("Finish the active workout before restoring a backup");
    const current = await readSnapshotInCurrentTransaction(db);
    const newestRecovery = await db.recoveryPoints.orderBy("createdAt").last();
    const newestCreatedAt = newestRecovery ? Date.parse(newestRecovery.createdAt) : Number.NaN;
    const createdAt = new Date(Math.max(Date.now(), Number.isFinite(newestCreatedAt) ? newestCreatedAt + 1 : 0)).toISOString();
    const recoveryPoint: RecoveryPoint = {
      id: `recovery_${crypto.randomUUID()}`,
      reason: "before_restore",
      createdAt,
      snapshot: current
    };
    await db.recoveryPoints.put(recoveryPoint);
    const obsolete = await db.recoveryPoints.orderBy("createdAt").reverse().offset(2).toArray();
    if (obsolete.length) await db.recoveryPoints.bulkDelete(obsolete.map((point) => point.id));
    await putSnapshotInCurrentTransaction(data, db);
  });
}

export async function listRecoveryPoints(db: GymDatabase = gymDb): Promise<RecoveryPoint[]> {
  return db.recoveryPoints.orderBy("createdAt").reverse().toArray();
}

export async function undoLatestRestore(db: GymDatabase = gymDb): Promise<boolean> {
  await sessionWriteQueue;
  const tables = [...personalTables(db), db.recoveryPoints];
  return db.transaction("rw", tables, async () => {
    const currentSettings = await db.settings.get("app");
    const activeSession = currentSettings?.activeSessionId ? await db.sessions.get(currentSettings.activeSessionId) : undefined;
    if (activeSession && !activeSession.finishedAt) throw new Error("Finish the active workout before undoing a restore");
    const latest = await db.recoveryPoints.orderBy("createdAt").last();
    if (!latest) return false;
    await putSnapshotInCurrentTransaction(latest.snapshot, db);
    await db.recoveryPoints.delete(latest.id);
    return true;
  });
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return undefined;
  return navigator.storage.estimate();
}
