import { describe, expect, it } from "vitest";
import type { PantryItem } from "@gym/contracts";
import type { NutritionPackRecipeDataset, NutritionPackRecipeIngredientRow } from "@gym/storage";
import { rankOfflineMenuSuggestions } from "./menu-suggestions";

const timestamp = "2026-08-14T00:00:00.000Z";

function recipe(id: string, name: string, calories: number, protein: number) {
  return {
    id,
    name_vi: name,
    name_en: name,
    serving_grams: 345,
    estimation_note: "Estimated from reviewed ingredients.",
    source: "vietnamese_recipe",
    source_url: "https://example.test/recipes",
    serving_label: "1 serving",
    calories: calories / 3.45,
    protein: protein / 3.45,
    carbs: 50 / 3.45,
    fat: 10 / 3.45,
    data_quality: "estimated_recipe"
  };
}

function ingredient(
  recipeId: string,
  position: number,
  foodId: string,
  groupId: string,
  role: string,
  grams: number,
  required = true
): NutritionPackRecipeIngredientRow {
  return {
    recipe_id: recipeId,
    position,
    food_id: foodId,
    query: foodId,
    grams,
    role,
    group_id: groupId,
    is_required: required ? 1 : 0,
    name_vi: foodId,
    name_en: foodId
  };
}

const dataset: NutritionPackRecipeDataset = {
  recipes: [
    recipe("recipe_chicken", "Chicken rice", 500, 45),
    recipe("recipe_beef", "Beef rice", 600, 40),
    recipe("recipe_tofu", "Tofu rice", 450, 30)
  ],
  ingredients: [
    ingredient("recipe_chicken", 1, "usda_rice", "starch", "base", 150),
    ingredient("recipe_chicken", 2, "usda_chicken", "meat", "protein", 110),
    ingredient("recipe_chicken", 3, "usda_broccoli", "vegetables", "vegetable", 80),
    ingredient("recipe_chicken", 4, "usda_oil", "fats", "fat", 5, false),
    ingredient("recipe_beef", 1, "usda_rice", "starch", "base", 150),
    ingredient("recipe_beef", 2, "usda_beef", "meat", "protein", 110),
    ingredient("recipe_beef", 3, "usda_carrot", "vegetables", "vegetable", 80),
    ingredient("recipe_beef", 4, "usda_oil", "fats", "fat", 5, false),
    ingredient("recipe_tofu", 1, "usda_rice", "starch", "base", 150),
    ingredient("recipe_tofu", 2, "usda_tofu", "plant_protein", "protein", 110),
    ingredient("recipe_tofu", 3, "usda_broccoli", "vegetables", "vegetable", 80),
    ingredient("recipe_tofu", 4, "usda_oil", "fats", "fat", 5, false)
  ],
  tags: [
    { recipe_id: "recipe_chicken", kind: "meal_slot", value: "lunch" },
    { recipe_id: "recipe_beef", kind: "meal_slot", value: "dinner" },
    { recipe_id: "recipe_tofu", kind: "meal_slot", value: "lunch" },
    { recipe_id: "recipe_tofu", kind: "dietary", value: "vegetarian" },
    { recipe_id: "recipe_tofu", kind: "allergen", value: "soy" }
  ]
};

function exact(id: string, foodId: string, grams?: number): PantryItem {
  return {
    id,
    kind: "food",
    foodId: `pack_${foodId}`,
    foodNameSnapshot: { vi: foodId, en: foodId },
    availableGrams: grams,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function group(id: string, groupId: "starch" | "meat" | "plant_protein" | "vegetables"): PantryItem {
  return {
    id,
    kind: "group",
    groupId,
    groupNameSnapshot: { vi: groupId, en: groupId },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("offline menu suggestions", () => {
  it("ranks a complete exact-food recipe ahead of broad-group alternatives", () => {
    const pantry = [
      exact("rice", "usda_rice"),
      exact("chicken", "usda_chicken"),
      exact("broccoli", "usda_broccoli"),
      group("any_meat", "meat"),
      group("any_vegetable", "vegetables")
    ];

    const suggestions = rankOfflineMenuSuggestions(dataset, pantry, { limit: 3 });

    expect(suggestions[0]).toMatchObject({
      recipeId: "recipe_chicken",
      completeRequired: true,
      exactMatchCount: 3,
      missingRequiredCount: 0,
      nutrients: { calories: 500, protein: 45 }
    });
    expect(suggestions[1].exactMatchCount).toBeLessThan(suggestions[0].exactMatchCount);
  });

  it("uses availability amounts and explains a partially satisfied required ingredient", () => {
    const suggestions = rankOfflineMenuSuggestions(dataset, [
      exact("rice", "usda_rice", 50),
      exact("chicken", "usda_chicken", 110),
      exact("broccoli", "usda_broccoli", 80)
    ], { mealSlot: "lunch" });
    const chicken = suggestions.find((suggestion) => suggestion.recipeId === "recipe_chicken");

    expect(chicken).toMatchObject({ completeRequired: false, missingRequiredCount: 1, requiredCoverage: 0.778 });
    expect(chicken?.ingredients[0]).toMatchObject({ matchedBy: "exact", availabilityRatio: 1 / 3 });
  });

  it("filters by meal slot, dietary preference, and excluded allergens", () => {
    const pantry = [group("starch", "starch"), group("protein", "plant_protein"), group("veg", "vegetables")];

    expect(rankOfflineMenuSuggestions(dataset, pantry, {
      mealSlot: "lunch",
      dietaryTags: ["vegetarian"]
    }).map((suggestion) => suggestion.recipeId)).toEqual(["recipe_tofu"]);
    expect(rankOfflineMenuSuggestions(dataset, pantry, {
      mealSlot: "lunch",
      dietaryTags: ["vegetarian"],
      excludedAllergens: ["soy"]
    })).toEqual([]);
  });

  it("returns no suggestions until the pantry has at least one input", () => {
    expect(rankOfflineMenuSuggestions(dataset, [])).toEqual([]);
  });
});
