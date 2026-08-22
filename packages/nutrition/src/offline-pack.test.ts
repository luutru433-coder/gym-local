import { afterEach, describe, expect, it, vi } from "vitest";
import type { NutritionPackManifest } from "@gym/contracts";
import {
  NutritionPackWorkerClient,
  commitStagedNutritionPack,
  obsoletePackFileAfterActivation
} from "@gym/storage";
import {
  NutritionPackCompatibilityError,
  loadNutritionPackManifest,
  mapNutritionPackRow,
  nutritionPackSupportsMealPlans,
  nutritionPackSupportsMenuSuggestions,
  parseNutritionPackManifest
} from "./offline-pack";

afterEach(() => vi.restoreAllMocks());

describe("offline nutrition pack contracts", () => {
  const manifest = (overrides: Partial<NutritionPackManifest> = {}): NutritionPackManifest => ({
    id: "gym-local-nutrition",
    version: "2026.04",
    schemaVersion: 1,
    createdAt: "2026-08-10T00:00:00Z",
    minimumAppVersion: "0.2.0",
    fileName: "nutrition.sqlite3",
    downloadUrl: "./nutrition.sqlite3",
    sizeBytes: 123,
    sha256: "a".repeat(64),
    foodCount: 13_835,
    aliasCount: 24_907,
    vietnameseRecipeCount: 300,
    sources: [{ id: "usda", label: "USDA", url: "https://fdc.nal.usda.gov/", licenseId: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", retrievedAt: "2026-08-10" }],
    ...overrides
  });

  it("maps macros and micronutrients without turning missing values into zero", () => {
    const food = mapNutritionPackRow({
      id: "usda_1",
      name_vi: "Ức gà nướng",
      name_en: "Chicken breast, roasted",
      source: "usda_fdc",
      source_food_id: "1",
      source_url: "https://fdc.nal.usda.gov/food-details/1/nutrients",
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      iron_mg: 1.04,
      vitamin_c_mg: null,
      data_quality: "partial"
    });
    expect(food.per100g).toMatchObject({ calories: 165, protein: 31, ironMg: 1.04, vitaminCMg: null });
    expect(food.source).toBe("usda_fdc");
  });

  it("validates the pack manifest and resolves a relative release asset", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(manifest()), { status: 200, headers: { "content-type": "application/json" } }));

    const loadedManifest = await loadNutritionPackManifest("https://example.test/data/manifest.json");
    expect(loadedManifest.downloadUrl).toBe("https://example.test/data/nutrition.sqlite3");
    expect(loadedManifest.vietnameseRecipeCount).toBe(300);
  });

  it("rejects packs that require a newer app or an unsupported schema", () => {
    for (const [input, code] of [
      [manifest({ minimumAppVersion: "9.0.0" }), "app_too_old"],
      [manifest({
        schemaVersion: 3,
        foodGroupCount: 10,
        recipeIngredientCount: 3_200,
        vietnameseDisplayFoodCount: 10_000,
        activeRecipeCount: 800,
        deprecatedRecipeCount: 300,
        recipeStepCount: 2_400,
        cuisineCounts: { vietnamese: 480, chinese: 50 }
      }), "unsupported_schema"]
    ] as const) {
      try {
        parseNutritionPackManifest(input, "https://example.test/manifest.json", "0.3.0", 1);
        throw new Error("Expected compatibility validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(NutritionPackCompatibilityError);
        expect((error as NutritionPackCompatibilityError).code).toBe(code);
      }
    }
  });

  it("keeps schema 1 packs compatible while accepting structured schema 2 packs", () => {
    expect(() => parseNutritionPackManifest(manifest(), "https://example.test/manifest.json", "0.6.0", 2)).not.toThrow();
    expect(() => parseNutritionPackManifest(manifest({
      version: "2026.08",
      schemaVersion: 2,
      minimumAppVersion: "0.6.0",
      foodGroupCount: 10,
      recipeIngredientCount: 1200
    }), "https://example.test/manifest.json", "0.6.0", 2)).not.toThrow();
  });

  it("enables menu suggestions only for a structured recipe pack", () => {
    expect(nutritionPackSupportsMenuSuggestions(manifest())).toBe(false);
    expect(nutritionPackSupportsMenuSuggestions(manifest({ schemaVersion: 2, recipeIngredientCount: 1200 }))).toBe(true);
  });

  it("accepts complete schema 3 manifests and gates the seven-day planner on active recipes and steps", () => {
    const schema3 = manifest({
      version: "2026.08.3",
      schemaVersion: 3,
      minimumAppVersion: "0.7.0",
      foodGroupCount: 10,
      recipeIngredientCount: 3_200,
      vietnameseDisplayFoodCount: 10_000,
      activeRecipeCount: 800,
      deprecatedRecipeCount: 300,
      recipeStepCount: 2_400,
      cuisineCounts: { vietnamese: 480, chinese: 50, japanese: 50, korean: 50, thai: 50, taiwanese: 30, indian: 30, southeast_asian: 60 }
    });

    expect(() => parseNutritionPackManifest(schema3, "https://example.test/manifest.json", "0.7.0", 3)).not.toThrow();
    expect(nutritionPackSupportsMealPlans(schema3)).toBe(true);
    expect(nutritionPackSupportsMealPlans({ ...schema3, recipeStepCount: 0 })).toBe(false);
  });

  it("preserves schema 3 source, license, and Vietnamese review metadata", () => {
    const food = mapNutritionPackRow({
      id: "taiwan_1",
      name_vi: "Đậu phụ",
      name_en: "Tofu",
      source: "taiwan_fda",
      source_food_id: "1",
      source_dataset_id: "taiwan-fda-food-nutrition",
      source_dataset_version: "2026-08-14",
      source_license_id: "OGDL-1.0",
      translation_status: "reviewed",
      translation_reviewed_at: "2026-08-14T00:00:00.000Z",
      calories: 80,
      protein: 8,
      carbs: 2,
      fat: 4,
      data_quality: "partial"
    });

    expect(food).toMatchObject({
      source: "taiwan_fda",
      sourceDatasetId: "taiwan-fda-food-nutrition",
      sourceLicenseId: "OGDL-1.0",
      translationStatus: "reviewed",
      translationReviewedAt: "2026-08-14T00:00:00.000Z"
    });
  });

  it("keeps an installed pack usable when the manifest request is offline", async () => {
    const installed = await loadNutritionPackManifest("https://offline.test/manifest.json", {
      fetchManifest: vi.fn().mockRejectedValue(new TypeError("offline")),
      getPackInfo: vi.fn().mockResolvedValue({
        installed: true,
        activeFileName: "/gym-local-nutrition-pack-2026.04.sqlite3",
        metadata: {
          id: "gym-local-nutrition",
          version: "2026.04",
          schema_version: "1",
          created_at: "2026-08-10T00:00:00Z",
          food_count: "13835",
          alias_count: "24907",
          vietnamese_recipe_count: "300"
        }
      })
    });

    expect(installed).toMatchObject({
      version: "2026.04",
      schemaVersion: 1,
      fileName: "gym-local-nutrition-pack-2026.04.sqlite3",
      foodCount: 13_835
    });
  });

  it("surfaces an offline manifest failure when no installed pack exists", async () => {
    await expect(loadNutritionPackManifest("https://offline.test/manifest.json", {
      fetchManifest: vi.fn().mockRejectedValue(new TypeError("offline")),
      getPackInfo: vi.fn().mockResolvedValue({ installed: false })
    })).rejects.toThrow("offline");
  });

  it("retains one rollback pack and cleans only the obsolete older pack across repeated updates", () => {
    expect(obsoletePackFileAfterActivation(undefined, "/pack-b.sqlite3", "/pack-a.sqlite3")).toBeUndefined();
    expect(obsoletePackFileAfterActivation("/pack-a.sqlite3", "/pack-c.sqlite3", "/pack-b.sqlite3")).toBe("/pack-a.sqlite3");
    expect(obsoletePackFileAfterActivation("/pack-b.sqlite3", "/pack-c.sqlite3", "/pack-b.sqlite3")).toBeUndefined();
    expect(obsoletePackFileAfterActivation("/pack-c.sqlite3", "/pack-c.sqlite3", "/pack-b.sqlite3")).toBeUndefined();
  });

  it.each(["download", "checksum", "schema"])("does not activate over the old pack after a %s failure", async (failure) => {
    let activeFileName = "/working-pack.sqlite3";
    let stagedExists = true;
    const activate = vi.fn(async () => {
      activeFileName = "/staged-pack.sqlite3";
    });

    await expect(commitStagedNutritionPack({
      prepare: async () => {
        throw new Error(`${failure} failed`);
      },
      activate,
      discardStaged: async () => {
        stagedExists = false;
      }
    })).rejects.toThrow(`${failure} failed`);

    expect(activate).not.toHaveBeenCalled();
    expect(activeFileName).toBe("/working-pack.sqlite3");
    expect(stagedExists).toBe(false);
  });

  it("preserves the old pointer when atomic activation itself fails", async () => {
    const activeFileName = "/working-pack.sqlite3";
    let stagedExists = true;
    await expect(commitStagedNutritionPack({
      prepare: async () => ({ validated: true }),
      activate: async () => {
        throw new Error("pointer commit failed");
      },
      discardStaged: async () => {
        stagedExists = false;
      }
    })).rejects.toThrow("pointer commit failed");
    expect(activeFileName).toBe("/working-pack.sqlite3");
    expect(stagedExists).toBe(false);
  });

  it("serializes worker operations and rejects a crashed operation before recreating the worker", async () => {
    class FakeWorker extends EventTarget {
      readonly messages: Array<Record<string, unknown>> = [];
      readonly terminate = vi.fn();

      postMessage(message: Record<string, unknown>) {
        this.messages.push(message);
      }

      result(index: number, payload: unknown) {
        this.dispatchEvent(new MessageEvent("message", { data: { id: this.messages[index].id, type: "result", payload } }));
      }

      crash(message: string) {
        this.dispatchEvent(new ErrorEvent("error", { message }));
      }
    }

    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const workers = [firstWorker, secondWorker];
    const client = new NutritionPackWorkerClient(() => workers.shift() as unknown as Worker);
    const first = client.request<string>("first");
    const second = client.request<string>("second");
    await vi.waitFor(() => expect(firstWorker.messages).toHaveLength(1));
    expect(firstWorker.messages[0].type).toBe("first");
    expect(firstWorker.messages).toHaveLength(1);
    firstWorker.result(0, "one");
    await expect(first).resolves.toBe("one");
    await vi.waitFor(() => expect(firstWorker.messages).toHaveLength(2));
    expect(firstWorker.messages[1].type).toBe("second");
    firstWorker.result(1, "two");
    await expect(second).resolves.toBe("two");

    const crashing = client.request("crash");
    await vi.waitFor(() => expect(firstWorker.messages).toHaveLength(3));
    firstWorker.crash("worker crashed");
    await expect(crashing).rejects.toThrow("worker crashed");
    expect(firstWorker.terminate).toHaveBeenCalledOnce();

    const recovered = client.request<string>("recovered");
    await vi.waitFor(() => expect(secondWorker.messages).toHaveLength(1));
    secondWorker.result(0, "ok");
    await expect(recovered).resolves.toBe("ok");
  });
});
