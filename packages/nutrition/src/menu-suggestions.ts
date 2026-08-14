import {
  FOOD_GROUP_IDS,
  type FoodGroupId,
  type FoodItem,
  type LocalizedText,
  type MealEntry,
  type NutrientProfile,
  type PantryItem
} from "@gym/contracts";
import {
  loadNutritionPackRecipeDataset,
  type NutritionPackRecipeDataset,
  type NutritionPackRecipeIngredientRow
} from "@gym/storage";
import { mapNutritionPackRow } from "./offline-pack";

export interface MenuSuggestionOptions {
  mealSlot?: MealEntry["meal"];
  excludedAllergens?: string[];
  dietaryTags?: string[];
  calorieTarget?: number;
  limit?: number;
}

export interface MenuIngredientMatch {
  position: number;
  foodId: string;
  name: LocalizedText;
  grams: number;
  role: string;
  groupId: FoodGroupId;
  required: boolean;
  matchedBy: "exact" | "group" | "missing";
  availabilityRatio: number;
  pantryItemId?: string;
}

export interface OfflineMenuSuggestion {
  recipeId: string;
  name: LocalizedText;
  servingGrams: number;
  nutrients: NutrientProfile;
  estimationNote: string;
  ingredients: MenuIngredientMatch[];
  mealSlots: MealEntry["meal"][];
  tags: string[];
  dietaryTags: string[];
  allergenTags: string[];
  completeRequired: boolean;
  requiredCoverage: number;
  exactMatchCount: number;
  groupMatchCount: number;
  missingRequiredCount: number;
}

const optionalNutrientColumns = [
  ["fiber", "fiber"], ["sugar", "sugar"], ["sodiumMg", "sodiumMg"],
  ["calciumMg", "calciumMg"], ["ironMg", "ironMg"], ["potassiumMg", "potassiumMg"],
  ["magnesiumMg", "magnesiumMg"], ["zincMg", "zincMg"], ["vitaminAMcg", "vitaminAMcg"],
  ["vitaminCMg", "vitaminCMg"], ["vitaminDMcg", "vitaminDMcg"], ["vitaminEMg", "vitaminEMg"],
  ["vitaminKMcg", "vitaminKMcg"], ["vitaminB6Mg", "vitaminB6Mg"],
  ["vitaminB12Mcg", "vitaminB12Mcg"], ["folateMcg", "folateMcg"]
] as const satisfies ReadonlyArray<readonly [keyof NutrientProfile, keyof NutrientProfile]>;

function nutrientForServing(food: FoodItem, servingGrams: number): NutrientProfile {
  const factor = servingGrams / 100;
  const result: NutrientProfile = {
    calories: Math.round(food.per100g.calories * factor),
    protein: Math.round(food.per100g.protein * factor * 10) / 10,
    carbs: Math.round(food.per100g.carbs * factor * 10) / 10,
    fat: Math.round(food.per100g.fat * factor * 10) / 10
  };
  for (const [target, source] of optionalNutrientColumns) {
    const value = food.per100g[source];
    result[target] = typeof value === "number" ? Math.round(value * factor * 1000) / 1000 : value;
  }
  return result;
}

function normalizedFoodId(value: string): string {
  return value.startsWith("pack_") ? value.slice(5) : value;
}

function availabilityRatio(item: PantryItem, requiredGrams: number): number {
  if (item.availableGrams === undefined) return 1;
  return Math.min(1, item.availableGrams / requiredGrams);
}

function foodGroupId(value: string): FoodGroupId {
  if (!FOOD_GROUP_IDS.includes(value as FoodGroupId)) throw new Error(`Unknown food group in nutrition pack: ${value}`);
  return value as FoodGroupId;
}

function matchIngredient(ingredient: NutritionPackRecipeIngredientRow, pantryItems: PantryItem[]): MenuIngredientMatch {
  const exact = pantryItems
    .filter((item) => item.kind === "food" && normalizedFoodId(item.foodId) === ingredient.food_id)
    .sort((left, right) => availabilityRatio(right, ingredient.grams) - availabilityRatio(left, ingredient.grams))[0];
  const groupId = foodGroupId(ingredient.group_id);
  const group = pantryItems
    .filter((item) => item.kind === "group" && item.groupId === groupId)
    .sort((left, right) => availabilityRatio(right, ingredient.grams) - availabilityRatio(left, ingredient.grams))[0];
  const selected = exact ?? group;
  return {
    position: ingredient.position,
    foodId: ingredient.food_id,
    name: { vi: ingredient.name_vi, en: ingredient.name_en },
    grams: ingredient.grams,
    role: ingredient.role,
    groupId,
    required: ingredient.is_required === 1,
    matchedBy: exact ? "exact" : group ? "group" : "missing",
    availabilityRatio: selected ? availabilityRatio(selected, ingredient.grams) : 0,
    pantryItemId: selected?.id
  };
}

function tagsByRecipe(dataset: NutritionPackRecipeDataset) {
  const result = new Map<string, { mealSlots: MealEntry["meal"][]; tags: string[]; dietaryTags: string[]; allergenTags: string[] }>();
  for (const row of dataset.tags) {
    const current = result.get(row.recipe_id) ?? { mealSlots: [], tags: [], dietaryTags: [], allergenTags: [] };
    if (row.kind === "meal_slot" && ["breakfast", "lunch", "dinner", "snack"].includes(row.value)) {
      current.mealSlots.push(row.value as MealEntry["meal"]);
    } else if (row.kind === "tag") current.tags.push(row.value);
    else if (row.kind === "dietary") current.dietaryTags.push(row.value);
    else if (row.kind === "allergen") current.allergenTags.push(row.value);
    result.set(row.recipe_id, current);
  }
  return result;
}

export function rankOfflineMenuSuggestions(
  dataset: NutritionPackRecipeDataset,
  pantryItems: PantryItem[],
  options: MenuSuggestionOptions = {}
): OfflineMenuSuggestion[] {
  if (!pantryItems.length) return [];
  const ingredientsByRecipe = new Map<string, NutritionPackRecipeIngredientRow[]>();
  for (const ingredient of dataset.ingredients) {
    const items = ingredientsByRecipe.get(ingredient.recipe_id) ?? [];
    items.push(ingredient);
    ingredientsByRecipe.set(ingredient.recipe_id, items);
  }
  const recipeTags = tagsByRecipe(dataset);
  const excludedAllergens = new Set(options.excludedAllergens ?? []);
  const dietaryTags = new Set(options.dietaryTags ?? []);
  const suggestions = dataset.recipes.flatMap((row): OfflineMenuSuggestion[] => {
    const recipeId = String(row.id ?? "");
    const tags = recipeTags.get(recipeId) ?? { mealSlots: [], tags: [], dietaryTags: [], allergenTags: [] };
    if (options.mealSlot && !tags.mealSlots.includes(options.mealSlot)) return [];
    if (tags.allergenTags.some((tag) => excludedAllergens.has(tag))) return [];
    if ([...dietaryTags].some((tag) => !tags.dietaryTags.includes(tag))) return [];
    const ingredients = (ingredientsByRecipe.get(recipeId) ?? [])
      .sort((left, right) => left.position - right.position)
      .map((ingredient) => matchIngredient(ingredient, pantryItems));
    if (!ingredients.length) return [];
    const required = ingredients.filter((ingredient) => ingredient.required);
    const requiredCoverage = required.length
      ? required.reduce((sum, ingredient) => sum + ingredient.availabilityRatio, 0) / required.length
      : 0;
    const food = mapNutritionPackRow(row);
    const servingGrams = Number(row.serving_grams);
    return [{
      recipeId,
      name: { vi: String(row.name_vi), en: String(row.name_en) },
      servingGrams,
      nutrients: nutrientForServing(food, servingGrams),
      estimationNote: String(row.estimation_note ?? ""),
      ingredients,
      mealSlots: tags.mealSlots,
      tags: tags.tags,
      dietaryTags: tags.dietaryTags,
      allergenTags: tags.allergenTags,
      completeRequired: required.every((ingredient) => ingredient.availabilityRatio >= 1),
      requiredCoverage: Math.round(requiredCoverage * 1000) / 1000,
      exactMatchCount: ingredients.filter((ingredient) => ingredient.matchedBy === "exact" && ingredient.availabilityRatio >= 1).length,
      groupMatchCount: ingredients.filter((ingredient) => ingredient.matchedBy === "group" && ingredient.availabilityRatio >= 1).length,
      missingRequiredCount: required.filter((ingredient) => ingredient.availabilityRatio < 1).length
    }];
  });
  const calorieTarget = Number.isFinite(options.calorieTarget) && (options.calorieTarget ?? 0) > 0
    ? options.calorieTarget
    : undefined;
  const limit = Number.isFinite(options.limit)
    ? Math.min(30, Math.max(1, Math.floor(options.limit!)))
    : 12;
  return suggestions.sort((left, right) =>
    Number(right.completeRequired) - Number(left.completeRequired)
    || right.requiredCoverage - left.requiredCoverage
    || right.exactMatchCount - left.exactMatchCount
    || right.groupMatchCount - left.groupMatchCount
    || (calorieTarget ? Math.abs(left.nutrients.calories - calorieTarget) - Math.abs(right.nutrients.calories - calorieTarget) : 0)
    || right.nutrients.protein - left.nutrients.protein
    || left.recipeId.localeCompare(right.recipeId)
  ).slice(0, limit);
}

export async function suggestOfflineMenus(
  pantryItems: PantryItem[],
  options: MenuSuggestionOptions = {}
): Promise<OfflineMenuSuggestion[]> {
  const dataset = await loadNutritionPackRecipeDataset();
  return rankOfflineMenuSuggestions(dataset, pantryItems, options);
}
