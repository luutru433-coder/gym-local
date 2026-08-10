import JSZip from "jszip";
import { APP_VERSIONS, type BackupPayload } from "@gym/contracts";
import { z } from "zod";

const manifestSchema = z.object({
  appVersion: z.string().min(1),
  backupVersion: z.number().int().positive(),
  exportedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid export date"),
  checksum: z.string().regex(/^[a-f0-9]{64}$/).optional()
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
  sets: z.array(setLogSchema),
  restSeconds: nonNegativeNumber,
  note: z.string().optional()
}).passthrough();

const sessionSchema = z.object({
  id: idSchema,
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
  confirmedAt: timestampSchema.optional()
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
  storagePersistenceRequestedAt: timestampSchema.optional(),
  storagePersistenceGranted: z.boolean().optional()
}).passthrough();

const backupDataSchema = z.object({
  profile: profileSchema.optional(),
  routines: z.array(routineSchema),
  sessions: z.array(sessionSchema),
  foods: z.array(foodSchema),
  meals: z.array(mealSchema),
  bodyMetrics: z.array(bodyMetricSchema),
  customVariants: z.array(customVariantSchema),
  settings: settingsSchema
}).passthrough();

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createBackup(data: BackupPayload["data"]): Promise<Blob> {
  const serialized = JSON.stringify(data);
  const payload: BackupPayload = {
    manifest: {
      appVersion: APP_VERSIONS.app,
      backupVersion: APP_VERSIONS.backup,
      exportedAt: new Date().toISOString(),
      checksum: await sha256(serialized)
    },
    data
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
  if (manifest.backupVersion < Math.max(1, APP_VERSIONS.backup - 2)) throw new Error("Backup version is no longer supported");
  const serialized = await dataFile.async("text");
  if (serialized.length > 20 * 1024 * 1024) throw new Error("Backup data is too large");
  if (manifest.checksum && (await sha256(serialized)) !== manifest.checksum) throw new Error("Backup checksum does not match");
  const parsed = backupDataSchema.parse(JSON.parse(serialized));
  const data = {
    ...parsed,
    customVariants: parsed.customVariants.map((variant) => ({ ...variant, videoGuides: variant.videoGuides ?? [] })),
    settings: {
      ...parsed.settings,
      dbSchemaVersion: APP_VERSIONS.database,
      backupVersion: APP_VERSIONS.backup
    }
  } as unknown as BackupPayload["data"];
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
