import {
  createId,
  type FoodItem,
  type FoodPreference,
  type Goal,
  type LocalizedText,
  type MealEntry,
  type NutrientProfile,
  type NutritionTarget,
  type Recipe,
  type WaterEntry
} from "@gym/contracts";
import { lookupFoodByBarcode } from "./providers/open-food-facts";

export * from "./offline-pack";
export * from "./menu-suggestions";
export * from "./meal-plans";
export { lookupFoodByBarcode };

export const NUTRITION_FORMULA_VERSION = 1;

export interface NutritionEstimateInput {
  biologicalSex: "female" | "male";
  age: number;
  heightCm: number;
  weightKg: number;
  activityFactor: 1.2 | 1.375 | 1.55 | 1.725 | 1.9;
  goal: Goal;
}

export type NutritionLocale = "vi" | "en";

export interface NutritionValidationError {
  field: "date" | "grams" | "water" | "name" | "calories" | "protein" | "carbs" | "fat";
  code: "required" | "invalid_number" | "out_of_range" | "invalid_date" | "missing_nutrient";
  message: string;
}

export type NutritionValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: NutritionValidationError[] };

export interface FoodLookupCandidate {
  id: string;
  barcode: string;
  name: FoodItem["name"];
  brand?: string;
  servingLabel?: string;
  servingGrams?: number;
  per100g: Partial<NutrientProfile>;
  missingCoreNutrients: Array<"calories" | "protein" | "carbs" | "fat">;
  source: "open_food_facts";
  sourceUrl: string;
  updatedAt: string;
}

export interface CustomFoodDraft {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

const coreNutrients = ["calories", "protein", "carbs", "fat"] as const;

export const OPTIONAL_NUTRIENT_KEYS = [
  "fiber",
  "sugar",
  "sodiumMg",
  "calciumMg",
  "ironMg",
  "potassiumMg",
  "magnesiumMg",
  "zincMg",
  "vitaminAMcg",
  "vitaminCMg",
  "vitaminDMcg",
  "vitaminEMg",
  "vitaminKMcg",
  "vitaminB6Mg",
  "vitaminB12Mcg",
  "folateMcg"
] as const satisfies ReadonlyArray<keyof NutrientProfile>;

export type OptionalNutrientKey = (typeof OPTIONAL_NUTRIENT_KEYS)[number];

export interface NutrientCompleteness {
  available: OptionalNutrientKey[];
  missing: OptionalNutrientKey[];
  availableCount: number;
  totalCount: number;
  percent: number;
  complete: boolean;
}

export interface RecipeNutrition {
  total: NutrientProfile;
  per100g: NutrientProfile;
  perServing?: NutrientProfile;
  completeness: NutrientCompleteness;
}

function validationMessage(locale: NutritionLocale, field: NutritionValidationError["field"], code: NutritionValidationError["code"]): string {
  if (field === "water") {
    const label = locale === "vi" ? "L\u01b0\u1ee3ng n\u01b0\u1edbc" : "Water amount";
    if (code === "required") return locale === "vi" ? `${label} l\u00e0 b\u1eaft bu\u1ed9c.` : `${label} is required.`;
    if (code === "out_of_range") return locale === "vi" ? `${label} n\u1eb1m ngo\u00e0i ph\u1ea1m vi cho ph\u00e9p.` : `${label} is outside the supported range.`;
    return locale === "vi" ? `${label} ph\u1ea3i l\u00e0 m\u1ed9t s\u1ed1 h\u1ee3p l\u1ec7.` : `${label} must be a valid number.`;
  }
  const labels = locale === "vi"
    ? { date: "Ngày", grams: "Khối lượng", name: "Tên thực phẩm", calories: "Năng lượng", protein: "Chất đạm", carbs: "Chất bột đường", fat: "Chất béo" }
    : { date: "Date", grams: "Amount", name: "Food name", calories: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat" };
  if (code === "required") return locale === "vi" ? `${labels[field]} là bắt buộc.` : `${labels[field]} is required.`;
  if (code === "invalid_date") return locale === "vi" ? "Ngày không hợp lệ." : "Enter a valid date.";
  if (code === "missing_nutrient") return locale === "vi" ? `${labels[field]} chưa có từ nguồn dữ liệu. Hãy nhập giá trị trên 100g.` : `${labels[field]} is missing from the source. Enter a per-100g value.`;
  if (code === "out_of_range") return locale === "vi" ? `${labels[field]} nằm ngoài phạm vi cho phép.` : `${labels[field]} is outside the supported range.`;
  return locale === "vi" ? `${labels[field]} phải là một số hợp lệ.` : `${labels[field]} must be a valid number.`;
}

export function parseNutritionNumber(
  raw: string,
  locale: NutritionLocale,
  field: NutritionValidationError["field"],
  options: { min?: number; max?: number; allowZero?: boolean } = {}
): NutritionValidationResult<number> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, errors: [{ field, code: "required", message: validationMessage(locale, field, "required") }] };
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return { ok: false, errors: [{ field, code: "invalid_number", message: validationMessage(locale, field, "invalid_number") }] };
  }
  const value = Number(normalized);
  const min = options.min ?? (options.allowZero ? 0 : Number.MIN_VALUE);
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(value) || value < min || value > max || (!options.allowZero && value === 0)) {
    return { ok: false, errors: [{ field, code: "out_of_range", message: validationMessage(locale, field, "out_of_range") }] };
  }
  return { ok: true, value };
}

export function validateMealInput(
  grams: string,
  date: string,
  locale: NutritionLocale
): NutritionValidationResult<{ grams: number; date: string }> {
  const errors: NutritionValidationError[] = [];
  const parsedGrams = parseNutritionNumber(grams, locale, "grams", { min: 0.1, max: 100_000 });
  if (!parsedGrams.ok) errors.push(...parsedGrams.errors);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && (() => {
    const [year, month, day] = date.split("-").map(Number);
    const value = new Date(Date.UTC(year, month - 1, day));
    return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
  })();
  if (!validDate) errors.push({ field: "date", code: "invalid_date", message: validationMessage(locale, "date", "invalid_date") });
  if (errors.length || !parsedGrams.ok) return { ok: false, errors };
  return { ok: true, value: { grams: parsedGrams.value, date } };
}

export function validateCustomFoodDraft(draft: CustomFoodDraft, locale: NutritionLocale): NutritionValidationResult<FoodItem> {
  const errors: NutritionValidationError[] = [];
  const name = draft.name.trim();
  if (!name) errors.push({ field: "name", code: "required", message: validationMessage(locale, "name", "required") });
  const parsed = {} as Record<(typeof coreNutrients)[number], number>;
  for (const field of coreNutrients) {
    const result = parseNutritionNumber(draft[field], locale, field, { min: 0, max: field === "calories" ? 10_000 : 1_000, allowZero: true });
    if (result.ok) parsed[field] = result.value;
    else errors.push(...result.errors);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: createCustomFood(name, parsed) };
}

export function completeFoodLookupCandidate(
  candidate: FoodLookupCandidate,
  values: Pick<CustomFoodDraft, "calories" | "protein" | "carbs" | "fat">,
  locale: NutritionLocale
): NutritionValidationResult<FoodItem> {
  const parsed = {} as Record<(typeof coreNutrients)[number], number>;
  const errors: NutritionValidationError[] = [];
  for (const field of coreNutrients) {
    const sourceValue = candidate.per100g[field];
    const raw = values[field].trim() || (typeof sourceValue === "number" && Number.isFinite(sourceValue) ? String(sourceValue) : "");
    const result = parseNutritionNumber(raw, locale, field, { min: 0, max: field === "calories" ? 10_000 : 1_000, allowZero: true });
    if (result.ok) parsed[field] = result.value;
    else errors.push({ ...(result.errors[0] ?? { field, code: "missing_nutrient" as const, message: "" }), field, code: raw ? result.errors[0]?.code ?? "invalid_number" : "missing_nutrient", message: raw ? result.errors[0]?.message ?? validationMessage(locale, field, "invalid_number") : validationMessage(locale, field, "missing_nutrient") });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: candidate.id,
      barcode: candidate.barcode,
      name: candidate.name,
      brand: candidate.brand,
      servingLabel: candidate.servingLabel,
      servingGrams: candidate.servingGrams,
      per100g: { ...candidate.per100g, ...parsed },
      source: candidate.source,
      sourceUrl: candidate.sourceUrl,
      dataQuality: candidate.missingCoreNutrients.length ? "partial" : "complete",
      updatedAt: candidate.updatedAt
    }
  };
}

export function estimateNutritionTarget(input: NutritionEstimateInput): NutritionTarget {
  if (input.age < 18 || input.age > 100) throw new Error("Nutrition estimates are available for adults only");
  if (input.heightCm < 120 || input.heightCm > 230 || input.weightKg < 35 || input.weightKg > 350) {
    throw new Error("Profile values are outside the supported estimate range");
  }
  const sexConstant = input.biologicalSex === "male" ? 5 : -161;
  const restingEnergy = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + sexConstant;
  const goalFactor: Record<Goal, number> = {
    fat_loss: 0.9,
    general: 1,
    strength: 1.05,
    hypertrophy: 1.05
  };
  const calories = Math.round(restingEnergy * input.activityFactor * goalFactor[input.goal]);
  const proteinPerKg = input.goal === "general" ? 1.4 : 1.6;
  const protein = Math.round(input.weightKg * proteinPerKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    calories,
    protein,
    carbs,
    fat,
    waterMl: Math.round(input.weightKg * 35),
    formulaVersion: NUTRITION_FORMULA_VERSION,
    source: "estimated",
    basis: { ...input },
    calculatedAt: new Date().toISOString()
  };
}

function sameEstimateBasis(left: NutritionTarget["basis"], right: NutritionEstimateInput): boolean {
  return Boolean(left
    && left.biologicalSex === right.biologicalSex
    && left.age === right.age
    && left.heightCm === right.heightCm
    && left.weightKg === right.weightKg
    && left.activityFactor === right.activityFactor
    && left.goal === right.goal);
}

/** Marks a reviewed target as user-approved without changing any calculated values. */
export function confirmNutritionTarget(target: NutritionTarget, confirmedAt = new Date().toISOString()): NutritionTarget {
  if (!Number.isFinite(Date.parse(confirmedAt))) throw new Error("Invalid nutrition target confirmation date");
  return { ...target, confirmedAt };
}

/**
 * Estimated targets must be reviewed again when formula/profile inputs change.
 * Manual targets only require an explicit confirmation timestamp.
 */
export function nutritionTargetNeedsConfirmation(
  target: NutritionTarget | undefined,
  currentEstimateInput?: NutritionEstimateInput
): boolean {
  if (!target?.confirmedAt) return true;
  if (target.formulaVersion !== NUTRITION_FORMULA_VERSION) return true;
  if (target.calculatedAt && Date.parse(target.confirmedAt) < Date.parse(target.calculatedAt)) return true;
  if (target.source === "estimated") {
    return !currentEstimateInput || !sameEstimateBasis(target.basis, currentEstimateInput);
  }
  return false;
}

function scaledNutrient(value: number | null | undefined, factor: number, precision = 1): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const multiplier = 10 ** precision;
  return Math.round(value * factor * multiplier) / multiplier;
}

export function assessNutrientCompleteness(nutrients: NutrientProfile): NutrientCompleteness {
  const available = OPTIONAL_NUTRIENT_KEYS.filter((key) => {
    const value = nutrients[key];
    return typeof value === "number" && Number.isFinite(value);
  });
  const availableSet = new Set<OptionalNutrientKey>(available);
  const missing = OPTIONAL_NUTRIENT_KEYS.filter((key) => !availableSet.has(key));
  return {
    available,
    missing,
    availableCount: available.length,
    totalCount: OPTIONAL_NUTRIENT_KEYS.length,
    percent: Math.round((available.length / OPTIONAL_NUTRIENT_KEYS.length) * 100),
    complete: missing.length === 0
  };
}

function aggregateNutrients(
  values: Array<{ nutrients: NutrientProfile; factor: number }>
): NutrientProfile {
  const total: NutrientProfile = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const key of coreNutrients) {
    total[key] = values.reduce((sum, value) => {
      const nutrient = value.nutrients[key];
      if (!Number.isFinite(nutrient) || nutrient < 0 || !Number.isFinite(value.factor) || value.factor < 0) {
        throw new Error(`Invalid ${key} value`);
      }
      return sum + nutrient * value.factor;
    }, 0);
  }
  total.calories = Math.round(total.calories);
  total.protein = Math.round(total.protein * 10) / 10;
  total.carbs = Math.round(total.carbs * 10) / 10;
  total.fat = Math.round(total.fat * 10) / 10;

  for (const key of OPTIONAL_NUTRIENT_KEYS) {
    let sum = 0;
    let known = values.length > 0;
    for (const value of values) {
      const nutrient = value.nutrients[key];
      if (nutrient === undefined || nutrient === null) {
        known = false;
        break;
      }
      if (!Number.isFinite(nutrient)) throw new Error(`Invalid ${key} value`);
      sum += nutrient * value.factor;
    }
    total[key] = known ? Math.round(sum * 1000) / 1000 : undefined;
  }
  return total;
}

function scaleNutrientProfile(nutrients: NutrientProfile, factor: number): NutrientProfile {
  const scaled: NutrientProfile = {
    calories: Math.round(nutrients.calories * factor),
    protein: Math.round(nutrients.protein * factor * 10) / 10,
    carbs: Math.round(nutrients.carbs * factor * 10) / 10,
    fat: Math.round(nutrients.fat * factor * 10) / 10
  };
  for (const key of OPTIONAL_NUTRIENT_KEYS) scaled[key] = scaledNutrient(nutrients[key], factor, 3);
  return scaled;
}

export function nutrientsForGrams(food: FoodItem, grams: number): NutrientProfile {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 100_000) throw new Error("Invalid food amount");
  const factor = Math.max(0, grams) / 100;
  return {
    calories: Math.round(food.per100g.calories * factor),
    protein: Math.round(food.per100g.protein * factor * 10) / 10,
    carbs: Math.round(food.per100g.carbs * factor * 10) / 10,
    fat: Math.round(food.per100g.fat * factor * 10) / 10,
    fiber: scaledNutrient(food.per100g.fiber, factor),
    sugar: scaledNutrient(food.per100g.sugar, factor),
    sodiumMg: scaledNutrient(food.per100g.sodiumMg, factor),
    calciumMg: scaledNutrient(food.per100g.calciumMg, factor),
    ironMg: scaledNutrient(food.per100g.ironMg, factor, 2),
    potassiumMg: scaledNutrient(food.per100g.potassiumMg, factor),
    magnesiumMg: scaledNutrient(food.per100g.magnesiumMg, factor),
    zincMg: scaledNutrient(food.per100g.zincMg, factor, 2),
    vitaminAMcg: scaledNutrient(food.per100g.vitaminAMcg, factor),
    vitaminCMg: scaledNutrient(food.per100g.vitaminCMg, factor, 2),
    vitaminDMcg: scaledNutrient(food.per100g.vitaminDMcg, factor, 2),
    vitaminEMg: scaledNutrient(food.per100g.vitaminEMg, factor, 2),
    vitaminKMcg: scaledNutrient(food.per100g.vitaminKMcg, factor, 2),
    vitaminB6Mg: scaledNutrient(food.per100g.vitaminB6Mg, factor, 3),
    vitaminB12Mcg: scaledNutrient(food.per100g.vitaminB12Mcg, factor, 2),
    folateMcg: scaledNutrient(food.per100g.folateMcg, factor)
  };
}

export function createMealEntry(food: FoodItem, grams: number, date: string, meal: MealEntry["meal"]): MealEntry {
  const validated = validateMealInput(String(grams), date, "en");
  if (!validated.ok) throw new Error(validated.errors.map((error) => error.message).join(" "));
  return {
    id: createId("meal"),
    date,
    meal,
    foodId: food.id,
    foodNameSnapshot: food.name,
    grams: validated.value.grams,
    nutrientsSnapshot: nutrientsForGrams(food, validated.value.grams),
    createdAt: new Date().toISOString()
  };
}

export function dailyNutrition(entries: MealEntry[], date: string) {
  return entries.filter((entry) => entry.date === date).reduce(
    (total, entry) => ({
      calories: total.calories + entry.nutrientsSnapshot.calories,
      protein: Math.round((total.protein + entry.nutrientsSnapshot.protein) * 10) / 10,
      carbs: Math.round((total.carbs + entry.nutrientsSnapshot.carbs) * 10) / 10,
      fat: Math.round((total.fat + entry.nutrientsSnapshot.fat) * 10) / 10
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function dailyNutritionWithMicronutrients(entries: MealEntry[], date: string): NutrientProfile {
  return aggregateNutrients(entries
    .filter((entry) => entry.date === date)
    .map((entry) => ({ nutrients: entry.nutrientsSnapshot, factor: 1 })));
}

export interface RecipeIngredientInput {
  food: FoodItem;
  grams: number;
}

export interface CreateRecipeOptions {
  id?: string;
  yieldGrams: number;
  servings?: number;
  createdAt?: string;
  updatedAt?: string;
}

function localizedName(name: string | LocalizedText): LocalizedText {
  if (typeof name !== "string") {
    if (!name.vi.trim() || !name.en.trim()) throw new Error("Recipe name is required in both languages");
    return { vi: name.vi.trim(), en: name.en.trim() };
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Recipe name is required");
  return { vi: trimmed, en: trimmed };
}

export function createRecipe(
  name: string | LocalizedText,
  ingredients: RecipeIngredientInput[],
  options: CreateRecipeOptions
): Recipe {
  if (!ingredients.length) throw new Error("A recipe needs at least one ingredient");
  if (!Number.isFinite(options.yieldGrams) || options.yieldGrams <= 0 || options.yieldGrams > 1_000_000) {
    throw new Error("Invalid recipe yield");
  }
  if (options.servings !== undefined && (!Number.isFinite(options.servings) || options.servings <= 0 || options.servings > 10_000)) {
    throw new Error("Invalid recipe serving count");
  }
  const now = options.updatedAt ?? new Date().toISOString();
  const createdAt = options.createdAt ?? now;
  if (!Number.isFinite(Date.parse(now)) || !Number.isFinite(Date.parse(createdAt))) throw new Error("Invalid recipe date");
  return {
    id: options.id ?? createId("recipe"),
    name: localizedName(name),
    ingredients: ingredients.map(({ food, grams }) => {
      if (!Number.isFinite(grams) || grams <= 0 || grams > 100_000) throw new Error("Invalid recipe ingredient amount");
      return {
        id: createId("ingredient"),
        foodId: food.id,
        foodNameSnapshot: { ...food.name },
        grams,
        nutrientsPer100gSnapshot: { ...food.per100g }
      };
    }),
    yieldGrams: options.yieldGrams,
    servings: options.servings,
    createdAt,
    updatedAt: now
  };
}

export function recipeNutrition(recipe: Recipe): RecipeNutrition {
  if (!Number.isFinite(recipe.yieldGrams) || recipe.yieldGrams <= 0) throw new Error("Invalid recipe yield");
  if (recipe.servings !== undefined && (!Number.isFinite(recipe.servings) || recipe.servings <= 0)) {
    throw new Error("Invalid recipe serving count");
  }
  const total = aggregateNutrients(recipe.ingredients.map((ingredient) => {
    if (!Number.isFinite(ingredient.grams) || ingredient.grams <= 0) throw new Error("Invalid recipe ingredient amount");
    return { nutrients: ingredient.nutrientsPer100gSnapshot, factor: ingredient.grams / 100 };
  }));
  const per100g = scaleNutrientProfile(total, 100 / recipe.yieldGrams);
  const perServing = recipe.servings ? scaleNutrientProfile(total, 1 / recipe.servings) : undefined;
  return { total, per100g, perServing, completeness: assessNutrientCompleteness(per100g) };
}

export function recipeToFoodItem(recipe: Recipe): FoodItem {
  const nutrition = recipeNutrition(recipe);
  return {
    id: recipe.id,
    name: { ...recipe.name },
    servingLabel: recipe.servings ? `1/${recipe.servings}` : undefined,
    servingGrams: recipe.servings ? recipe.yieldGrams / recipe.servings : recipe.yieldGrams,
    per100g: nutrition.per100g,
    source: "custom",
    dataQuality: nutrition.completeness.complete ? "complete" : "partial",
    updatedAt: recipe.updatedAt
  };
}

export function createMealEntryFromRecipe(
  recipe: Recipe,
  grams: number | undefined,
  date: string,
  meal: MealEntry["meal"]
): MealEntry {
  const food = recipeToFoodItem(recipe);
  return createMealEntry(food, grams ?? food.servingGrams ?? recipe.yieldGrams, date, meal);
}

export function createWaterEntry(amountMl: number, date: string, createdAt = new Date().toISOString()): WaterEntry {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
  if (!validDate) throw new Error("Invalid water entry date");
  if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 20_000) throw new Error("Invalid water amount");
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("Invalid water entry timestamp");
  return { id: createId("water"), date, amountMl: Math.round(amountMl), createdAt };
}

export function upsertFoodPreference(
  existing: FoodPreference | undefined,
  foodId: string,
  patch: Partial<Pick<FoodPreference, "favorite" | "defaultServingGrams" | "lastUsedAt" | "useCount">>
): FoodPreference {
  if (!foodId.trim()) throw new Error("Food id is required");
  const defaultServingGrams = patch.defaultServingGrams ?? existing?.defaultServingGrams;
  if (defaultServingGrams !== undefined && (!Number.isFinite(defaultServingGrams) || defaultServingGrams <= 0 || defaultServingGrams > 100_000)) {
    throw new Error("Invalid default serving amount");
  }
  const useCount = patch.useCount ?? existing?.useCount ?? 0;
  if (!Number.isInteger(useCount) || useCount < 0) throw new Error("Invalid food use count");
  const lastUsedAt = patch.lastUsedAt ?? existing?.lastUsedAt;
  if (lastUsedAt && !Number.isFinite(Date.parse(lastUsedAt))) throw new Error("Invalid food use date");
  return {
    id: existing?.id ?? createId("food_preference"),
    foodId,
    favorite: patch.favorite ?? existing?.favorite ?? false,
    defaultServingGrams,
    lastUsedAt,
    useCount
  };
}

export function recordFoodUse(
  existing: FoodPreference | undefined,
  foodId: string,
  options: { usedAt?: string; defaultServingGrams?: number } = {}
): FoodPreference {
  return upsertFoodPreference(existing, foodId, {
    lastUsedAt: options.usedAt ?? new Date().toISOString(),
    defaultServingGrams: options.defaultServingGrams,
    useCount: (existing?.useCount ?? 0) + 1
  });
}

export function rankFoodsByPreference(
  foods: FoodItem[],
  preferences: FoodPreference[],
  locale: NutritionLocale,
  query = ""
): FoodItem[] {
  const preferenceByFoodId = new Map(preferences.map((preference) => [preference.foodId, preference]));
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const visible = normalizedQuery
    ? foods.filter((food) => [food.name.vi, food.name.en, ...(food.aliases ?? []), food.brand ?? ""]
      .some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery)))
    : foods;
  return [...visible].sort((left, right) => {
    const leftPreference = preferenceByFoodId.get(left.id);
    const rightPreference = preferenceByFoodId.get(right.id);
    if (Boolean(leftPreference?.favorite) !== Boolean(rightPreference?.favorite)) return leftPreference?.favorite ? -1 : 1;
    const recent = (rightPreference?.lastUsedAt ?? "").localeCompare(leftPreference?.lastUsedAt ?? "");
    if (recent) return recent;
    const useCount = (rightPreference?.useCount ?? 0) - (leftPreference?.useCount ?? 0);
    if (useCount) return useCount;
    return left.name[locale].localeCompare(right.name[locale], locale);
  });
}

export function normalizeBarcode(value: string): string {
  const barcode = value.replace(/\D/g, "");
  if (barcode.length < 8 || barcode.length > 14) throw new Error("Invalid barcode");
  return barcode;
}

export function findFoodByBarcode(foods: FoodItem[], value: string): FoodItem | undefined {
  const barcode = normalizeBarcode(value);
  return foods.find((food) => food.barcode === barcode);
}

export function createCustomFood(name: string, per100g: FoodItem["per100g"]): FoodItem {
  if (!name.trim()) throw new Error("Food name is required");
  for (const field of coreNutrients) {
    const value = per100g[field];
    if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
  }
  return {
    id: createId("food"),
    name: { vi: name.trim(), en: name.trim() },
    per100g,
    source: "custom",
    dataQuality: "partial",
    updatedAt: new Date().toISOString()
  };
}
