import { z } from "zod";
import type { FoodItem, NutritionPackManifest } from "@gym/contracts";

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
  sources: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: z.string().url(),
    licenseId: z.string().min(1),
    licenseUrl: z.string().url(),
    retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })).min(1)
});

interface WorkerEnvelope {
  id: string;
  type: "result" | "error" | "progress";
  payload: unknown;
}

type ProgressListener = (progress: { bytesDownloaded: number; totalBytes?: number }) => void;

class NutritionPackClient {
  private worker?: Worker;
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; onProgress?: ProgressListener }>();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./nutrition-pack.worker.ts", import.meta.url), { type: "module", name: "gym-local-nutrition" });
      this.worker.addEventListener("message", (event: MessageEvent<WorkerEnvelope>) => {
        const message = event.data;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        if (message.type === "progress") {
          pending.onProgress?.(message.payload as { bytesDownloaded: number; totalBytes?: number });
          return;
        }
        this.pending.delete(message.id);
        if (message.type === "error") pending.reject(new Error((message.payload as { message?: string }).message ?? "Nutrition worker failed"));
        else pending.resolve(message.payload);
      });
      this.worker.addEventListener("error", (event) => {
        for (const pending of this.pending.values()) pending.reject(new Error(event.message || "Nutrition worker crashed"));
        this.pending.clear();
      });
    }
    return this.worker;
  }

  request<T>(type: string, payload: Record<string, unknown> = {}, onProgress?: ProgressListener): Promise<T> {
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, onProgress });
      this.getWorker().postMessage({ id, type, ...payload });
    });
  }
}

const client = new NutritionPackClient();

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

export async function loadNutritionPackManifest(url = new URL("nutrition-pack-manifest.json", document.baseURI).href): Promise<NutritionPackManifest> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Không tải được manifest gói dinh dưỡng");
  const parsed = manifestSchema.parse(await response.json());
  return {
    ...parsed,
    downloadUrl: new URL(parsed.downloadUrl, url).href
  };
}

export function nutritionPackInfo(): Promise<{ installed: boolean; metadata?: Record<string, string> }> {
  return client.request("init");
}

export function installNutritionPack(manifest: NutritionPackManifest, onProgress?: ProgressListener): Promise<{ installed: boolean; checksum: string; bytesDownloaded: number; metadata?: Record<string, string> }> {
  return client.request("install", { manifest }, onProgress);
}

export async function searchOfflineFoods(query: string, limit = 30): Promise<FoodItem[]> {
  const rows = await client.request<Record<string, unknown>[]>("search", { query, limit });
  return rows.map(mapNutritionPackRow);
}

export function removeNutritionPack(): Promise<{ removed: boolean }> {
  return client.request("remove");
}
