import { readFile, readdir } from "node:fs/promises";

const dictionary = JSON.parse(await readFile("content/vietnamese-food-dictionary.json", "utf8"));
const recipeFiles = (await readdir("content/nutrition-recipes"))
  .filter((name) => name.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right));
const recipes = (await Promise.all(recipeFiles.map(async (name) =>
  JSON.parse(await readFile(`content/nutrition-recipes/${name}`, "utf8"))
))).flat();
const redirects = JSON.parse(await readFile("content/legacy-recipe-redirects.json", "utf8"));
const catalogDocument = JSON.parse(await readFile("content/recipe-ingredient-catalog.json", "utf8"));
const sourceAllowlist = JSON.parse(await readFile("content/recipe-source-allowlist.json", "utf8"));
const ingredientSourceMap = JSON.parse(await readFile("content/recipe-ingredient-sources.json", "utf8"));
const foodGroups = JSON.parse(await readFile("content/food-groups.json", "utf8"));
const manifest = JSON.parse(await readFile("public/nutrition-pack-manifest.json", "utf8"));

const expectedCuisineCounts = {
  vietnamese: 480,
  chinese: 50,
  japanese: 50,
  korean: 50,
  thai: 50,
  taiwanese: 30,
  indian: 30,
  southeast_asian: 60
};
const expectedVietnameseRegions = { north: 120, central: 120, south: 120, national_home_gym: 120 };
const expectedOtherSeaRegions = { indonesia: 10, malaysia: 10, singapore: 10, philippines: 10, cambodia: 10, laos: 10 };
const expectedMealSlotCounts = { breakfast: 160, lunch: 640, dinner: 480, snack: 160 };
const allowedMealSlots = new Set(Object.keys(expectedMealSlotCounts));
const allowedDifficulties = new Set(["easy", "medium", "hard"]);
const foodGroupIds = new Set(foodGroups.map((group) => group.id));
const recipeIds = new Set(recipes.map((recipe) => recipe.id));
const recipeNamesVi = new Set(recipes.map((recipe) => recipe.nameVi));
const recipeNamesEn = new Set(recipes.map((recipe) => recipe.nameEn));
const catalogByKey = new Map(catalogDocument.ingredients.map((item) => [item.key, item]));
const sourceById = new Map(sourceAllowlist.sources.map((source) => [source.id, source]));

function countBy(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sameStringSet(left, right) {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

function sameCountMap(left, right) {
  const normalize = (value) => Object.fromEntries(Object.entries(value).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function validIngredientCatalog() {
  const keys = new Set();
  const queries = new Set();
  const sourceIds = new Set();
  return catalogDocument.schemaVersion === 1
    && catalogDocument.licenseId === "CC0-1.0"
    && /^\d{4}-\d{2}-\d{2}$/.test(catalogDocument.reviewedAt)
    && catalogDocument.ingredients.length >= 50
    && catalogDocument.ingredients.every((item) => {
      const valid = /^[a-z][a-z0-9_]*$/.test(item.key)
        && item.query && /^usda_\d+$/.test(item.sourceFoodId)
        && item.nameVi && item.nameEn
        && foodGroupIds.has(item.groupId)
        && typeof item.vegetarian === "boolean"
        && typeof item.vegan === "boolean"
        && (!item.vegan || item.vegetarian)
        && Array.isArray(item.allergenTags)
        && !keys.has(item.key) && !queries.has(item.query) && !sourceIds.has(item.sourceFoodId);
      keys.add(item.key);
      queries.add(item.query);
      sourceIds.add(item.sourceFoodId);
      return valid;
    });
}

function validRecipe(recipe) {
  const source = sourceById.get(recipe.sourceId);
  const catalogItems = recipe.ingredients.map((ingredient) => catalogByKey.get(ingredient.key));
  if (catalogItems.some((item) => !item)) return false;
  const expectedAllergens = sortedUnique(catalogItems.flatMap((item) => item.allergenTags));
  const expectedVegetarian = catalogItems.every((item) => item.vegetarian);
  const expectedVegan = catalogItems.every((item) => item.vegan);
  const expectedDietary = [...(expectedVegetarian ? ["vegetarian"] : []), ...(expectedVegan ? ["vegan"] : [])];
  const ingredientKeys = new Set(recipe.ingredients.map((ingredient) => ingredient.key));
  const requiredCount = recipe.ingredients.filter((ingredient) => ingredient.required).length;
  return recipe.status === "active"
    && /^[a-z][a-z0-9_]+_\d{3}$/.test(recipe.id)
    && !/^vi_recipe_\d{3}$/.test(recipe.id)
    && recipe.nameVi && recipe.nameEn
    && source?.kind === "project_authored"
    && source.licenseId === recipe.licenseId
    && source.allowedCuisines.includes(recipe.cuisine)
    && recipe.sourceKind === "project_authored"
    && recipe.licenseId === "project-content"
    && recipe.reviewStatus === "reviewed"
    && /^\d{4}-\d{2}-\d{2}$/.test(recipe.reviewedAt)
    && recipe.region && recipe.dishType
    && Number.isInteger(recipe.prepMinutes) && recipe.prepMinutes >= 0
    && Number.isInteger(recipe.cookMinutes) && recipe.cookMinutes >= 0
    && allowedDifficulties.has(recipe.difficulty)
    && /^[a-f0-9]{64}$/.test(recipe.signature)
    && recipe.estimationNote
    && recipe.ingredients.length >= 4 && recipe.ingredients.length <= 8
    && ingredientKeys.size === recipe.ingredients.length
    && requiredCount >= 3
    && recipe.ingredients.every((ingredient, index) => {
      const item = catalogItems[index];
      return item
        && ingredient.query === item.query
        && ingredient.sourceFoodId === item.sourceFoodId
        && ingredient.nameVi === item.nameVi
        && ingredient.nameEn === item.nameEn
        && ingredient.groupId === item.groupId
        && ingredient.grams > 0
        && ingredient.role
        && typeof ingredient.required === "boolean";
    })
    && Math.abs(recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0) - recipe.servingGrams) < 0.01
    && recipe.mealSlots.length > 0
    && recipe.mealSlots.every((slot) => allowedMealSlots.has(slot))
    && Array.isArray(recipe.tags) && recipe.tags.includes("pantry_matchable")
    && sameStringSet(recipe.dietaryTags, expectedDietary)
    && sameStringSet(recipe.allergenTags, expectedAllergens)
    && recipe.steps.length === 4
    && recipe.steps.every((step, index) => step.position === index + 1 && step.vi && step.en);
}

const cuisineCounts = countBy(recipes.map((recipe) => recipe.cuisine));
const vietnameseRegionCounts = countBy(recipes.filter((recipe) => recipe.cuisine === "vietnamese").map((recipe) => recipe.region));
const otherSeaRegionCounts = countBy(recipes.filter((recipe) => recipe.cuisine === "southeast_asian").map((recipe) => recipe.region));
const mealSlotCounts = Object.fromEntries([...allowedMealSlots].map((slot) => [slot, recipes.filter((recipe) => recipe.mealSlots.includes(slot)).length]));
const recipeIngredientCount = recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
const recipeStepCount = recipes.reduce((sum, recipe) => sum + recipe.steps.length, 0);
const vegetarianCount = recipes.filter((recipe) => recipe.dietaryTags.includes("vegetarian")).length;
const veganCount = recipes.filter((recipe) => recipe.dietaryTags.includes("vegan")).length;
const signatures = new Set(recipes.map((recipe) => recipe.signature));
const expectedLegacyIds = new Set(Array.from({ length: 300 }, (_, index) => `vi_recipe_${String(index + 1).padStart(3, "0")}`));
const redirectIds = new Set(redirects.map((redirect) => redirect.id));

const checks = [
  ["Vietnamese dictionary", Object.keys(dictionary).length >= 100],
  ["Ten stable food groups", foodGroups.length === 10 && foodGroupIds.size === 10 && foodGroups.every((group) => /^[a-z][a-z0-9_]*$/.test(group.id) && group.nameVi && group.nameEn && group.descriptionVi && group.descriptionEn)],
  ["Reviewed pinned ingredient catalog", validIngredientCatalog()],
  ["Pinned source map matches catalog", Object.keys(ingredientSourceMap).length === catalogDocument.ingredients.length && catalogDocument.ingredients.every((item) => ingredientSourceMap[item.query] === item.sourceFoodId)],
  ["Project-authored source allowlist", sourceAllowlist.schemaVersion === 1 && sourceAllowlist.externalImports.length === 0 && sourceAllowlist.sources.length === 1 && sourceAllowlist.sources[0].reviewStatus === "reviewed"],
  ["Exactly 800 active recipes", recipes.length === 800 && recipeIds.size === 800],
  ["Cuisine content is independently split", recipeFiles.length === 8 && recipeFiles.every((name) => recipes.filter((recipe) => `${recipe.cuisine}.json` === name).length > 0)],
  ["Unique bilingual recipe names", recipeNamesVi.size === 800 && recipeNamesEn.size === 800],
  ["Recipe schema, provenance, and ingredients", recipes.every(validRecipe)],
  ["Unique active ingredient signatures", signatures.size === 800],
  ["Exact cuisine coverage", sameCountMap(cuisineCounts, expectedCuisineCounts)],
  ["Exact Vietnamese regional coverage", sameCountMap(vietnameseRegionCounts, expectedVietnameseRegions)],
  ["Exact Southeast Asian regional coverage", sameCountMap(otherSeaRegionCounts, expectedOtherSeaRegions)],
  ["Meal-slot coverage", sameCountMap(mealSlotCounts, expectedMealSlotCounts)],
  ["Vegetarian and vegan coverage", vegetarianCount >= 160 && veganCount >= 80],
  ["Exactly 300 immutable legacy redirects", redirects.length === 300 && redirectIds.size === 300 && [...expectedLegacyIds].every((id) => redirectIds.has(id)) && redirects.every((redirect) => redirect.status === "deprecated" && recipeIds.has(redirect.supersededBy) && redirect.sourceId === "gym-local-project-authored-asian-recipes" && redirect.licenseId === "project-content" && redirect.reviewStatus === "reviewed")],
  ["Pack schema", manifest.id === "gym-local-nutrition" && manifest.schemaVersion === 3 && manifest.version === "2026.08.1"],
  ["Pack checksum metadata", /^[a-f0-9]{64}$/.test(manifest.sha256) && manifest.sizeBytes > 0],
  ["Pack coverage metadata", manifest.foodCount >= 10_000 && manifest.aliasCount >= 2_000 && manifest.vietnameseDisplayFoodCount >= 10_000 && manifest.vietnameseRecipeCount === 480 && manifest.activeRecipeCount === 800 && manifest.deprecatedRecipeCount === 300 && manifest.recipeRedirectCount === 300 && manifest.foodGroupCount === 10 && manifest.recipeIngredientCount === recipeIngredientCount && manifest.recipeStepCount === recipeStepCount && manifest.uniqueRecipeSignatureCount === 800 && manifest.vegetarianRecipeCount === vegetarianCount && manifest.veganRecipeCount === veganCount],
  ["Manifest corpus counts", sameCountMap(manifest.cuisineCounts, expectedCuisineCounts) && sameCountMap(manifest.mealSlotCounts, expectedMealSlotCounts)],
  ["Declared source licenses", manifest.sources?.length >= 4 && manifest.sources.every((source) => source.url?.startsWith("https://") && source.licenseId && source.licenseUrl?.startsWith("https://"))],
  ["No unresolved placeholders", !JSON.stringify(manifest).includes("__OWNER__")]
];

for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
