import { createId, type FoodItem, type Goal, type MealEntry, type NutrientProfile, type NutritionTarget } from "@gym/contracts";
import { z } from "zod";

export * from "./offline-pack";

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
  field: "date" | "grams" | "name" | "calories" | "protein" | "carbs" | "fat";
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

function validationMessage(locale: NutritionLocale, field: NutritionValidationError["field"], code: NutritionValidationError["code"]): string {
  const labels = locale === "vi"
    ? { date: "Ngày", grams: "Khối lượng", name: "Tên thực phẩm", calories: "Calories", protein: "Protein", carbs: "Carb", fat: "Fat" }
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
    formulaVersion: NUTRITION_FORMULA_VERSION
  };
}

function scaledNutrient(value: number | null | undefined, factor: number, precision = 1): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const multiplier = 10 ** precision;
  return Math.round(value * factor * multiplier) / multiplier;
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

const openFoodFactsSchema = z.object({
  status: z.number().optional(),
  product: z.object({
    code: z.string().optional(),
    product_name: z.string().optional(),
    product_name_vi: z.string().optional(),
    product_name_en: z.string().optional(),
    brands: z.string().optional(),
    serving_size: z.string().optional(),
    serving_quantity: z.number().optional(),
    nutriments: z.record(z.string(), z.unknown()).optional()
  }).optional()
});

function nutrientValue(nutriments: Record<string, unknown>, key: string, multiplier = 1): number | null {
  const value = nutriments[`${key}_100g`];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value * multiplier : null;
}

export async function lookupFoodByBarcode(barcode: string, signal?: AbortSignal): Promise<FoodLookupCandidate | undefined> {
  const normalized = barcode.replace(/\D/g, "");
  if (normalized.length < 8 || normalized.length > 14) throw new Error("Invalid barcode");
  const fields = "code,product_name,product_name_vi,product_name_en,brands,serving_size,serving_quantity,nutriments";
  const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${normalized}?fields=${fields}`, { signal });
  if (response.status === 404) return undefined;
  if (response.status === 429) throw new Error("Open Food Facts rate limit reached");
  if (!response.ok) throw new Error("Food lookup is unavailable");
  const result = openFoodFactsSchema.parse(await response.json());
  const product = result.product;
  if (!product) return undefined;
  const nutriments = product.nutriments ?? {};
  const nameEn = product.product_name_en || product.product_name || `Product ${normalized}`;
  const nameVi = product.product_name_vi || product.product_name || nameEn;
  const calories = nutrientValue(nutriments, "energy-kcal");
  const protein = nutrientValue(nutriments, "proteins");
  const carbs = nutrientValue(nutriments, "carbohydrates");
  const fat = nutrientValue(nutriments, "fat");
  const missingCoreNutrients = coreNutrients.filter((field) => ({ calories, protein, carbs, fat })[field] === null);
  return {
    id: `off_${normalized}`,
    barcode: normalized,
    name: { vi: nameVi, en: nameEn },
    brand: product.brands,
    servingLabel: product.serving_size,
    servingGrams: product.serving_quantity,
    per100g: {
      calories: calories ?? undefined,
      protein: protein ?? undefined,
      carbs: carbs ?? undefined,
      fat: fat ?? undefined,
      fiber: nutrientValue(nutriments, "fiber"),
      sugar: nutrientValue(nutriments, "sugars"),
      sodiumMg: nutrientValue(nutriments, "sodium", 1000),
      calciumMg: nutrientValue(nutriments, "calcium", 1000),
      ironMg: nutrientValue(nutriments, "iron", 1000),
      potassiumMg: nutrientValue(nutriments, "potassium", 1000),
      magnesiumMg: nutrientValue(nutriments, "magnesium", 1000),
      zincMg: nutrientValue(nutriments, "zinc", 1000),
      vitaminAMcg: nutrientValue(nutriments, "vitamin-a", 1_000_000),
      vitaminCMg: nutrientValue(nutriments, "vitamin-c", 1000),
      vitaminDMcg: nutrientValue(nutriments, "vitamin-d", 1_000_000),
      vitaminEMg: nutrientValue(nutriments, "vitamin-e", 1000),
      vitaminKMcg: nutrientValue(nutriments, "vitamin-k", 1_000_000),
      vitaminB6Mg: nutrientValue(nutriments, "vitamin-b6", 1000),
      vitaminB12Mcg: nutrientValue(nutriments, "vitamin-b12", 1_000_000),
      folateMcg: nutrientValue(nutriments, "folates", 1_000_000)
    },
    missingCoreNutrients,
    source: "open_food_facts",
    sourceUrl: `https://world.openfoodfacts.org/product/${normalized}`,
    updatedAt: new Date().toISOString()
  };
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
