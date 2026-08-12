import { afterEach, describe, expect, it, vi } from "vitest";
import { completeFoodLookupCandidate, createCustomFood, createMealEntry, dailyNutrition, estimateNutritionTarget, lookupFoodByBarcode, parseNutritionNumber, validateCustomFoodDraft, validateMealInput, type FoodLookupCandidate } from "./index";

afterEach(() => vi.restoreAllMocks());

describe("nutrition", () => {
  it("uses versioned editable Mifflin-St Jeor defaults", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T08:00:00.000Z"));
    try {
      const basis = { biologicalSex: "male" as const, age: 30, heightCm: 175, weightKg: 70, activityFactor: 1.55 as const, goal: "hypertrophy" as const };
      expect(estimateNutritionTarget(basis)).toEqual({
        calories: 2683,
        protein: 112,
        carbs: 390,
        fat: 75,
        waterMl: 2450,
        formulaVersion: 1,
        source: "estimated",
        basis,
        calculatedAt: "2026-08-13T08:00:00.000Z"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores nutrient snapshots instead of recomputing diary history", () => {
    const food = createCustomFood("Cơm", { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 });
    const entry = createMealEntry(food, 200, "2026-08-10", "lunch");
    food.per100g.calories = 999;
    expect(dailyNutrition([entry], "2026-08-10").calories).toBe(260);
  });

  it("parses Vietnamese decimal commas and rejects non-finite or malformed amounts", () => {
    expect(parseNutritionNumber("1,5", "vi", "grams")).toEqual({ ok: true, value: 1.5 });
    for (const value of ["NaN", "Infinity", "1e4", "abc", ""]) {
      expect(parseNutritionNumber(value, "vi", "grams").ok).toBe(false);
    }
    expect(validateMealInput("100", "", "vi").ok).toBe(false);
    expect(validateMealInput("100", "2026-02-30", "vi").ok).toBe(false);
    expect(() => createMealEntry(createCustomFood("Rice", { calories: 100, protein: 2, carbs: 20, fat: 1 }), Number.NaN, "2026-08-10", "lunch")).toThrow();
  });

  it("requires every custom-food macro instead of silently converting blanks to zero", () => {
    const invalid = validateCustomFoodDraft({ name: "Sữa", calories: "", protein: "3", carbs: "4", fat: "2" }, "vi");
    expect(invalid.ok).toBe(false);
    const valid = validateCustomFoodDraft({ name: "Sữa", calories: "60", protein: "3,2", carbs: "4", fat: "2" }, "vi");
    expect(valid.ok && valid.value.per100g.protein).toBe(3.2);
  });

  it("does not turn missing Open Food Facts core nutrients into zero", () => {
    const candidate: FoodLookupCandidate = {
      id: "off_12345678",
      barcode: "12345678",
      name: { vi: "Sản phẩm", en: "Product" },
      per100g: { calories: 100, protein: 2, fat: 1 },
      missingCoreNutrients: ["carbs"],
      source: "open_food_facts",
      sourceUrl: "https://world.openfoodfacts.org/product/12345678",
      updatedAt: "2026-08-10T00:00:00.000Z"
    };
    expect(completeFoodLookupCandidate(candidate, { calories: "100", protein: "2", carbs: "", fat: "1" }, "vi").ok).toBe(false);
    const completed = completeFoodLookupCandidate(candidate, { calories: "100", protein: "2", carbs: "12", fat: "1" }, "vi");
    expect(completed.ok && completed.value.per100g.carbs).toBe(12);
  });

  it("models an incomplete Open Food Facts response as a candidate with missing fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: 1,
      product: { code: "12345678", product_name: "Product", nutriments: { "energy-kcal_100g": 100, proteins_100g: 2, fat_100g: 1 } }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const candidate = await lookupFoodByBarcode("12345678");
    expect(candidate?.per100g.carbs).toBeUndefined();
    expect(candidate?.missingCoreNutrients).toEqual(["carbs"]);
  });
});
