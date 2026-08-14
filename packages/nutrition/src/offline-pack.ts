import { z } from "zod";
import { APP_VERSIONS, type FoodItem, type NutritionPackManifest } from "@gym/contracts";
import {
  fetchNutritionPackManifest as fetchManifestFromProvider,
  getNutritionPackWorkerInfo,
  installNutritionPackFile,
  removeNutritionPackFiles,
  searchNutritionPackRows,
  type NutritionPackProgressListener,
  type NutritionPackWorkerInfo
} from "@gym/storage";

const manifestSchema = z.object({
  id: z.literal("gym-local-nutrition"),
  version: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  createdAt: z.string().datetime(),
  minimumAppVersion: z.string().min(1),
  fileName: z.string().regex(/\.sqlite3$/),
  downloadUrl: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  foodCount: z.number().int().nonnegative(),
  aliasCount: z.number().int().nonnegative(),
  vietnameseRecipeCount: z.number().int().nonnegative(),
  foodGroupCount: z.number().int().nonnegative().optional(),
  recipeIngredientCount: z.number().int().nonnegative().optional(),
  sources: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: z.string().url(),
    licenseId: z.string().min(1),
    licenseUrl: z.string().url(),
    retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })).min(1)
}).superRefine((manifest, context) => {
  if (manifest.schemaVersion >= 2 && (manifest.foodGroupCount === undefined || manifest.recipeIngredientCount === undefined)) {
    context.addIssue({ code: "custom", message: "Schema 2 nutrition packs require food and recipe relationship counts" });
  }
});

export type NutritionPackInfo = NutritionPackWorkerInfo;

export type NutritionPackCompatibilityCode = "app_too_old" | "unsupported_schema" | "invalid_version";

export class NutritionPackCompatibilityError extends Error {
  constructor(public readonly code: NutritionPackCompatibilityCode, message: string) {
    super(message);
    this.name = "NutritionPackCompatibilityError";
  }
}

export type ProgressListener = NutritionPackProgressListener;

function versionParts(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) throw new NutritionPackCompatibilityError("invalid_version", `Invalid application version: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

export function assertNutritionPackCompatibility(
  manifest: Pick<NutritionPackManifest, "minimumAppVersion" | "schemaVersion">,
  appVersion: string = APP_VERSIONS.app,
  supportedSchemaVersion: number = APP_VERSIONS.nutritionPackSchema,
  minimumSchemaVersion: number = APP_VERSIONS.minimumNutritionPackSchema
): void {
  if (compareVersions(appVersion, manifest.minimumAppVersion) < 0) {
    throw new NutritionPackCompatibilityError(
      "app_too_old",
      `Nutrition pack requires Gym Local ${manifest.minimumAppVersion} or newer`
    );
  }
  if (manifest.schemaVersion < minimumSchemaVersion || manifest.schemaVersion > supportedSchemaVersion) {
    throw new NutritionPackCompatibilityError(
      "unsupported_schema",
      `Nutrition pack schema ${manifest.schemaVersion} is not supported by schema ${supportedSchemaVersion}`
    );
  }
}

export function parseNutritionPackManifest(
  input: unknown,
  sourceUrl: string,
  appVersion: string = APP_VERSIONS.app,
  supportedSchemaVersion: number = APP_VERSIONS.nutritionPackSchema
): NutritionPackManifest {
  const parsed = manifestSchema.parse(input);
  const manifest = { ...parsed, downloadUrl: new URL(parsed.downloadUrl, sourceUrl).href };
  assertNutritionPackCompatibility(manifest, appVersion, supportedSchemaVersion);
  return manifest;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataNumber(metadata: Record<string, string> | undefined, key: string): number {
  const value = Number(metadata?.[key]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function installedManifestFallback(info: NutritionPackInfo): NutritionPackManifest {
  const metadata = info.metadata;
  return {
    id: "gym-local-nutrition",
    version: metadata?.version || "installed",
    schemaVersion: metadataNumber(metadata, "schema_version") || APP_VERSIONS.nutritionPackSchema,
    createdAt: metadata?.created_at || new Date(0).toISOString(),
    minimumAppVersion: "0.0.0",
    fileName: info.activeFileName?.replace(/^\//, "") || "installed-nutrition-pack.sqlite3",
    downloadUrl: "",
    sizeBytes: metadataNumber(metadata, "size_bytes"),
    sha256: metadata?.sha256 || "0".repeat(64),
    foodCount: metadataNumber(metadata, "food_count"),
    aliasCount: metadataNumber(metadata, "alias_count"),
    vietnameseRecipeCount: metadataNumber(metadata, "vietnamese_recipe_count"),
    foodGroupCount: metadataNumber(metadata, "food_group_count") || undefined,
    recipeIngredientCount: metadataNumber(metadata, "recipe_ingredient_count") || undefined,
    sources: []
  };
}

export function mapNutritionPackRow(row: Record<string, unknown>): FoodItem {
  return {
    id: `pack_${String(row.id)}`,
    name: { vi: String(row.name_vi || row.name_en), en: String(row.name_en || row.name_vi) },
    servingLabel: row.serving_label ? String(row.serving_label) : undefined,
    servingGrams: numberOrNull(row.serving_grams) ?? undefined,
    per100g: {
      calories: numberOrNull(row.calories) ?? 0,
      protein: numberOrNull(row.protein) ?? 0,
      carbs: numberOrNull(row.carbs) ?? 0,
      fat: numberOrNull(row.fat) ?? 0,
      fiber: numberOrNull(row.fiber),
      sugar: numberOrNull(row.sugar),
      sodiumMg: numberOrNull(row.sodium_mg),
      calciumMg: numberOrNull(row.calcium_mg),
      ironMg: numberOrNull(row.iron_mg),
      potassiumMg: numberOrNull(row.potassium_mg),
      magnesiumMg: numberOrNull(row.magnesium_mg),
      zincMg: numberOrNull(row.zinc_mg),
      vitaminAMcg: numberOrNull(row.vitamin_a_mcg),
      vitaminCMg: numberOrNull(row.vitamin_c_mg),
      vitaminDMcg: numberOrNull(row.vitamin_d_mcg),
      vitaminEMg: numberOrNull(row.vitamin_e_mg),
      vitaminKMcg: numberOrNull(row.vitamin_k_mcg),
      vitaminB6Mg: numberOrNull(row.vitamin_b6_mg),
      vitaminB12Mcg: numberOrNull(row.vitamin_b12_mcg),
      folateMcg: numberOrNull(row.folate_mcg)
    },
    source: row.source === "vietnamese_recipe" ? "vietnamese_recipe" : "usda_fdc",
    sourceFoodId: row.source_food_id ? String(row.source_food_id) : undefined,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    dataQuality: row.data_quality === "estimated_recipe" ? "estimated_recipe" : row.data_quality === "complete" ? "complete" : "partial",
    updatedAt: new Date().toISOString()
  };
}

export async function loadNutritionPackManifest(
  url = new URL("nutrition-pack-manifest.json", document.baseURI).href,
  dependencies: {
    fetchManifest?: (sourceUrl: string) => Promise<unknown>;
    getPackInfo?: () => Promise<NutritionPackInfo>;
    appVersion?: string;
    supportedSchemaVersion?: number;
  } = {}
): Promise<NutritionPackManifest> {
  try {
    const input = await (dependencies.fetchManifest ?? fetchManifestFromProvider)(url);
    return parseNutritionPackManifest(
      input,
      url,
      dependencies.appVersion ?? APP_VERSIONS.app,
      dependencies.supportedSchemaVersion ?? APP_VERSIONS.nutritionPackSchema
    );
  } catch (manifestError) {
    try {
      const info = await (dependencies.getPackInfo ?? nutritionPackInfo)();
      if (!info.installed) throw manifestError;
      const installedManifest = info.manifest ?? installedManifestFallback(info);
      assertNutritionPackCompatibility(
        installedManifest,
        dependencies.appVersion ?? APP_VERSIONS.app,
        dependencies.supportedSchemaVersion ?? APP_VERSIONS.nutritionPackSchema
      );
      return installedManifest;
    } catch (packError) {
      if (packError === manifestError) throw manifestError;
      throw packError;
    }
  }
}

export function nutritionPackInfo(): Promise<NutritionPackInfo> {
  return getNutritionPackWorkerInfo();
}

export function installNutritionPack(
  manifest: NutritionPackManifest,
  onProgress?: ProgressListener
): Promise<NutritionPackInfo & { checksum: string; bytesDownloaded: number }> {
  assertNutritionPackCompatibility(manifest);
  if (!manifest.downloadUrl || manifest.sizeBytes <= 0 || /^0+$/.test(manifest.sha256)) {
    return Promise.reject(new Error("The installed offline fallback cannot be downloaded"));
  }
  return installNutritionPackFile(manifest, onProgress);
}

export async function searchOfflineFoods(query: string, limit = 30): Promise<FoodItem[]> {
  const rows = await searchNutritionPackRows(query, limit);
  return rows.map(mapNutritionPackRow);
}

export function removeNutritionPack(): Promise<{ removed: boolean }> {
  return removeNutritionPackFiles();
}
