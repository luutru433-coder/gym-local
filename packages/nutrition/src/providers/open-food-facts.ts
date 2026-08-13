import { z } from "zod";
import type { FoodLookupCandidate } from "../index";

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

const coreNutrients = ["calories", "protein", "carbs", "fat"] as const;

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
