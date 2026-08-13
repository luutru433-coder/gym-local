import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessNutrientCompleteness,
  completeFoodLookupCandidate,
  confirmNutritionTarget,
  createCustomFood,
  createMealEntry,
  createMealEntryFromRecipe,
  createRecipe,
  createWaterEntry,
  dailyNutrition,
  dailyNutritionWithMicronutrients,
  estimateNutritionTarget,
  findFoodByBarcode,
  lookupFoodByBarcode,
  nutritionTargetNeedsConfirmation,
  parseNutritionNumber,
  rankFoodsByPreference,
  recipeNutrition,
  recordFoodUse,
  validateCustomFoodDraft,
  validateMealInput,
  type FoodLookupCandidate
} from "./index";

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

  it("requires target confirmation again when estimate inputs change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T08:00:00.000Z"));
    try {
      const basis = { biologicalSex: "male" as const, age: 30, heightCm: 175, weightKg: 70, activityFactor: 1.55 as const, goal: "hypertrophy" as const };
      const confirmed = confirmNutritionTarget(estimateNutritionTarget(basis), "2026-08-13T09:00:00.000Z");
      expect(nutritionTargetNeedsConfirmation(confirmed, basis)).toBe(false);
      expect(nutritionTargetNeedsConfirmation(confirmed, { ...basis, weightKg: 71 })).toBe(true);
      expect(nutritionTargetNeedsConfirmation({ ...confirmed, confirmedAt: undefined }, basis)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("calculates recipe snapshots honestly and supports direct meal logging", () => {
    const rice = createCustomFood("Rice", {
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
      fiber: 1,
      ironMg: 0.2
    });
    const recipe = createRecipe("Rice bowl", [{ food: rice, grams: 200 }], {
      id: "recipe_rice",
      yieldGrams: 250,
      servings: 2,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z"
    });
    rice.per100g.calories = 999;

    const nutrition = recipeNutrition(recipe);
    expect(nutrition.total.calories).toBe(260);
    expect(nutrition.per100g).toMatchObject({ calories: 104, fiber: 0.8, ironMg: 0.16 });
    expect(nutrition.completeness.missing).toContain("vitaminCMg");
    const meal = createMealEntryFromRecipe(recipe, undefined, "2026-08-13", "lunch");
    expect(meal).toMatchObject({ foodId: "recipe_rice", grams: 125, nutrientsSnapshot: { calories: 130 } });
  });

  it("marks optional nutrients unknown instead of silently undercounting them", () => {
    const complete = createMealEntry(createCustomFood("A", {
      calories: 100, protein: 2, carbs: 10, fat: 1, ironMg: 2
    }), 100, "2026-08-13", "lunch");
    const partial = createMealEntry(createCustomFood("B", {
      calories: 50, protein: 1, carbs: 5, fat: 1
    }), 100, "2026-08-13", "lunch");
    const total = dailyNutritionWithMicronutrients([complete, partial], "2026-08-13");
    expect(total.calories).toBe(150);
    expect(total.ironMg).toBeUndefined();
    expect(assessNutrientCompleteness(total).missing).toContain("ironMg");
  });

  it("creates bounded water entries and exact barcode matches", () => {
    expect(createWaterEntry(350.4, "2026-08-13", "2026-08-13T01:00:00.000Z")).toMatchObject({ amountMl: 350, date: "2026-08-13" });
    expect(() => createWaterEntry(250, "2026-02-30")).toThrow("date");
    const food = { ...createCustomFood("Milk", { calories: 60, protein: 3, carbs: 5, fat: 3 }), barcode: "0123456789012" };
    expect(findFoodByBarcode([food], "0 123 456 789 012")?.id).toBe(food.id);
    expect(findFoodByBarcode([food], "1234567890123")).toBeUndefined();
  });

  it("ranks favorites and recent foods while preserving explicit serving defaults", () => {
    const first = createCustomFood("Apple", { calories: 50, protein: 0, carbs: 12, fat: 0 });
    const second = createCustomFood("Banana", { calories: 90, protein: 1, carbs: 22, fat: 0 });
    const recent = recordFoodUse(undefined, first.id, { usedAt: "2026-08-13T01:00:00.000Z", defaultServingGrams: 150 });
    const favorite = { ...recordFoodUse(undefined, second.id, { usedAt: "2026-08-12T01:00:00.000Z" }), favorite: true };
    expect(rankFoodsByPreference([first, second], [recent, favorite], "en").map((food) => food.id)).toEqual([second.id, first.id]);
    expect(recent).toMatchObject({ defaultServingGrams: 150, useCount: 1 });
  });
});
