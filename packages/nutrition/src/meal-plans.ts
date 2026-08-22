import {
  APP_VERSIONS,
  FOOD_GROUP_IDS,
  type AsianCuisine,
  type FoodGroupId,
  type GeneratedMealPlan,
  type LocalizedText,
  type MealEntry,
  type MealPlanDay,
  type MealPlanRequest,
  type MealPlanShoppingItem,
  type MealPlanTargetSnapshot,
  type MealPlanWarning,
  type NutrientProfile,
  type PantryItem,
  type PlannedMeal,
  type PlannedMealIngredient
} from "@gym/contracts";
import type {
  NutritionPackRecipeDataset,
  NutritionPackRecipeIngredientRow
} from "@gym/storage";
import { mapNutritionPackRow } from "./offline-pack";

export const OFFLINE_MEAL_PLAN_ALGORITHM_VERSION = 1;

export const DEFAULT_MEAL_PLAN_TARGET_TOLERANCE = {
  calories: 0.1,
  protein: 0.1,
  carbs: 0.15,
  fat: 0.15
} as const;

const CORE_NUTRIENT_KEYS = ["calories", "protein", "carbs", "fat"] as const;
const OPTIONAL_NUTRIENT_KEYS = [
  "fiber", "sugar", "sodiumMg", "calciumMg", "ironMg", "potassiumMg",
  "magnesiumMg", "zincMg", "vitaminAMcg", "vitaminCMg", "vitaminDMcg",
  "vitaminEMg", "vitaminKMcg", "vitaminB6Mg", "vitaminB12Mcg", "folateMcg"
] as const;
const DEFAULT_SLOTS: MealEntry["meal"][] = ["breakfast", "lunch", "dinner"];
const SNACK_SLOTS: MealEntry["meal"][] = ["breakfast", "lunch", "dinner", "snack"];
const PROTEIN_GROUPS = new Set<FoodGroupId>(["meat", "seafood", "eggs", "plant_protein"]);
const ASIAN_CUISINES: AsianCuisine[] = [
  "vietnamese", "chinese", "japanese", "korean", "thai", "taiwanese", "indian", "southeast_asian"
];

export type MealPlanMacroTarget = Pick<MealPlanTargetSnapshot, "calories" | "protein" | "carbs" | "fat">;

export interface MealPlanTargetTolerance {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealPlanTargetMetricScore {
  actual: number;
  target: number;
  deviation: number;
  deviationRatio: number;
  tolerance: number;
  withinTolerance: boolean;
  score: number;
}

export interface MealPlanTargetScore {
  score: number;
  withinTolerance: boolean;
  metrics: Record<keyof MealPlanMacroTarget, MealPlanTargetMetricScore>;
}

interface RecipeMetadata {
  mealSlots: MealEntry["meal"][];
  tags: string[];
  dietaryTags: string[];
  allergenTags: string[];
}

interface MealPlanRecipeCandidate {
  recipeId: string;
  name: LocalizedText;
  servingGrams: number;
  nutrients: NutrientProfile;
  ingredients: NutritionPackRecipeIngredientRow[];
  mealSlots: MealEntry["meal"][];
  dietaryTags: string[];
  allergenTags: string[];
  cuisines: AsianCuisine[];
  mainProteinKey?: string;
  signature: string;
}

interface PantryBucket {
  id: string;
  kind: PantryItem["kind"];
  foodId?: string;
  groupId?: FoodGroupId;
  remainingGrams?: number;
}

interface CandidateAllocation {
  ingredients: PlannedMealIngredient[];
  remainingPantry: Map<string, number | undefined>;
  requiredCoverage: number;
  exactCoverage: number;
}

function round(value: number, precision = 3): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function normalizeTag(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s-]+/g, "_");
}

function uniqueSorted(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map(normalizeTag).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function normalizedFoodId(value: string): string {
  return value.startsWith("pack_") ? value.slice(5) : value;
}

function requiredFoodGroup(value: string): FoodGroupId {
  if (!FOOD_GROUP_IDS.includes(value as FoodGroupId)) throw new Error(`Unknown food group in nutrition pack: ${value}`);
  return value as FoodGroupId;
}

function isAsianCuisine(value: string): value is AsianCuisine {
  return ASIAN_CUISINES.includes(value as AsianCuisine);
}

function validateDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid meal-plan start date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error("Invalid meal-plan start date");
  }
}

function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function validateTarget(target: MealPlanMacroTarget): void {
  for (const key of CORE_NUTRIENT_KEYS) {
    const value = target[key];
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid meal-plan ${key} target`);
    }
  }
}

function resolveTolerance(input: Partial<MealPlanTargetTolerance> = {}): MealPlanTargetTolerance {
  const tolerance = { ...DEFAULT_MEAL_PLAN_TARGET_TOLERANCE, ...input };
  for (const key of CORE_NUTRIENT_KEYS) {
    if (!Number.isFinite(tolerance[key]) || tolerance[key] < 0 || tolerance[key] > 1) {
      throw new Error(`Invalid meal-plan ${key} tolerance`);
    }
  }
  return tolerance;
}

function scaleNutrients(nutrients: NutrientProfile, factor: number): NutrientProfile {
  const result: NutrientProfile = {
    calories: Math.round(nutrients.calories * factor),
    protein: round(nutrients.protein * factor, 1),
    carbs: round(nutrients.carbs * factor, 1),
    fat: round(nutrients.fat * factor, 1)
  };
  for (const key of OPTIONAL_NUTRIENT_KEYS) {
    const value = nutrients[key];
    result[key] = value === null ? null : value === undefined ? undefined : round(value * factor);
  }
  return result;
}

export function aggregateMealPlanNutrients(nutrients: NutrientProfile[]): NutrientProfile {
  const total: NutrientProfile = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const key of CORE_NUTRIENT_KEYS) {
    total[key] = round(nutrients.reduce((sum, item) => sum + item[key], 0), key === "calories" ? 0 : 1);
  }
  for (const key of OPTIONAL_NUTRIENT_KEYS) {
    const values = nutrients.map((item) => item[key]);
    if (values.some((value) => value === null)) total[key] = null;
    else if (!values.length || values.some((value) => value === undefined)) total[key] = undefined;
    else total[key] = round((values as number[]).reduce((sum, value) => sum + value, 0));
  }
  return total;
}

export function scoreMealPlanTarget(
  actual: NutrientProfile,
  target: MealPlanMacroTarget,
  toleranceInput: Partial<MealPlanTargetTolerance> = {}
): MealPlanTargetScore {
  validateTarget(target);
  const tolerance = resolveTolerance(toleranceInput);
  const metrics = {} as Record<keyof MealPlanMacroTarget, MealPlanTargetMetricScore>;
  for (const key of CORE_NUTRIENT_KEYS) {
    const targetValue = target[key];
    const actualValue = actual[key];
    const deviation = round(actualValue - targetValue, key === "calories" ? 0 : 1);
    const ratio = targetValue > 0 ? Math.abs(deviation) / targetValue : actualValue === 0 ? 0 : 1;
    metrics[key] = {
      actual: actualValue,
      target: targetValue,
      deviation,
      deviationRatio: round(ratio, 4),
      tolerance: tolerance[key],
      withinTolerance: ratio <= tolerance[key],
      score: Math.round(Math.max(0, 1 - Math.min(1, ratio)) * 100)
    };
  }
  const weights: Record<keyof MealPlanMacroTarget, number> = { calories: 0.4, protein: 0.3, carbs: 0.15, fat: 0.15 };
  const score = Math.round(CORE_NUTRIENT_KEYS.reduce((sum, key) => sum + metrics[key].score * weights[key], 0));
  return { score, withinTolerance: CORE_NUTRIENT_KEYS.every((key) => metrics[key].withinTolerance), metrics };
}

function tagsByRecipe(dataset: NutritionPackRecipeDataset): Map<string, RecipeMetadata> {
  const result = new Map<string, RecipeMetadata>();
  for (const row of dataset.tags) {
    const current = result.get(row.recipe_id) ?? { mealSlots: [], tags: [], dietaryTags: [], allergenTags: [] };
    const value = normalizeTag(row.value);
    if (row.kind === "meal_slot" && ["breakfast", "lunch", "dinner", "snack"].includes(value)) {
      current.mealSlots.push(value as MealEntry["meal"]);
    } else if (row.kind === "tag") current.tags.push(value);
    else if (row.kind === "dietary") current.dietaryTags.push(value);
    else if (row.kind === "allergen") current.allergenTags.push(value);
    result.set(row.recipe_id, current);
  }
  for (const metadata of result.values()) {
    metadata.mealSlots = [...new Set(metadata.mealSlots)];
    metadata.tags = uniqueSorted(metadata.tags);
    metadata.dietaryTags = uniqueSorted(metadata.dietaryTags);
    metadata.allergenTags = uniqueSorted(metadata.allergenTags);
  }
  return result;
}

export function createMealPlanRecipeSignature(ingredients: NutritionPackRecipeIngredientRow[]): string {
  return ingredients
    .map((ingredient) => `${normalizedFoodId(ingredient.food_id)}:${round(ingredient.grams, 1)}:${normalizeTag(ingredient.role)}`)
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function candidateCuisines(row: Record<string, unknown>, recipeId: string, tags: string[]): AsianCuisine[] {
  const direct = typeof row.cuisine === "string" ? [normalizeTag(row.cuisine)] : [];
  const tagged = tags.flatMap((tag) => tag.startsWith("cuisine:") ? [tag.slice("cuisine:".length)] : [tag]);
  const inferred = row.source === "vietnamese_recipe" || recipeId.startsWith("vi_recipe_") ? ["vietnamese"] : [];
  return [...new Set([...direct, ...tagged, ...inferred].filter(isAsianCuisine))]
    .sort((left, right) => left.localeCompare(right));
}

function buildCandidates(dataset: NutritionPackRecipeDataset): MealPlanRecipeCandidate[] {
  const ingredientsByRecipe = new Map<string, NutritionPackRecipeIngredientRow[]>();
  for (const ingredient of dataset.ingredients) {
    const ingredients = ingredientsByRecipe.get(ingredient.recipe_id) ?? [];
    ingredients.push(ingredient);
    ingredientsByRecipe.set(ingredient.recipe_id, ingredients);
  }
  const metadataByRecipe = tagsByRecipe(dataset);
  return dataset.recipes.flatMap((row): MealPlanRecipeCandidate[] => {
    const recipeId = String(row.id ?? "").trim();
    if (!recipeId) return [];
    if (normalizeTag(String(row.status ?? "active")) !== "active" || String(row.superseded_by ?? "").trim()) return [];
    const servingGrams = Number(row.serving_grams);
    if (!Number.isFinite(servingGrams) || servingGrams <= 0) return [];
    const ingredients = [...(ingredientsByRecipe.get(recipeId) ?? [])].sort((left, right) => left.position - right.position);
    if (!ingredients.length) return [];
    for (const ingredient of ingredients) requiredFoodGroup(ingredient.group_id);
    const metadata = metadataByRecipe.get(recipeId) ?? { mealSlots: [], tags: [], dietaryTags: [], allergenTags: [] };
    const cuisines = candidateCuisines(row, recipeId, metadata.tags);
    if (!cuisines.length) return [];
    const mainProtein = ingredients.find((ingredient) => normalizeTag(ingredient.role) === "protein")
      ?? ingredients.find((ingredient) => PROTEIN_GROUPS.has(requiredFoodGroup(ingredient.group_id)));
    const directProteinKey = typeof row.main_protein === "string" ? normalizeTag(row.main_protein) : undefined;
    const food = mapNutritionPackRow(row);
    return [{
      recipeId,
      name: { vi: String(row.name_vi || row.name_en), en: String(row.name_en || row.name_vi) },
      servingGrams,
      nutrients: scaleNutrients(food.per100g, servingGrams / 100),
      ingredients,
      mealSlots: metadata.mealSlots,
      dietaryTags: metadata.dietaryTags,
      allergenTags: metadata.allergenTags,
      cuisines,
      mainProteinKey: directProteinKey || (mainProtein ? normalizedFoodId(mainProtein.food_id) : undefined),
      signature: createMealPlanRecipeSignature(ingredients)
    }];
  }).sort((left, right) => left.recipeId.localeCompare(right.recipeId));
}

function pantryBuckets(pantryItems: PantryItem[]): PantryBucket[] {
  return [...pantryItems].sort((left, right) => left.id.localeCompare(right.id)).map((item) => ({
    id: item.id,
    kind: item.kind,
    foodId: item.kind === "food" ? normalizedFoodId(item.foodId) : undefined,
    groupId: item.groupId,
    remainingGrams: item.availableGrams
  }));
}

function allocateCandidate(
  candidate: MealPlanRecipeCandidate,
  buckets: PantryBucket[],
  currentRemaining: Map<string, number | undefined>
): CandidateAllocation {
  const remainingPantry = new Map(currentRemaining);
  const ingredients: PlannedMealIngredient[] = [];
  let requiredGrams = 0;
  let coveredRequiredGrams = 0;
  let exactRequiredGrams = 0;
  for (const ingredient of candidate.ingredients) {
    let missingGrams = ingredient.grams;
    let availableGrams = 0;
    const groupId = requiredFoodGroup(ingredient.group_id);
    const exactBuckets = buckets.filter((bucket) => bucket.kind === "food" && bucket.foodId === normalizedFoodId(ingredient.food_id));
    const groupBuckets = buckets.filter((bucket) => bucket.kind === "group" && bucket.groupId === groupId);
    for (const bucket of [...exactBuckets, ...groupBuckets]) {
      if (missingGrams <= 0) break;
      const remaining = remainingPantry.get(bucket.id);
      const grams = remaining === undefined ? missingGrams : Math.min(missingGrams, Math.max(0, remaining));
      if (grams <= 0) continue;
      missingGrams -= grams;
      availableGrams += grams;
      if (ingredient.is_required === 1 && bucket.kind === "food") exactRequiredGrams += grams;
      if (remaining !== undefined) remainingPantry.set(bucket.id, round(remaining - grams, 1));
    }
    if (ingredient.is_required === 1) {
      requiredGrams += ingredient.grams;
      coveredRequiredGrams += availableGrams;
    }
    ingredients.push({
      foodId: ingredient.food_id,
      nameSnapshot: { vi: ingredient.name_vi, en: ingredient.name_en },
      grams: ingredient.grams,
      groupId,
      required: ingredient.is_required === 1,
      availableGrams: availableGrams > 0 ? round(availableGrams, 1) : undefined,
      missingGrams: round(Math.max(0, missingGrams), 1)
    });
  }
  return {
    ingredients,
    remainingPantry,
    requiredCoverage: requiredGrams ? coveredRequiredGrams / requiredGrams : 1,
    exactCoverage: requiredGrams ? exactRequiredGrams / requiredGrams : 0
  };
}

function targetForSlot(
  target: MealPlanMacroTarget,
  current: NutrientProfile,
  currentSlot: MealEntry["meal"],
  remainingSlots: MealEntry["meal"][],
  includeSnack: boolean
): MealPlanMacroTarget {
  const shares: Record<MealEntry["meal"], number> = includeSnack
    ? { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 }
    : { breakfast: 0.3, lunch: 0.35, dinner: 0.35, snack: 0 };
  const remainingShare = remainingSlots.reduce((sum, slot) => sum + shares[slot], 0);
  const slotRatio = remainingShare ? shares[currentSlot] / remainingShare : 1;
  return {
    calories: Math.max(0, target.calories - current.calories) * slotRatio,
    protein: Math.max(0, target.protein - current.protein) * slotRatio,
    carbs: Math.max(0, target.carbs - current.carbs) * slotRatio,
    fat: Math.max(0, target.fat - current.fat) * slotRatio
  };
}

function deterministicHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function missingMicronutrients(nutrients: NutrientProfile): boolean {
  return OPTIONAL_NUTRIENT_KEYS.some((key) => nutrients[key] === null || nutrients[key] === undefined);
}

const WARNING_MESSAGES: Record<MealPlanWarning["code"], LocalizedText> = {
  insufficient_candidates: { vi: "Không đủ món phù hợp với bộ lọc và ràng buộc.", en: "Not enough recipes match the filters and constraints." },
  partial_plan: { vi: "Một số bữa chưa thể xếp mà không lặp món hoặc đạm chính.", en: "Some meals could not be filled without repeating a recipe or main protein." },
  target_out_of_range: { vi: "Tổng dinh dưỡng ngày nằm ngoài khoảng mục tiêu.", en: "The day's nutrition totals are outside the target tolerance." },
  missing_pantry: { vi: "Nguyên liệu hiện có không đủ; hãy xem danh sách cần mua.", en: "Available pantry quantities are insufficient; review the shopping list." },
  unknown_nutrients: { vi: "Một số vi chất chưa có dữ liệu và không được tính là 0.", en: "Some micronutrients are unknown and were not counted as zero." },
  stale_target: { vi: "Mục tiêu dinh dưỡng chưa được xác nhận hoặc dùng công thức cũ.", en: "The nutrition target is unconfirmed or uses an older formula." }
};

function appendWarning(
  warnings: MealPlanWarning[],
  code: MealPlanWarning["code"],
  dayIndex?: number,
  meal?: MealEntry["meal"]
): void {
  if (warnings.some((warning) => warning.code === code && warning.dayIndex === dayIndex && warning.meal === meal)) return;
  warnings.push({ code, message: WARNING_MESSAGES[code], dayIndex, meal });
}

function selectedCuisine(candidate: MealPlanRecipeCandidate, requested: AsianCuisine[]): AsianCuisine {
  return candidate.cuisines.find((cuisine) => requested.includes(cuisine)) ?? candidate.cuisines[0];
}

export function generateOfflineMealPlan(
  dataset: NutritionPackRecipeDataset,
  pantryItems: PantryItem[],
  request: MealPlanRequest,
  sourcePackVersion: string,
  toleranceInput: Partial<MealPlanTargetTolerance> = {}
): GeneratedMealPlan {
  const durationDays = request.durationDays ?? 7;
  if (durationDays !== 1 && durationDays !== 7) throw new Error("Meal-plan duration must be 1 or 7 days");
  if (request.startDate) validateDate(request.startDate);
  if (!sourcePackVersion.trim()) throw new Error("Nutrition pack version is required");
  validateTarget(request.target);
  if (request.target.calories <= 0) throw new Error("Meal-plan calorie target must be greater than zero");
  if (!request.target.confirmedAt || request.target.formulaVersion !== APP_VERSIONS.nutritionFormula) {
    throw new Error("Nutrition target must be confirmed with the current formula before generating a meal plan");
  }
  const targetTolerance = resolveTolerance(toleranceInput);
  const cuisines = uniqueSorted(request.cuisines) as AsianCuisine[];
  const dietaryTags = uniqueSorted(request.dietaryTags);
  const excludedAllergens = uniqueSorted(request.excludedAllergens);
  const seed = request.seed?.trim() || `gym-local-meal-plan-v${OFFLINE_MEAL_PLAN_ALGORITHM_VERSION}`;
  const slots = request.includeSnack ? SNACK_SLOTS : DEFAULT_SLOTS;
  const candidates = buildCandidates(dataset).filter((candidate) =>
    !candidate.allergenTags.some((tag) => excludedAllergens.includes(tag))
    && dietaryTags.every((tag) => candidate.dietaryTags.includes(tag))
    && (!cuisines.length || candidate.cuisines.some((cuisine) => cuisines.includes(cuisine)))
  );
  const warnings: MealPlanWarning[] = [];
  const requiredMealCount = durationDays * slots.length;
  if (candidates.length < requiredMealCount) appendWarning(warnings, "insufficient_candidates");

  const buckets = pantryBuckets(pantryItems);
  let remainingPantry = new Map(buckets.map((bucket) => [bucket.id, bucket.remainingGrams]));
  const usedRecipeIds = new Set<string>();
  const usedSignatures = new Set<string>();
  let previousProteinKey: string | undefined;
  const shopping = new Map<string, MealPlanShoppingItem>();
  const days: MealPlanDay[] = [];

  for (let dayIndex = 0; dayIndex < durationDays; dayIndex += 1) {
    const meals: PlannedMeal[] = [];
    let totals = aggregateMealPlanNutrients([]);
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const meal = slots[slotIndex];
      const slotTarget = targetForSlot(request.target, totals, meal, slots.slice(slotIndex), request.includeSnack);
      const ranked = candidates.flatMap((candidate) => {
        if (!candidate.mealSlots.includes(meal)) return [];
        if (usedRecipeIds.has(candidate.recipeId) || usedSignatures.has(candidate.signature)) return [];
        if (previousProteinKey && candidate.mainProteinKey === previousProteinKey) return [];
        const allocation = allocateCandidate(candidate, buckets, remainingPantry);
        return [{
          candidate,
          allocation,
          targetScore: scoreMealPlanTarget(candidate.nutrients, slotTarget),
          seedRank: deterministicHash(`${seed}|${dayIndex}|${meal}|${candidate.recipeId}`)
        }];
      }).sort((left, right) => {
        if (left.targetScore.withinTolerance !== right.targetScore.withinTolerance) {
          return Number(right.targetScore.withinTolerance) - Number(left.targetScore.withinTolerance);
        }
        if (!left.targetScore.withinTolerance && left.targetScore.score !== right.targetScore.score) {
          return right.targetScore.score - left.targetScore.score;
        }
        return right.allocation.requiredCoverage - left.allocation.requiredCoverage
          || right.allocation.exactCoverage - left.allocation.exactCoverage
          || right.targetScore.score - left.targetScore.score
          || left.seedRank - right.seedRank
          || left.candidate.recipeId.localeCompare(right.candidate.recipeId);
      });
      const selected = ranked[0];
      if (!selected) {
        appendWarning(warnings, "partial_plan", dayIndex, meal);
        continue;
      }
      remainingPantry = selected.allocation.remainingPantry;
      usedRecipeIds.add(selected.candidate.recipeId);
      usedSignatures.add(selected.candidate.signature);
      previousProteinKey = selected.candidate.mainProteinKey;
      const plannedMeal: PlannedMeal = {
        id: `planned_meal_${deterministicHash(`${seed}|${dayIndex}|${meal}|${selected.candidate.recipeId}`).toString(16)}`,
        dayIndex,
        meal,
        recipeId: selected.candidate.recipeId,
        recipeNameSnapshot: { ...selected.candidate.name },
        cuisine: selectedCuisine(selected.candidate, cuisines),
        servingGrams: selected.candidate.servingGrams,
        nutrientsSnapshot: { ...selected.candidate.nutrients },
        ingredientSnapshots: selected.allocation.ingredients,
        sourcePackVersion
      };
      meals.push(plannedMeal);
      totals = aggregateMealPlanNutrients(meals.map((item) => item.nutrientsSnapshot));
      for (const ingredient of plannedMeal.ingredientSnapshots) {
        if (ingredient.missingGrams <= 0) continue;
        const current = shopping.get(ingredient.foodId);
        shopping.set(ingredient.foodId, {
          foodId: ingredient.foodId,
          nameSnapshot: current?.nameSnapshot ?? { ...ingredient.nameSnapshot },
          groupId: current?.groupId ?? ingredient.groupId,
          missingGrams: round((current?.missingGrams ?? 0) + ingredient.missingGrams, 1)
        });
      }
    }
    if (!scoreMealPlanTarget(totals, request.target, targetTolerance).withinTolerance) {
      appendWarning(warnings, "target_out_of_range", dayIndex);
    }
    days.push({
      dayIndex,
      date: request.startDate ? addDays(request.startDate, dayIndex) : undefined,
      meals,
      totalsSnapshot: totals
    });
  }

  const shoppingListSnapshot = [...shopping.values()].sort((left, right) =>
    left.groupId.localeCompare(right.groupId) || left.foodId.localeCompare(right.foodId)
  );
  if (!pantryItems.length || shoppingListSnapshot.length) appendWarning(warnings, "missing_pantry");
  if (days.some((day) => missingMicronutrients(day.totalsSnapshot))) appendWarning(warnings, "unknown_nutrients");

  return {
    durationDays,
    startDate: request.startDate,
    targetSnapshot: { ...request.target },
    filtersSnapshot: {
      includeSnack: request.includeSnack,
      cuisines,
      dietaryTags,
      excludedAllergens,
      seed
    },
    days,
    shoppingListSnapshot,
    warnings,
    algorithmVersion: OFFLINE_MEAL_PLAN_ALGORITHM_VERSION,
    sourcePackVersion
  };
}
