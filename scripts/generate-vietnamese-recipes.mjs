import { writeFile } from "node:fs/promises";

const bases = [
  ["Cơm trắng", "White rice bowl", "rice, white, cooked", 150],
  ["Cơm gạo lứt", "Brown rice bowl", "rice, brown, cooked", 150],
  ["Cơm tấm", "Broken rice plate", "rice, white, cooked", 150],
  ["Xôi", "Sticky rice bowl", "rice, glutinous, cooked", 150],
  ["Bún", "Rice vermicelli bowl", "rice noodles, cooked", 160],
  ["Phở", "Pho noodle bowl", "rice noodles, cooked", 160],
  ["Hủ tiếu", "Rice noodle soup bowl", "rice noodles, cooked", 160],
  ["Miến", "Glass noodle bowl", "mung bean noodles, cooked", 160],
  ["Mì trứng", "Egg noodle bowl", "egg noodles, cooked", 160],
  ["Nui", "Macaroni bowl", "macaroni, cooked", 160],
  ["Cháo", "Rice porridge", "rice, white, cooked", 90],
  ["Khoai lang", "Sweet potato plate", "sweet potato, cooked", 180],
  ["Bánh mì", "Vietnamese bread plate", "bread, white", 100],
  ["Bánh cuốn", "Steamed rice roll plate", "rice noodles, cooked", 170],
  ["Gỏi rau", "Vietnamese salad", "lettuce, raw", 140]
];

const proteins = [
  ["ức gà nướng", "grilled chicken breast", "chicken breast, roasted", 110],
  ["bò xào", "stir-fried beef", "beef, cooked", 100],
  ["thịt heo luộc", "boiled pork", "pork loin, cooked", 100],
  ["cá hồi áp chảo", "pan-seared salmon", "salmon, cooked", 100],
  ["cá ngừ", "tuna", "tuna, cooked", 100],
  ["tôm hấp", "steamed shrimp", "shrimp, cooked", 100],
  ["trứng luộc", "boiled egg", "egg, whole, cooked", 100],
  ["đậu hũ", "tofu", "tofu, firm", 120],
  ["cá rô phi hấp", "steamed tilapia", "tilapia, cooked", 100],
  ["đậu đen", "black beans", "black beans, cooked", 120]
];

const vegetables = [
  ["rau cải", "greens", "broccoli, cooked", 80],
  ["rau củ", "vegetables", "carrots, cooked", 80]
];

const recipes = [];
for (const [baseVi, baseEn, baseQuery, baseGrams] of bases) {
  for (const [proteinVi, proteinEn, proteinQuery, proteinGrams] of proteins) {
    for (const [vegetableVi, vegetableEn, vegetableQuery, vegetableGrams] of vegetables) {
      const id = `vi_recipe_${String(recipes.length + 1).padStart(3, "0")}`;
      recipes.push({
        id,
        nameVi: `${baseVi} ${proteinVi} ${vegetableVi}`,
        nameEn: `${baseEn} with ${proteinEn} and ${vegetableEn}`,
        servingGrams: baseGrams + proteinGrams + vegetableGrams + 5,
        ingredients: [
          { query: baseQuery, grams: baseGrams },
          { query: proteinQuery, grams: proteinGrams },
          { query: vegetableQuery, grams: vegetableGrams },
          { query: "vegetable oil", grams: 5 }
        ],
        estimationNote: "Nutrients are estimated from USDA ingredient records; cooking yield and local recipes vary."
      });
    }
  }
}

if (recipes.length !== 300) throw new Error(`Expected 300 recipes, got ${recipes.length}`);
await writeFile("content/vietnamese-recipes.json", `${JSON.stringify(recipes, null, 2)}\n`, "utf8");
console.log(`Wrote ${recipes.length} Vietnamese recipe estimates`);
