import JSZip from "jszip";
import { APP_VERSIONS, FOOD_GROUP_IDS, type BackupPayload } from "@gym/contracts";
import { z } from "zod";

const manifestSchema = z.object({
  appVersion: z.string().min(1),
  backupVersion: z.number().int().positive(),
  exportedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid export date"),
  checksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  format: z.literal("gym-local-backup").optional(),
  dbSchemaVersion: z.number().int().positive().optional(),
  dataBytes: z.number().int().nonnegative().optional(),
  counts: z.record(z.string(), z.number().int().nonnegative()).optional()
});

const idSchema = z.string().min(1);
const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.nonnegative();
const localizedTextSchema = z.object({ vi: z.string(), en: z.string() }).passthrough();
const goalSchema = z.enum(["hypertrophy", "strength", "fat_loss", "general"]);
const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);
const equipmentSchema = z.enum(["bodyweight", "dumbbell", "barbell", "smith", "cable", "machine", "resistance_band", "kettlebell", "trap_bar", "bench", "pullup_bar"]);
const loadModeSchema = z.enum(["total_weight", "per_hand", "per_side", "bodyweight_plus", "assisted", "reps_only", "duration_distance"]);
const setTypeSchema = z.enum(["warmup", "working", "drop", "failure"]);
const trackingProfileSchema = z.object({
  variantId: idSchema,
  effortKind: z.enum(["reps", "duration", "distance_duration"]),
  loadEntryMode: loadModeSchema,
  laterality: z.enum(["bilateral", "unilateral", "ambiguous", "not_applicable"]),
  volumeMetric: z.enum(["external_load", "added_load", "none"]),
  volumeMultiplier: z.union([z.literal(1), z.literal(2)]).optional(),
  e1rmMetric: z.enum(["entered_load", "none"]),
  progressDirection: z.enum(["higher_load", "lower_assistance", "higher_reps", "longer_duration", "greater_distance"])
}).passthrough();
const optionalNutrient = nonNegativeNumber.nullable().optional();
const nutrientSchema = z.object({
  calories: nonNegativeNumber,
  protein: nonNegativeNumber,
  carbs: nonNegativeNumber,
  fat: nonNegativeNumber,
  fiber: optionalNutrient,
  sugar: optionalNutrient,
  sodiumMg: optionalNutrient,
  calciumMg: optionalNutrient,
  ironMg: optionalNutrient,
  potassiumMg: optionalNutrient,
  magnesiumMg: optionalNutrient,
  zincMg: optionalNutrient,
  vitaminAMcg: optionalNutrient,
  vitaminCMg: optionalNutrient,
  vitaminDMcg: optionalNutrient,
  vitaminEMg: optionalNutrient,
  vitaminKMcg: optionalNutrient,
  vitaminB6Mg: optionalNutrient,
  vitaminB12Mcg: optionalNutrient,
  folateMcg: optionalNutrient
}).passthrough();

const setLogSchema = z.object({
  id: idSchema,
  type: setTypeSchema,
  targetMinReps: z.number().int().nonnegative().optional(),
  targetMaxReps: z.number().int().nonnegative().optional(),
  targetDurationSeconds: nonNegativeNumber.optional(),
  targetRir: finiteNumber.optional(),
  weightKg: nonNegativeNumber.optional(),
  reps: z.number().int().nonnegative().optional(),
  durationSeconds: nonNegativeNumber.optional(),
  distanceMeters: nonNegativeNumber.optional(),
  rir: finiteNumber.optional(),
  rpe: finiteNumber.optional(),
  completedAt: timestampSchema.optional()
}).passthrough();

const sessionExerciseSchema = z.object({
  id: idSchema,
  movementId: idSchema,
  movementNameSnapshot: localizedTextSchema,
  variantId: idSchema,
  variantNameSnapshot: localizedTextSchema,
  loadEntryModeSnapshot: loadModeSchema,
  trackingProfileSnapshot: trackingProfileSchema.optional(),
  sets: z.array(setLogSchema),
  restSeconds: nonNegativeNumber,
  note: z.string().optional()
}).passthrough();

const sessionSchema = z.object({
  id: idSchema,
  programId: idSchema.optional(),
  routineId: idSchema.optional(),
  routineNameSnapshot: localizedTextSchema.optional(),
  locationId: idSchema.optional(),
  startedAt: timestampSchema,
  finishedAt: timestampSchema.optional(),
  activeExerciseId: idSchema.optional(),
  restTimerEndsAt: timestampSchema.optional(),
  exercises: z.array(sessionExerciseSchema),
  notes: z.string().optional()
}).passthrough();

const routineTargetSchema = z.object({
  id: idSchema,
  type: setTypeSchema,
  minReps: z.number().int().nonnegative().optional(),
  maxReps: z.number().int().nonnegative().optional(),
  durationSeconds: nonNegativeNumber.optional(),
  targetRir: finiteNumber.optional()
}).passthrough();

const routineItemSchema = z.object({
  id: idSchema,
  movementId: idSchema,
  preferredVariantId: idSchema,
  sets: z.array(routineTargetSchema),
  restSeconds: nonNegativeNumber,
  note: z.string().optional(),
  supersetGroup: z.string().optional()
}).passthrough();

const routineSchema = z.object({
  id: idSchema,
  name: localizedTextSchema,
  goal: goalSchema,
  difficulty: difficultySchema,
  daysPerWeek: z.number().int().min(1).max(7),
  templateVersion: z.number().int().positive(),
  sourceTemplateId: idSchema.optional(),
  items: z.array(routineItemSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).passthrough();

const progressionRuleSchema = z.object({
  type: z.literal("double_progression"),
  successSessions: z.number().int().positive(),
  defaultIncrementKg: nonNegativeNumber,
  fallbackIncreasePercent: nonNegativeNumber
}).passthrough();

const programSchema = z.object({
  id: idSchema,
  name: localizedTextSchema,
  goal: goalSchema,
  difficulty: difficultySchema,
  days: z.array(z.object({ order: z.number().int().nonnegative(), routineId: idSchema }).passthrough()),
  activeDayIndex: z.number().int().nonnegative(),
  progressionRule: progressionRuleSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).passthrough();

const foodSchema = z.object({
  id: idSchema,
  name: localizedTextSchema,
  brand: z.string().optional(),
  barcode: z.string().optional(),
  servingLabel: z.string().optional(),
  servingGrams: nonNegativeNumber.optional(),
  aliases: z.array(z.string()).optional(),
  per100g: nutrientSchema,
  source: z.enum(["custom", "open_food_facts", "usda_fdc", "vietnamese_recipe"]),
  sourceFoodId: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  dataQuality: z.enum(["complete", "partial", "estimated_recipe"]).optional(),
  updatedAt: timestampSchema
}).passthrough();

const mealSchema = z.object({
  id: idSchema,
  date: dateSchema,
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  foodId: idSchema,
  foodNameSnapshot: localizedTextSchema,
  grams: nonNegativeNumber,
  nutrientsSnapshot: nutrientSchema,
  createdAt: timestampSchema
}).passthrough();

const recipeIngredientSchema = z.object({
  id: idSchema,
  foodId: idSchema,
  foodNameSnapshot: localizedTextSchema,
  grams: nonNegativeNumber,
  nutrientsPer100gSnapshot: nutrientSchema
}).passthrough();

const recipeSchema = z.object({
  id: idSchema,
  name: localizedTextSchema,
  ingredients: z.array(recipeIngredientSchema),
  yieldGrams: nonNegativeNumber,
  servings: nonNegativeNumber.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).passthrough();

const waterEntrySchema = z.object({
  id: idSchema,
  date: dateSchema,
  amountMl: nonNegativeNumber,
  createdAt: timestampSchema
}).passthrough();

const foodPreferenceSchema = z.object({
  id: idSchema,
  foodId: idSchema,
  favorite: z.boolean(),
  defaultServingGrams: nonNegativeNumber.optional(),
  lastUsedAt: timestampSchema.optional(),
  useCount: z.number().int().nonnegative()
}).passthrough();

const foodGroupSchema = z.enum(FOOD_GROUP_IDS);
const pantryBaseSchema = z.object({
  id: idSchema,
  availableGrams: finiteNumber.positive().max(1_000_000).optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});
const pantryItemSchema = z.discriminatedUnion("kind", [
  pantryBaseSchema.extend({
    kind: z.literal("food"),
    foodId: idSchema,
    foodNameSnapshot: localizedTextSchema,
    groupId: foodGroupSchema.optional()
  }),
  pantryBaseSchema.extend({
    kind: z.literal("group"),
    groupId: foodGroupSchema,
    groupNameSnapshot: localizedTextSchema
  })
]);

const bodyMetricSchema = z.object({
  id: idSchema,
  date: dateSchema,
  weightKg: nonNegativeNumber.optional(),
  waistCm: nonNegativeNumber.optional(),
  chestCm: nonNegativeNumber.optional(),
  hipsCm: nonNegativeNumber.optional(),
  armCm: nonNegativeNumber.optional(),
  thighCm: nonNegativeNumber.optional()
}).passthrough();

const mediaSchema = z.object({
  id: idSchema,
  type: z.enum(["image", "video", "youtube", "model3d"]),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  sourceId: idSchema,
  title: localizedTextSchema,
  onlineOnly: z.boolean(),
  reviewStatus: z.enum(["draft", "reviewed", "deprecated"])
}).passthrough();

const videoGuideSchema = z.object({
  id: idSchema,
  variantId: idSchema,
  provider: z.literal("youtube"),
  demonstrationType: z.enum(["human", "3d"]),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  watchUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  sourceId: idSchema,
  title: localizedTextSchema,
  creator: z.string().min(1),
  onlineOnly: z.literal(true),
  reviewStatus: z.enum(["draft", "reviewed", "deprecated"]),
  reviewMethod: z.literal("title-and-equipment-match"),
  reviewedAt: dateSchema,
  lastVerifiedAt: dateSchema
}).passthrough();

const customVariantSchema = z.object({
  id: idSchema,
  movementId: idSchema,
  name: localizedTextSchema,
  equipment: z.array(equipmentSchema),
  difficulty: difficultySchema,
  loadEntryMode: loadModeSchema,
  instructions: z.array(localizedTextSchema),
  cues: z.array(localizedTextSchema),
  commonMistakes: z.array(localizedTextSchema),
  safety: z.array(localizedTextSchema),
  media: z.array(mediaSchema),
  videoGuides: z.array(videoGuideSchema).optional(),
  sourceIds: z.array(idSchema),
  reviewStatus: z.enum(["draft", "reviewed", "deprecated"]),
  contentVersion: z.number().int().positive(),
  deprecatedAt: timestampSchema.optional(),
  supersededBy: idSchema.optional()
}).passthrough();

const nutritionTargetSchema = z.object({
  calories: nonNegativeNumber,
  protein: nonNegativeNumber,
  carbs: nonNegativeNumber,
  fat: nonNegativeNumber,
  waterMl: nonNegativeNumber,
  formulaVersion: z.number().int().positive(),
  confirmedAt: timestampSchema.optional(),
  source: z.enum(["estimated", "manual", "legacy"]).optional(),
  basis: z.object({
    biologicalSex: z.enum(["female", "male"]),
    age: z.number().int().positive(),
    heightCm: nonNegativeNumber,
    weightKg: nonNegativeNumber,
    activityFactor: z.union([z.literal(1.2), z.literal(1.375), z.literal(1.55), z.literal(1.725), z.literal(1.9)]),
    goal: goalSchema
  }).passthrough().optional(),
  calculatedAt: timestampSchema.optional()
}).passthrough();

const profileSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  locale: z.enum(["vi", "en"]),
  units: z.enum(["metric", "imperial"]),
  goal: goalSchema,
  experience: difficultySchema,
  daysPerWeek: z.number().int().min(1).max(7),
  age: z.number().int().positive().optional(),
  biologicalSex: z.enum(["female", "male", "unspecified"]).optional(),
  heightCm: nonNegativeNumber.optional(),
  weightKg: nonNegativeNumber.optional(),
  activityFactor: z.union([z.literal(1.2), z.literal(1.375), z.literal(1.55), z.literal(1.725), z.literal(1.9)]).optional(),
  nutritionTarget: nutritionTargetSchema.optional(),
  locations: z.array(z.object({ id: idSchema, name: z.string(), equipment: z.array(equipmentSchema) }).passthrough()),
  activeLocationId: idSchema.optional(),
  onboardingComplete: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).passthrough();

const settingsSchema = z.object({
  id: z.literal("app"),
  catalogVersion: z.number().int().positive(),
  dbSchemaVersion: z.number().int().positive(),
  routineTemplateVersion: z.number().int().positive(),
  nutritionFormulaVersion: z.number().int().positive(),
  backupVersion: z.number().int().positive(),
  lastBackupAt: timestampSchema.optional(),
  activeSessionId: idSchema.optional(),
  activeProgramId: idSchema.optional(),
  storagePersistenceRequestedAt: timestampSchema.optional(),
  storagePersistenceGranted: z.boolean().optional()
}).passthrough();

const legacyBackupDataSchema = z.object({
  profile: profileSchema.optional(),
  routines: z.array(routineSchema),
  sessions: z.array(sessionSchema),
  foods: z.array(foodSchema),
  meals: z.array(mealSchema),
  bodyMetrics: z.array(bodyMetricSchema),
  customVariants: z.array(customVariantSchema),
  settings: settingsSchema
}).passthrough();

const backupV3DataSchema = legacyBackupDataSchema.extend({
  programs: z.array(programSchema),
  recipes: z.array(recipeSchema),
  waterEntries: z.array(waterEntrySchema),
  foodPreferences: z.array(foodPreferenceSchema)
});
const backupDataSchema = backupV3DataSchema.extend({
  pantryItems: z.array(pantryItemSchema)
});

const v3CollectionKeys = ["routines", "programs", "sessions", "foods", "meals", "recipes", "waterEntries", "foodPreferences", "bodyMetrics", "customVariants"] as const;
const collectionKeys = [...v3CollectionKeys, "pantryItems"] as const;
type LegacyBackupData = z.infer<typeof legacyBackupDataSchema>;
type BackupV3Data = z.infer<typeof backupV3DataSchema>;

function validateBackupRelations(data: Pick<BackupPayload["data"], "sessions" | "programs" | "settings">): void {
  const sessionIds = new Set(data.sessions.map((session) => session.id));
  if (data.settings.activeSessionId) {
    const active = data.sessions.find((session) => session.id === data.settings.activeSessionId);
    if (!sessionIds.has(data.settings.activeSessionId) || active?.finishedAt) {
      throw new Error("Backup active workout pointer is invalid");
    }
  }
  if (data.settings.activeProgramId && !data.programs.some((program) => program.id === data.settings.activeProgramId)) {
    throw new Error("Backup active program pointer is invalid");
  }
}

function validateBackupData(data: unknown): BackupPayload["data"] {
  const parsed = backupDataSchema.parse(data);
  validateBackupRelations(parsed);
  return parsed as unknown as BackupPayload["data"];
}

function backupCounts(
  data: BackupPayload["data"],
  keys: readonly typeof collectionKeys[number][] = collectionKeys
): NonNullable<BackupPayload["manifest"]["counts"]> {
  return Object.fromEntries(keys.map((key) => [key, data[key].length])) as NonNullable<BackupPayload["manifest"]["counts"]>;
}

function migrateV1ToV2(raw: unknown): LegacyBackupData {
  const legacy = legacyBackupDataSchema.parse(raw);
  return {
    ...legacy,
    customVariants: legacy.customVariants.map((variant) => ({
      ...variant,
      videoGuides: variant.videoGuides ?? []
    }))
  };
}

function migrateNutritionTargetMetadata(profile: LegacyBackupData["profile"]): LegacyBackupData["profile"] {
  const target = profile?.nutritionTarget;
  if (!profile || !target || target.source) return profile;
  const hasBasis = (profile.biologicalSex === "female" || profile.biologicalSex === "male")
    && profile.age !== undefined
    && profile.heightCm !== undefined
    && profile.weightKg !== undefined
    && profile.activityFactor !== undefined;
  return {
    ...profile,
    nutritionTarget: {
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
    }
  };
}

function migrateV2ToV3(raw: unknown): BackupV3Data {
  const legacy = legacyBackupDataSchema.parse(raw);
  const profile = migrateNutritionTargetMetadata(legacy.profile);
  return backupV3DataSchema.parse({
    ...legacy,
    profile,
    programs: [],
    recipes: [],
    waterEntries: [],
    foodPreferences: []
  });
}

function migrateV3ToV4(raw: unknown): BackupPayload["data"] {
  const previous = backupV3DataSchema.parse(raw);
  return validateBackupData({ ...previous, pantryItems: [] });
}

function validateDetailedManifest(
  manifest: BackupPayload["manifest"],
  data: BackupPayload["data"],
  serializedBytes: number,
  version: 3 | 4
): void {
  if (manifest.format !== "gym-local-backup") throw new Error(`Backup v${version} format identifier is missing`);
  if (manifest.dbSchemaVersion !== version) throw new Error("Backup database schema metadata is invalid");
  if (manifest.dataBytes !== serializedBytes) throw new Error("Backup data byte count does not match");
  const keys = version === 3 ? v3CollectionKeys : collectionKeys;
  const allowedKeys = new Set<string>(keys);
  const expected = backupCounts(data, keys);
  const countKeys = manifest.counts ? Object.keys(manifest.counts) : [];
  if (
    !manifest.counts
    || countKeys.length !== keys.length
    || countKeys.some((key) => !allowedKeys.has(key))
    || keys.some((key) => manifest.counts?.[key] !== expected[key])
  ) {
    throw new Error("Backup collection counts do not match data");
  }
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createBackup(data: BackupPayload["data"]): Promise<Blob> {
  const validated = validateBackupData(data);
  const serialized = JSON.stringify(validated);
  const dataBytes = new TextEncoder().encode(serialized).byteLength;
  const payload: BackupPayload = {
    manifest: {
      appVersion: APP_VERSIONS.app,
      backupVersion: APP_VERSIONS.backup,
      exportedAt: new Date().toISOString(),
      checksum: await sha256(serialized),
      format: "gym-local-backup",
      dbSchemaVersion: APP_VERSIONS.database,
      dataBytes,
      counts: backupCounts(validated)
    },
    data: validated
  };
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(payload.manifest, null, 2));
  zip.file("data.json", serialized);
  zip.file("README.txt", "Gym Local backup. Restore this file from Settings > Backup & Restore.\n");
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function readBackup(file: Blob): Promise<BackupPayload> {
  if (file.size > 50 * 1024 * 1024) throw new Error("Backup file is too large");
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("manifest.json");
  const dataFile = zip.file("data.json");
  if (!manifestFile || !dataFile) throw new Error("Backup is missing required files");
  const manifest = manifestSchema.parse(JSON.parse(await manifestFile.async("text"))) as BackupPayload["manifest"];
  if (manifest.backupVersion > APP_VERSIONS.backup) throw new Error("Backup was created by a newer app version");
  if (manifest.backupVersion < 1) throw new Error("Backup version is no longer supported");
  const serialized = await dataFile.async("text");
  const serializedBytes = new TextEncoder().encode(serialized).byteLength;
  if (serializedBytes > 20 * 1024 * 1024) throw new Error("Backup data is too large");
  if (manifest.checksum && (await sha256(serialized)) !== manifest.checksum) throw new Error("Backup checksum does not match");
  const raw = JSON.parse(serialized);
  let parsed: BackupPayload["data"];
  switch (manifest.backupVersion) {
    case 1:
      parsed = migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(raw)));
      break;
    case 2:
      parsed = migrateV3ToV4(migrateV2ToV3(raw));
      break;
    case 3:
      parsed = migrateV3ToV4(raw);
      break;
    case 4:
      parsed = validateBackupData(raw);
      break;
    default:
      throw new Error("Backup version is not supported");
  }
  const data = {
    ...parsed,
    customVariants: parsed.customVariants.map((variant) => ({ ...variant, videoGuides: variant.videoGuides ?? [] })),
    settings: {
      ...parsed.settings,
      catalogVersion: APP_VERSIONS.catalog,
      dbSchemaVersion: APP_VERSIONS.database,
      routineTemplateVersion: APP_VERSIONS.routines,
      nutritionFormulaVersion: APP_VERSIONS.nutritionFormula,
      backupVersion: APP_VERSIONS.backup
    }
  } satisfies BackupPayload["data"];
  validateBackupRelations(data);
  if (manifest.backupVersion === 3 || manifest.backupVersion === 4) {
    validateDetailedManifest(manifest, data, serializedBytes, manifest.backupVersion);
  }
  return { manifest, data };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function workoutCsv(data: BackupPayload["data"]): string {
  const rows = [["session_id", "date", "movement", "variant", "set_type", "weight_kg", "reps", "rir", "rpe"]];
  data.sessions.forEach((session) => session.exercises.forEach((exercise) => exercise.sets.forEach((set) => {
    rows.push([
      session.id,
      session.finishedAt ?? session.startedAt,
      exercise.movementNameSnapshot.en,
      exercise.variantNameSnapshot.en,
      set.type,
      set.weightKg ?? "",
      set.reps ?? "",
      set.rir ?? "",
      set.rpe ?? ""
    ].map(String));
  })));
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
