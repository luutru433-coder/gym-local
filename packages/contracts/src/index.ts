export type Id = string;

export interface LocalizedText {
  vi: string;
  en: string;
}

export type Goal = "hypertrophy" | "strength" | "fat_loss" | "general";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type ReviewStatus = "draft" | "reviewed" | "deprecated";

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quadriceps"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "forearms"
  | "full_body";

export type EquipmentType =
  | "bodyweight"
  | "dumbbell"
  | "barbell"
  | "smith"
  | "cable"
  | "machine"
  | "resistance_band"
  | "kettlebell"
  | "trap_bar"
  | "bench"
  | "pullup_bar";

export type LoadEntryMode =
  | "total_weight"
  | "per_hand"
  | "per_side"
  | "bodyweight_plus"
  | "assisted"
  | "reps_only"
  | "duration_distance";

export interface ContentSource {
  id: Id;
  label: string;
  sourceUrl?: string;
  sourcePath?: string;
  author: string;
  licenseId: string;
  licenseUrl?: string;
  attribution: string;
  reviewedAt: string;
}

export interface MediaAsset {
  id: Id;
  type: "image" | "video" | "youtube" | "model3d";
  url: string;
  thumbnailUrl?: string;
  sourceId: Id;
  title: LocalizedText;
  onlineOnly: boolean;
  reviewStatus: ReviewStatus;
}

export interface ExerciseVideoGuide {
  id: Id;
  variantId: Id;
  provider: "youtube";
  demonstrationType: "human" | "3d";
  videoId: string;
  watchUrl: string;
  thumbnailUrl: string;
  sourceId: Id;
  title: LocalizedText;
  creator: string;
  onlineOnly: true;
  reviewStatus: ReviewStatus;
  reviewMethod: "title-and-equipment-match";
  reviewedAt: string;
  lastVerifiedAt: string;
}

export interface Movement {
  id: Id;
  name: LocalizedText;
  aliases: string[];
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  pattern: "push" | "pull" | "squat" | "hinge" | "lunge" | "isolation" | "core" | "carry";
  description: LocalizedText;
  reviewStatus: ReviewStatus;
  contentVersion: number;
}

export interface ExerciseVariant {
  id: Id;
  movementId: Id;
  name: LocalizedText;
  equipment: EquipmentType[];
  difficulty: Difficulty;
  loadEntryMode: LoadEntryMode;
  instructions: LocalizedText[];
  cues: LocalizedText[];
  commonMistakes: LocalizedText[];
  safety: LocalizedText[];
  media: MediaAsset[];
  videoGuides: ExerciseVideoGuide[];
  sourceIds: Id[];
  reviewStatus: ReviewStatus;
  contentVersion: number;
  deprecatedAt?: string;
  supersededBy?: Id;
}

export interface TrainingLocation {
  id: Id;
  name: string;
  equipment: EquipmentType[];
}

export type SetType = "warmup" | "working" | "drop" | "failure";

export interface RoutineSetTarget {
  id: Id;
  type: SetType;
  minReps?: number;
  maxReps?: number;
  durationSeconds?: number;
  targetRir?: number;
}

export interface RoutineItem {
  id: Id;
  movementId: Id;
  preferredVariantId: Id;
  sets: RoutineSetTarget[];
  restSeconds: number;
  note?: string;
  supersetGroup?: string;
}

export interface Routine {
  id: Id;
  name: LocalizedText;
  goal: Goal;
  difficulty: Difficulty;
  daysPerWeek: number;
  templateVersion: number;
  sourceTemplateId?: Id;
  items: RoutineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface SetLog {
  id: Id;
  type: SetType;
  targetMinReps?: number;
  targetMaxReps?: number;
  targetDurationSeconds?: number;
  targetRir?: number;
  weightKg?: number;
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  rir?: number;
  rpe?: number;
  completedAt?: string;
}

export interface SessionExercise {
  id: Id;
  movementId: Id;
  movementNameSnapshot: LocalizedText;
  variantId: Id;
  variantNameSnapshot: LocalizedText;
  loadEntryModeSnapshot: LoadEntryMode;
  sets: SetLog[];
  restSeconds: number;
  note?: string;
}

export interface WorkoutSession {
  id: Id;
  routineId?: Id;
  routineNameSnapshot?: LocalizedText;
  locationId?: Id;
  startedAt: string;
  finishedAt?: string;
  activeExerciseId?: Id;
  restTimerEndsAt?: string;
  exercises: SessionExercise[];
  notes?: string;
}

export interface NutrientProfile {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  sodiumMg?: number | null;
  calciumMg?: number | null;
  ironMg?: number | null;
  potassiumMg?: number | null;
  magnesiumMg?: number | null;
  zincMg?: number | null;
  vitaminAMcg?: number | null;
  vitaminCMg?: number | null;
  vitaminDMcg?: number | null;
  vitaminEMg?: number | null;
  vitaminKMcg?: number | null;
  vitaminB6Mg?: number | null;
  vitaminB12Mcg?: number | null;
  folateMcg?: number | null;
}

export type FoodSource = "custom" | "open_food_facts" | "usda_fdc" | "vietnamese_recipe";

export interface FoodItem {
  id: Id;
  name: LocalizedText;
  aliases?: string[];
  brand?: string;
  barcode?: string;
  servingLabel?: string;
  servingGrams?: number;
  per100g: NutrientProfile;
  source: FoodSource;
  sourceFoodId?: string;
  sourceUrl?: string;
  dataQuality?: "complete" | "partial" | "estimated_recipe";
  updatedAt: string;
}

export interface MealEntry {
  id: Id;
  date: string;
  meal: "breakfast" | "lunch" | "dinner" | "snack";
  foodId: Id;
  foodNameSnapshot: LocalizedText;
  grams: number;
  nutrientsSnapshot: NutrientProfile;
  createdAt: string;
}

export interface NutritionPackManifest {
  id: "gym-local-nutrition";
  version: string;
  schemaVersion: number;
  createdAt: string;
  minimumAppVersion: string;
  fileName: string;
  downloadUrl: string;
  sizeBytes: number;
  sha256: string;
  foodCount: number;
  aliasCount: number;
  vietnameseRecipeCount: number;
  sources: Array<{
    id: string;
    label: string;
    url: string;
    licenseId: string;
    licenseUrl: string;
    retrievedAt: string;
  }>;
}

export interface NutritionPackRecord {
  id: "nutrition-pack";
  version?: string;
  status: "not_installed" | "downloading" | "installing" | "ready" | "error";
  bytesDownloaded: number;
  totalBytes?: number;
  installedAt?: string;
  checksum?: string;
  foodCount?: number;
  aliasCount?: number;
  vietnameseRecipeCount?: number;
  error?: string;
}

export interface NutritionTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  formulaVersion: number;
  confirmedAt?: string;
}

export interface BodyMetric {
  id: Id;
  date: string;
  weightKg?: number;
  waistCm?: number;
  chestCm?: number;
  hipsCm?: number;
  armCm?: number;
  thighCm?: number;
}

export interface Profile {
  id: Id;
  displayName: string;
  locale: "vi" | "en";
  units: "metric" | "imperial";
  goal: Goal;
  experience: Difficulty;
  daysPerWeek: number;
  age?: number;
  biologicalSex?: "female" | "male" | "unspecified";
  heightCm?: number;
  weightKg?: number;
  activityFactor?: 1.2 | 1.375 | 1.55 | 1.725 | 1.9;
  nutritionTarget?: NutritionTarget;
  locations: TrainingLocation[];
  activeLocationId?: Id;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: "app";
  catalogVersion: number;
  dbSchemaVersion: number;
  routineTemplateVersion: number;
  nutritionFormulaVersion: number;
  backupVersion: number;
  lastBackupAt?: string;
  activeSessionId?: Id;
  storagePersistenceRequestedAt?: string;
  storagePersistenceGranted?: boolean;
}

export interface BackupPayload {
  manifest: {
    appVersion: string;
    backupVersion: number;
    exportedAt: string;
    checksum?: string;
  };
  data: {
    profile?: Profile;
    routines: Routine[];
    sessions: WorkoutSession[];
    foods: FoodItem[];
    meals: MealEntry[];
    bodyMetrics: BodyMetric[];
    customVariants: ExerciseVariant[];
    settings: AppSettings;
  };
}

export const APP_VERSIONS = {
  app: "0.2.0",
  database: 2,
  catalog: 2,
  routines: 1,
  nutritionFormula: 1,
  backup: 2,
  nutritionPackSchema: 1
} as const;

export function createId(prefix: string): Id {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${id}`;
}
