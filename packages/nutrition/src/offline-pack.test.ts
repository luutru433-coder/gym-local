import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNutritionPackManifest, mapNutritionPackRow } from "./offline-pack";

afterEach(() => vi.restoreAllMocks());

describe("offline nutrition pack contracts", () => {
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
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
      sources: [{ id: "usda", label: "USDA", url: "https://fdc.nal.usda.gov/", licenseId: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", retrievedAt: "2026-08-10" }]
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const manifest = await loadNutritionPackManifest("https://example.test/data/manifest.json");
    expect(manifest.downloadUrl).toBe("https://example.test/data/nutrition.sqlite3");
    expect(manifest.vietnameseRecipeCount).toBe(300);
  });
});
