import { describe, expect, it } from "vitest";
import type { MealEntry, MealPlanRequest, NutrientProfile, PantryItem } from "@gym/contracts";
import type {
  NutritionPackRecipeDataset,
  NutritionPackRecipeIngredientRow,
  NutritionPackRecipeTagRow
} from "@gym/storage";
import {
  aggregateMealPlanNutrients,
  createMealPlanRecipeSignature,
  generateOfflineMealPlan,
  scoreMealPlanTarget
} from "./meal-plans";

const target = {
  calories: 2_000,
  protein: 140,
  carbs: 250,
  fat: 60,
  formulaVersion: 1,
  confirmedAt: "2026-08-14T00:00:00.000Z",
  source: "manual" as const
};

const slotMacros: Record<MealEntry["meal"], Pick<NutrientProfile, "calories" | "protein" | "carbs" | "fat">> = {
  breakfast: { calories: 600, protein: 42, carbs: 75, fat: 18 },
  lunch: { calories: 700, protein: 49, carbs: 87.5, fat: 21 },
  dinner: { calories: 700, protein: 49, carbs: 87.5, fat: 21 },
  snack: { calories: 200, protein: 14, carbs: 25, fat: 6 }
};

function datasetForSlots(
  slots: MealEntry["meal"][],
  options: {
    allergenByIndex?: (index: number) => string | undefined;
    dietaryByIndex?: (index: number) => string[];
    sharedRice?: boolean;
    missingVitaminC?: boolean;
  } = {}
): NutritionPackRecipeDataset {
  const recipes: Record<string, unknown>[] = [];
  const ingredients: NutritionPackRecipeIngredientRow[] = [];
  const tags: NutritionPackRecipeTagRow[] = [];
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const id = `recipe_${slot}_${String(index).padStart(2, "0")}`;
    const proteinId = `food_protein_${String(index).padStart(2, "0")}`;
    const macro = slotMacros[slot];
    recipes.push({
      id,
      name_vi: `Món kiểm thử ${index + 1}`,
      name_en: `Test recipe ${index + 1}`,
      serving_grams: 100,
      calories: macro.calories,
      protein: macro.protein,
      carbs: macro.carbs,
      fat: macro.fat,
      vitamin_c_mg: options.missingVitaminC ? undefined : 12,
      source: "asian_recipe",
      cuisine: "vietnamese",
      status: "active",
      data_quality: "estimated_recipe"
    });
    ingredients.push({
      recipe_id: id,
      position: 1,
      food_id: options.sharedRice ? "food_rice" : `food_starch_${index}`,
      query: "rice",
      grams: 100,
      role: "starch",
      group_id: "starch",
      is_required: 1,
      name_vi: "Gạo",
      name_en: "Rice"
    }, {
      recipe_id: id,
      position: 2,
      food_id: proteinId,
      query: proteinId,
      grams: 20,
      role: "protein",
      group_id: "plant_protein",
      is_required: 1,
      name_vi: `Đạm ${index + 1}`,
      name_en: `Protein ${index + 1}`
    });
    tags.push(
      { recipe_id: id, kind: "meal_slot", value: slot },
      { recipe_id: id, kind: "tag", value: "cuisine:vietnamese" }
    );
    for (const dietary of options.dietaryByIndex?.(index) ?? ["vegetarian", "vegan"]) {
      tags.push({ recipe_id: id, kind: "dietary", value: dietary });
    }
    const allergen = options.allergenByIndex?.(index);
    if (allergen) tags.push({ recipe_id: id, kind: "allergen", value: allergen });
  }
  return { schemaVersion: 3, sourcePackVersion: "2026.08.1", recipes, ingredients, tags, steps: [] };
}

function request(overrides: Partial<MealPlanRequest> = {}): MealPlanRequest {
  return {
    durationDays: 7,
    includeSnack: false,
    startDate: "2026-08-14",
    target,
    cuisines: ["vietnamese"],
    dietaryTags: [],
    excludedAllergens: [],
    seed: "deterministic-test",
    ...overrides
  };
}

describe("offline seven-day meal plans", () => {
  it("generates a deterministic 7×3 plan without repeating a recipe, signature, or adjacent main protein", () => {
    const slots = Array.from({ length: 7 }, () => ["breakfast", "lunch", "dinner"] as const).flat();
    const dataset = datasetForSlots(slots);
    const first = generateOfflineMealPlan(dataset, [], request(), "2026.08.1");
    const second = generateOfflineMealPlan(dataset, [], request(), "2026.08.1");

    expect(second).toEqual(first);
    expect(first.days).toHaveLength(7);
    expect(first.days.every((day) => day.meals.length === 3)).toBe(true);
    const meals = first.days.flatMap((day) => day.meals);
    expect(new Set(meals.map((meal) => meal.recipeId))).toHaveLength(meals.length);
    const signatures = meals.map((meal) => createMealPlanRecipeSignature(dataset.ingredients.filter((item) => item.recipe_id === meal.recipeId)));
    expect(new Set(signatures)).toHaveLength(meals.length);
    const proteins = meals.map((meal) => meal.ingredientSnapshots.find((item) => item.groupId === "plant_protein")?.foodId);
    expect(proteins.every((protein, index) => index === 0 || protein !== proteins[index - 1])).toBe(true);
    expect(first.days.every((day) => scoreMealPlanTarget(day.totalsSnapshot, target).withinTolerance)).toBe(true);
  });

  it("defaults to seven days and adds one optional snack per day", () => {
    const slots = Array.from({ length: 7 }, () => ["breakfast", "lunch", "dinner", "snack"] as const).flat();
    const plan = generateOfflineMealPlan(
      datasetForSlots(slots),
      [],
      request({ durationDays: undefined, includeSnack: true }),
      "2026.08.1"
    );

    expect(plan.durationDays).toBe(7);
    expect(plan.days).toHaveLength(7);
    expect(plan.days.every((day) => day.meals.map((meal) => meal.meal).includes("snack"))).toBe(true);
  });

  it("treats diet and allergen filters as hard constraints", () => {
    const safe = datasetForSlots(["breakfast", "lunch", "dinner"], {
      allergenByIndex: () => undefined,
      dietaryByIndex: () => ["vegetarian"]
    });
    const unsafe = datasetForSlots(["breakfast", "lunch", "dinner"], {
      allergenByIndex: () => "peanut",
      dietaryByIndex: () => []
    });
    unsafe.recipes = unsafe.recipes.map((row, index) => ({ ...row, id: `unsafe_${index}`, name_vi: `Món không an toàn ${index}` }));
    unsafe.ingredients = unsafe.ingredients.map((row) => ({ ...row, recipe_id: `unsafe_${Number(row.recipe_id.split("_").at(-1))}` }));
    unsafe.tags = unsafe.tags.map((row) => ({ ...row, recipe_id: `unsafe_${Number(row.recipe_id.split("_").at(-1))}` }));
    const merged: NutritionPackRecipeDataset = {
      recipes: [...safe.recipes, ...unsafe.recipes],
      ingredients: [...safe.ingredients, ...unsafe.ingredients],
      tags: [...safe.tags, ...unsafe.tags]
    };
    const plan = generateOfflineMealPlan(
      merged,
      [],
      request({ durationDays: 1, dietaryTags: ["vegetarian"], excludedAllergens: ["peanut"] }),
      "2026.08.1"
    );

    expect(plan.days[0].meals).toHaveLength(3);
    expect(plan.days[0].meals.every((meal) => !meal.recipeId.startsWith("unsafe_"))).toBe(true);
  });

  it("allocates finite pantry quantities across the whole plan without mutating pantry", () => {
    const pantry: PantryItem[] = [{
      id: "pantry_rice",
      kind: "food",
      foodId: "food_rice",
      foodNameSnapshot: { vi: "Gạo", en: "Rice" },
      groupId: "starch",
      availableGrams: 150,
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z"
    }];
    const before = structuredClone(pantry);
    const plan = generateOfflineMealPlan(
      datasetForSlots(["breakfast", "lunch", "dinner"], { sharedRice: true }),
      pantry,
      request({ durationDays: 1 }),
      "2026.08.1"
    );
    const rice = plan.days[0].meals.flatMap((meal) => meal.ingredientSnapshots).filter((item) => item.foodId === "food_rice");

    expect(pantry).toEqual(before);
    expect(rice.reduce((sum, item) => sum + (item.availableGrams ?? 0), 0)).toBe(150);
    expect(rice.reduce((sum, item) => sum + item.missingGrams, 0)).toBe(150);
    expect(plan.shoppingListSnapshot.find((item) => item.foodId === "food_rice")?.missingGrams).toBe(150);
  });

  it("keeps unknown vitamins unknown instead of converting them to zero", () => {
    const plan = generateOfflineMealPlan(
      datasetForSlots(["breakfast", "lunch", "dinner"], { missingVitaminC: true }),
      [],
      request({ durationDays: 1 }),
      "2026.08.1"
    );

    expect(plan.days[0].totalsSnapshot.vitaminCMg).toBeNull();
    expect(plan.warnings.some((warning) => warning.code === "unknown_nutrients")).toBe(true);
  });

  it("rejects unconfirmed and old-formula targets before selecting recipes", () => {
    const dataset = datasetForSlots(["breakfast", "lunch", "dinner"]);
    expect(() => generateOfflineMealPlan(
      dataset,
      [],
      request({ durationDays: 1, target: { ...target, confirmedAt: undefined } }),
      "2026.08.1"
    )).toThrow("must be confirmed");
    expect(() => generateOfflineMealPlan(
      dataset,
      [],
      request({ durationDays: 1, target: { ...target, formulaVersion: 0 } }),
      "2026.08.1"
    )).toThrow("must be confirmed");
  });

  it("uses the required ±10% protein and energy bands and ±15% carb/fat bands", () => {
    const score = scoreMealPlanTarget(
      { calories: 2_180, protein: 156, carbs: 285, fat: 68.4 },
      { calories: 2_000, protein: 140, carbs: 250, fat: 60 }
    );

    expect(score.metrics.calories.withinTolerance).toBe(true);
    expect(score.metrics.protein.withinTolerance).toBe(false);
    expect(score.metrics.carbs.withinTolerance).toBe(true);
    expect(score.metrics.fat.withinTolerance).toBe(true);
    expect(score.withinTolerance).toBe(false);
  });

  it("preserves null and undefined optional nutrients while aggregating", () => {
    expect(aggregateMealPlanNutrients([
      { calories: 100, protein: 10, carbs: 10, fat: 2, ironMg: 1, folateMcg: undefined },
      { calories: 200, protein: 20, carbs: 20, fat: 4, ironMg: null, folateMcg: 20 }
    ])).toMatchObject({ calories: 300, protein: 30, carbs: 30, fat: 6, ironMg: null, folateMcg: undefined });
  });
});
