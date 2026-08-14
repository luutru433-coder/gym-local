import { readFile } from "node:fs/promises";

const dictionary = JSON.parse(await readFile("content/vietnamese-food-dictionary.json", "utf8"));
const recipes = JSON.parse(await readFile("content/vietnamese-recipes.json", "utf8"));
const foodGroups = JSON.parse(await readFile("content/food-groups.json", "utf8"));
const manifest = JSON.parse(await readFile("public/nutrition-pack-manifest.json", "utf8"));
const foodGroupIds = new Set(foodGroups.map((group) => group.id));
const recipeIds = new Set(recipes.map((recipe) => recipe.id));
const allowedMealSlots = new Set(["breakfast", "lunch", "dinner", "snack"]);

const checks = [
  ["Vietnamese dictionary", Object.keys(dictionary).length >= 100],
  ["Ten stable food groups", foodGroups.length === 10 && foodGroupIds.size === 10 && foodGroups.every((group) => /^[a-z][a-z0-9_]*$/.test(group.id) && group.nameVi && group.nameEn && group.descriptionVi && group.descriptionEn)],
  ["Exactly 300 recipe estimates", recipes.length === 300 && recipeIds.size === 300],
  ["Recipe ingredient provenance", recipes.every((recipe) => recipe.ingredients?.length === 4 && recipe.estimationNote && recipe.sourceId === "gym-local-vietnamese-recipes" && /^\d{4}-\d{2}-\d{2}$/.test(recipe.reviewedAt))],
  ["Recipe ingredient groups", recipes.every((recipe) => recipe.ingredients.every((ingredient) => foodGroupIds.has(ingredient.groupId) && ingredient.query && /^usda_\d+$/.test(ingredient.sourceFoodId) && ingredient.grams > 0 && ingredient.role && typeof ingredient.required === "boolean"))],
  ["Recipe serving totals", recipes.every((recipe) => Math.abs(recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0) - recipe.servingGrams) < 0.01)],
  ["Recipe menu metadata", recipes.every((recipe) => recipe.mealSlots?.length > 0 && recipe.mealSlots.every((slot) => allowedMealSlots.has(slot)) && Array.isArray(recipe.tags) && Array.isArray(recipe.dietaryTags) && Array.isArray(recipe.allergenTags))],
  ["Pack schema", manifest.id === "gym-local-nutrition" && manifest.schemaVersion === 2],
  ["Pack checksum metadata", /^[a-f0-9]{64}$/.test(manifest.sha256) && manifest.sizeBytes > 0],
  ["Pack coverage metadata", manifest.foodCount >= 10_000 && manifest.aliasCount >= 2_000 && manifest.vietnameseRecipeCount === 300 && manifest.foodGroupCount === 10 && manifest.recipeIngredientCount === 1200],
  ["Declared source licenses", manifest.sources?.length >= 4 && manifest.sources.every((source) => source.url?.startsWith("https://") && source.licenseId && source.licenseUrl?.startsWith("https://"))],
  ["No unresolved placeholders", !JSON.stringify(manifest).includes("__OWNER__")]
];

for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
