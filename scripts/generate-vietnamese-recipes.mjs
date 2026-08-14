import { readFile, writeFile } from "node:fs/promises";

const ingredientSources = JSON.parse(await readFile("content/recipe-ingredient-sources.json", "utf8"));

function ingredient(query, grams, role, groupId, required) {
  const sourceFoodId = ingredientSources[query];
  if (!sourceFoodId) throw new Error(`Missing pinned ingredient source for ${query}`);
  return { query, sourceFoodId, grams, role, groupId, required };
}

const bases = [
  ["Cơm trắng", "White rice bowl", "rice, white, cooked", 150, ["lunch", "dinner"], []],
  ["Cơm gạo lứt", "Brown rice bowl", "rice, brown, cooked", 150, ["lunch", "dinner"], []],
  ["Cơm tấm", "Broken rice plate", "rice, white, cooked", 150, ["lunch", "dinner"], []],
  ["Xôi", "Sticky rice bowl", "rice, glutinous, cooked", 150, ["breakfast", "lunch"], []],
  ["Bún", "Rice vermicelli bowl", "rice noodles, cooked", 160, ["breakfast", "lunch", "dinner"], []],
  ["Phở", "Pho noodle bowl", "rice noodles, cooked", 160, ["breakfast", "lunch", "dinner"], []],
  ["Hủ tiếu", "Rice noodle soup bowl", "rice noodles, cooked", 160, ["breakfast", "lunch", "dinner"], []],
  ["Miến", "Glass noodle bowl", "mung bean noodles, cooked", 160, ["lunch", "dinner"], []],
  ["Mì trứng", "Egg noodle bowl", "egg noodles, cooked", 160, ["breakfast", "lunch", "dinner"], ["egg", "gluten"]],
  ["Nui", "Macaroni bowl", "macaroni, cooked", 160, ["breakfast", "lunch", "dinner"], ["gluten"]],
  ["Cháo", "Rice porridge", "rice, white, cooked", 90, ["breakfast", "lunch", "dinner"], []],
  ["Khoai lang", "Sweet potato plate", "sweet potato, cooked", 180, ["breakfast", "lunch", "dinner"], []],
  ["Bánh mì", "Vietnamese bread plate", "bread, white", 100, ["breakfast", "lunch"], ["gluten"]],
  ["Bánh cuốn", "Steamed rice roll plate", "rice noodles, cooked", 170, ["breakfast", "lunch"], []],
  ["Gỏi rau", "Vietnamese salad", "lettuce, raw", 140, ["lunch", "dinner"], []]
];

const proteins = [
  ["ức gà nướng", "grilled chicken breast", "chicken breast, roasted", 110, "meat", [], []],
  ["bò xào", "stir-fried beef", "beef, cooked", 100, "meat", [], []],
  ["thịt heo luộc", "boiled pork", "pork loin, cooked", 100, "meat", [], []],
  ["cá hồi áp chảo", "pan-seared salmon", "salmon, cooked", 100, "seafood", ["fish"], []],
  ["cá ngừ", "tuna", "tuna, cooked", 100, "seafood", ["fish"], []],
  ["tôm hấp", "steamed shrimp", "shrimp, cooked", 100, "seafood", ["shellfish"], []],
  ["trứng luộc", "boiled egg", "egg, whole, cooked", 100, "eggs", ["egg"], ["vegetarian"]],
  ["đậu hũ", "tofu", "tofu, firm", 120, "plant_protein", ["soy"], ["vegetarian"]],
  ["cá rô phi hấp", "steamed tilapia", "tilapia, cooked", 100, "seafood", ["fish"], []],
  ["đậu đen", "black beans", "black beans, cooked", 120, "plant_protein", [], ["vegetarian"]]
];

const vegetables = [
  ["rau cải", "greens", "broccoli, cooked", 80],
  ["rau củ", "vegetables", "carrots, cooked", 80]
];

const recipes = [];
for (const [baseVi, baseEn, baseQuery, baseGrams, mealSlots, baseAllergens] of bases) {
  for (const [proteinVi, proteinEn, proteinQuery, proteinGrams, proteinGroup, proteinAllergens, dietaryTags] of proteins) {
    for (const [vegetableVi, vegetableEn, vegetableQuery, vegetableGrams] of vegetables) {
      const id = `vi_recipe_${String(recipes.length + 1).padStart(3, "0")}`;
      recipes.push({
        id,
        nameVi: `${baseVi} ${proteinVi} ${vegetableVi}`,
        nameEn: `${baseEn} with ${proteinEn} and ${vegetableEn}`,
        servingGrams: baseGrams + proteinGrams + vegetableGrams + 5,
        mealSlots,
        tags: ["balanced_meal", "high_protein"],
        dietaryTags,
        allergenTags: [...new Set([...baseAllergens, ...proteinAllergens])],
        ingredients: [
          ingredient(baseQuery, baseGrams, "base", "starch", true),
          ingredient(proteinQuery, proteinGrams, "protein", proteinGroup, true),
          ingredient(vegetableQuery, vegetableGrams, "vegetable", "vegetables", true),
          ingredient("vegetable oil", 5, "fat", "fats", false)
        ],
        estimationNote: "Nutrients are estimated from USDA ingredient records; cooking yield and local recipes vary.",
        sourceId: "gym-local-vietnamese-recipes",
        reviewedAt: "2026-08-14"
      });
    }
  }
}

if (recipes.length !== 300) throw new Error(`Expected 300 recipes, got ${recipes.length}`);
await writeFile("content/vietnamese-recipes.json", `${JSON.stringify(recipes, null, 2)}\n`, "utf8");
console.log(`Wrote ${recipes.length} Vietnamese recipe estimates`);
