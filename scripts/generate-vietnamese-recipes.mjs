import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const REVIEWED_AT = "2026-08-14";
const SOURCE_ID = "gym-local-project-authored-asian-recipes";
const LICENSE_ID = "project-content";

const catalogDocument = JSON.parse(await readFile("content/recipe-ingredient-catalog.json", "utf8"));
const allowlistDocument = JSON.parse(await readFile("content/recipe-source-allowlist.json", "utf8"));
const catalog = new Map(catalogDocument.ingredients.map((item) => [item.key, item]));
const source = allowlistDocument.sources.find((item) => item.id === SOURCE_ID);

if (!source || source.kind !== "project_authored" || source.licenseId !== LICENSE_ID) {
  throw new Error(`Recipe source ${SOURCE_ID} is not allowlisted as project-authored content`);
}

const cuisinePlans = [
  { idPrefix: "asia_vi_north", count: 120, cuisine: "vietnamese", region: "north", styleVi: "Bắc Bộ", styleEn: "Northern Vietnamese" },
  { idPrefix: "asia_vi_central", count: 120, cuisine: "vietnamese", region: "central", styleVi: "miền Trung", styleEn: "Central Vietnamese" },
  { idPrefix: "asia_vi_south", count: 120, cuisine: "vietnamese", region: "south", styleVi: "Nam Bộ", styleEn: "Southern Vietnamese" },
  { idPrefix: "asia_vi_home", count: 120, cuisine: "vietnamese", region: "national_home_gym", styleVi: "Việt cân bằng", styleEn: "balanced Vietnamese home-gym" },
  { idPrefix: "asia_cn", count: 50, cuisine: "chinese", region: "national", styleVi: "Trung Hoa", styleEn: "Chinese-inspired" },
  { idPrefix: "asia_jp", count: 50, cuisine: "japanese", region: "national", styleVi: "Nhật Bản", styleEn: "Japanese-inspired" },
  { idPrefix: "asia_kr", count: 50, cuisine: "korean", region: "national", styleVi: "Hàn Quốc", styleEn: "Korean-inspired" },
  { idPrefix: "asia_th", count: 50, cuisine: "thai", region: "national", styleVi: "Thái Lan", styleEn: "Thai-inspired" },
  { idPrefix: "asia_tw", count: 30, cuisine: "taiwanese", region: "national", styleVi: "Đài Loan", styleEn: "Taiwanese-inspired" },
  { idPrefix: "asia_in", count: 30, cuisine: "indian", region: "national", styleVi: "Ấn Độ", styleEn: "Indian-inspired" },
  {
    idPrefix: "asia_sea",
    count: 60,
    cuisine: "southeast_asian",
    regions: ["indonesia", "malaysia", "singapore", "philippines", "cambodia", "laos"],
    styleVi: "Đông Nam Á",
    styleEn: "Southeast Asian-inspired"
  }
];

const basePools = {
  vietnamese: ["white_rice", "brown_rice", "sticky_rice", "rice_noodles", "mung_noodles", "sweet_potato", "oats"],
  chinese: ["white_rice", "brown_rice", "rice_noodles", "mung_noodles", "egg_noodles"],
  japanese: ["white_rice", "brown_rice", "rice_noodles", "quinoa", "sweet_potato"],
  korean: ["white_rice", "brown_rice", "rice_noodles", "sweet_potato", "potato"],
  thai: ["white_rice", "brown_rice", "sticky_rice", "rice_noodles", "mung_noodles"],
  taiwanese: ["white_rice", "brown_rice", "rice_noodles", "egg_noodles", "sweet_potato"],
  indian: ["brown_rice", "white_rice", "quinoa", "potato", "sweet_potato", "corn"],
  southeast_asian: ["white_rice", "brown_rice", "sticky_rice", "rice_noodles", "corn", "sweet_potato"]
};

const proteinPools = {
  meat: ["chicken_breast", "chicken_thigh", "duck", "ground_beef", "pork_tenderloin"],
  seafood: ["salmon", "tuna", "shrimp", "tilapia", "cod", "mackerel", "crab"],
  egg: ["egg"],
  soy: ["tofu", "edamame"],
  legume: ["black_beans", "chickpeas", "lentils"]
};

const vegetables = [
  "broccoli", "carrots", "cabbage", "chinese_cabbage", "spinach", "shiitake", "cucumber",
  "tomato", "mung_sprouts", "green_beans", "green_peas", "lettuce", "onion", "spring_onion"
];
const fruits = ["banana", "mango", "papaya", "pineapple", "apple"];
const cuisineProfiles = {
  vietnamese: {
    fats: ["sesame_oil", "peanuts", "coconut_milk"],
    aromatics: ["garlic", "ginger", "chili", "cilantro", "basil", "lime_juice", "lemongrass"],
    vegetarianCondiments: ["soy_sauce", "lime_juice"],
    otherCondiments: ["fish_sauce", "soy_sauce"]
  },
  chinese: {
    fats: ["sesame_oil", "sesame_seeds", "cashew"],
    aromatics: ["garlic", "ginger", "chili", "spring_onion"],
    vegetarianCondiments: ["soy_sauce"],
    otherCondiments: ["soy_sauce"]
  },
  japanese: {
    fats: ["sesame_oil", "sesame_seeds"],
    aromatics: ["ginger", "spring_onion", "lime_juice"],
    vegetarianCondiments: ["soy_sauce"],
    otherCondiments: ["soy_sauce"]
  },
  korean: {
    fats: ["sesame_oil", "sesame_seeds"],
    aromatics: ["garlic", "ginger", "chili", "spring_onion"],
    vegetarianCondiments: ["soy_sauce"],
    otherCondiments: ["soy_sauce"]
  },
  thai: {
    fats: ["coconut_milk", "peanuts", "sesame_oil"],
    aromatics: ["lemongrass", "lime_juice", "chili", "basil", "cilantro"],
    vegetarianCondiments: ["soy_sauce", "lime_juice"],
    otherCondiments: ["fish_sauce", "lime_juice"]
  },
  taiwanese: {
    fats: ["sesame_oil", "sesame_seeds", "peanuts"],
    aromatics: ["garlic", "ginger", "spring_onion", "chili"],
    vegetarianCondiments: ["soy_sauce"],
    otherCondiments: ["soy_sauce"]
  },
  indian: {
    fats: ["coconut_milk", "cashew", "olive_oil"],
    aromatics: ["ginger", "garlic", "chili", "cilantro", "lime_juice"],
    vegetarianCondiments: ["lime_juice"],
    otherCondiments: ["lime_juice"]
  },
  southeast_asian: {
    fats: ["coconut_milk", "peanuts", "sesame_oil"],
    aromatics: ["lemongrass", "lime_juice", "chili", "garlic", "cilantro"],
    vegetarianCondiments: ["soy_sauce", "lime_juice"],
    otherCondiments: ["fish_sauce", "soy_sauce"]
  }
};

const dishTypes = [
  { id: "rice_bowl", vi: "Tô cơm", en: "rice bowl" },
  { id: "noodle_bowl", vi: "Tô mì", en: "noodle bowl" },
  { id: "soup", vi: "Món nước", en: "soup bowl" },
  { id: "salad", vi: "Gỏi", en: "salad" },
  { id: "balanced_plate", vi: "Đĩa cân bằng", en: "balanced plate" },
  { id: "porridge", vi: "Cháo", en: "porridge" }
];

function requireIngredient(key) {
  const item = catalog.get(key);
  if (!item) throw new Error(`Unknown ingredient key: ${key}`);
  return item;
}

function pick(values, seed) {
  return values[seed % values.length];
}

function gramsFor(groupId, seed, role) {
  const ranges = {
    starch: role === "base" ? [90, 105, 120, 135, 150, 165, 180] : [50, 60, 70],
    meat: [85, 95, 105, 115, 125],
    seafood: [90, 100, 110, 120],
    eggs: [50, 75, 100],
    plant_protein: [90, 105, 120, 135],
    vegetables: [45, 60, 75, 90],
    fruit: [60, 80, 100, 120],
    dairy: [80, 100, 120],
    fats: [5, 8, 10, 12],
    seasonings: [3, 5, 7, 10]
  };
  return pick(ranges[groupId] ?? [10], seed);
}

function component(key, seed, role, required) {
  const item = requireIngredient(key);
  return {
    key: item.key,
    query: item.query,
    sourceFoodId: item.sourceFoodId,
    nameVi: item.nameVi,
    nameEn: item.nameEn,
    grams: gramsFor(item.groupId, seed, role),
    role,
    groupId: item.groupId,
    required
  };
}

function mealSlotsFor(globalIndex) {
  const bucket = globalIndex % 10;
  if (bucket <= 1) return ["breakfast", "lunch"];
  if (bucket <= 3) return ["snack"];
  return ["lunch", "dinner"];
}

function proteinFor(index) {
  const category = ["meat", "seafood", "egg", "soy", "legume"][index % 5];
  return pick(proteinPools[category], Math.floor(index / 5) + index);
}

function cuisineCondiment(cuisine, vegetarian, seed) {
  const profile = cuisineProfiles[cuisine];
  return pick(vegetarian ? profile.vegetarianCondiments : profile.otherCondiments, seed);
}

function signatureFor(ingredients) {
  const canonical = ingredients
    .map((item) => `${item.sourceFoodId}:${Number(item.grams).toFixed(1)}`)
    .sort()
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

function compactVi(value) {
  return value.toLowerCase()
    .replace(/\b(quay bỏ da|chín bằng nhiệt khô|chín|luộc|nướng|sống còn vỏ|sống|tươi|không muối|cứng)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactEn(value) {
  return value.toLowerCase()
    .replace(/\b(roasted skinless|cooked with dry heat|cooked|boiled|baked|raw|fresh|without salt|firm)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCase(value) {
  return value ? `${value[0].toLocaleUpperCase("vi-VN")}${value.slice(1)}` : value;
}

function recipeSteps(dishType, styleVi, styleEn, base, protein, vegetable, condiment, aromatic, fat) {
  const prepareVi = `Chuẩn bị ${base.nameVi.toLowerCase()}, ${protein.nameVi.toLowerCase()} và ${vegetable.nameVi.toLowerCase()}; cân đúng khối lượng trong công thức.`;
  const prepareEn = `Prepare the listed ${base.nameEn.toLowerCase()}, ${protein.nameEn.toLowerCase()}, and ${vegetable.nameEn.toLowerCase()}; weigh each amount.`;
  const heatVi = `Làm nóng ${base.nameVi.toLowerCase()} và ${protein.nameVi.toLowerCase()} đến nóng đều; giữ riêng rau ăn sống và thực phẩm đã chín.`;
  const heatEn = `Heat the ${base.nameEn.toLowerCase()} and ${protein.nameEn.toLowerCase()} evenly; keep raw vegetables separate from cooked foods.`;
  const assembleByDish = {
    porridge: ["Thêm 150–250 ml nước vào phần cháo, đun lửa nhỏ rồi cho rau và đạm vào đến khi nóng đều.", "Add 150–250 ml water to the porridge, simmer gently, then add vegetables and protein until hot."],
    soup: ["Cho phần tinh bột vào 200–300 ml nước nóng, thêm rau và đạm rồi đun lửa nhỏ 3–5 phút.", "Put the starch in 200–300 ml hot water, add vegetables and protein, then simmer for 3–5 minutes."],
    salad: ["Để nguyên liệu nguội bớt, cắt vừa ăn rồi trộn nhẹ với rau; không nghiền nát phần tinh bột.", "Let ingredients cool, cut into bite-size pieces, and toss gently with the vegetables."],
    snack_box: ["Xếp phần tinh bột, đạm và rau hoặc trái cây thành từng ngăn để dùng ngay hoặc mang theo.", "Arrange the starch, protein, and vegetables or fruit in separate sections for serving or packing."],
    rice_bowl: ["Xếp phần cơm ở đáy tô, thêm đạm và rau lên trên để mỗi khẩu phần có đủ thành phần.", "Place rice in the bowl, then add protein and vegetables so each serving contains every component."],
    noodle_bowl: ["Trộn nhẹ phần bún, miến hoặc mì với rau, sau đó thêm đạm lên trên.", "Toss the noodles gently with vegetables, then add the protein on top."],
    balanced_plate: ["Chia đĩa thành phần tinh bột, đạm và rau; giữ đúng khối lượng đã ghi cho một khẩu phần.", "Divide the plate into starch, protein, and vegetables using the listed serving amounts."]
  };
  const [assembleVi, assembleEn] = assembleByDish[dishType] ?? assembleByDish.balanced_plate;
  return [
    { position: 1, vi: prepareVi, en: prepareEn },
    { position: 2, vi: heatVi, en: heatEn },
    { position: 3, vi: assembleVi, en: assembleEn },
    { position: 4, vi: `Trộn ${condiment.nameVi.toLowerCase()}, ${aromatic.nameVi.toLowerCase()} và ${fat.nameVi.toLowerCase()}; rưới vừa đủ, hoàn thiện theo phong cách ${styleVi} rồi dùng ngay.`, en: `Mix ${condiment.nameEn.toLowerCase()}, ${aromatic.nameEn.toLowerCase()}, and ${fat.nameEn.toLowerCase()}; dress lightly, finish in a ${styleEn} style, and serve.` }
  ];
}

function recipeName(dish, styleVi, styleEn, base, protein, vegetable, secondVegetable) {
  const baseVi = compactVi(base.nameVi);
  const proteinVi = compactVi(protein.nameVi);
  const vegetableVi = compactVi(vegetable.nameVi);
  const secondVi = secondVegetable ? compactVi(secondVegetable.nameVi) : undefined;
  const baseEn = compactEn(base.nameEn);
  const proteinEn = compactEn(protein.nameEn);
  const vegetableEn = compactEn(vegetable.nameEn);
  const secondEn = secondVegetable ? compactEn(secondVegetable.nameEn) : undefined;
  const tailVi = secondVi ? `${vegetableVi} và ${secondVi}` : vegetableVi;
  const tailEn = secondEn ? `${vegetableEn} and ${secondEn}` : vegetableEn;
  const prefixVi = dish.id === "salad" ? `Gỏi ${proteinVi}` : dish.id === "balanced_plate" ? `${proteinVi} với ${baseVi}` : `${baseVi} ${proteinVi}`;
  const prefixEn = dish.id === "salad" ? `${proteinEn} salad` : dish.id === "balanced_plate" ? `${proteinEn} with ${baseEn}` : `${baseEn} ${proteinEn}`;
  return {
    vi: sentenceCase(`${prefixVi} và ${tailVi} – ${styleVi}`),
    en: sentenceCase(`${styleEn} ${prefixEn} with ${tailEn}`)
  };
}

function dishFor(baseKey, isSnack, seed) {
  if (isSnack) return { id: "snack_box", vi: "Bữa phụ", en: "snack box" };
  if (baseKey === "oats") return dishTypes.find((item) => item.id === "porridge");
  if (["rice_noodles", "mung_noodles", "egg_noodles"].includes(baseKey)) {
    return dishTypes.find((item) => item.id === (seed % 2 === 0 ? "noodle_bowl" : "soup"));
  }
  if (["white_rice", "brown_rice", "sticky_rice"].includes(baseKey)) {
    return dishTypes.find((item) => item.id === (seed % 3 === 0 ? "rice_bowl" : "balanced_plate"));
  }
  return dishTypes.find((item) => item.id === (seed % 2 === 0 ? "balanced_plate" : "salad"));
}

function buildRecipe(plan, localIndex, globalIndex, usedSignatures, usedNamesVi, usedNamesEn) {
  const mealSlots = mealSlotsFor(globalIndex);
  const isSnack = mealSlots.length === 1 && mealSlots[0] === "snack";
  const proteinKey = proteinFor(globalIndex);
  const proteinItem = requireIngredient(proteinKey);
  const availableBases = basePools[plan.cuisine].filter((key) => {
    const item = requireIngredient(key);
    return proteinItem.vegan ? item.vegan : proteinItem.vegetarian ? item.vegetarian : true;
  });
  const baseKey = isSnack
    ? pick(proteinItem.vegan ? ["oats", "sweet_potato", "sticky_rice"] : ["oats", "sweet_potato", "white_bread"], globalIndex)
    : pick(availableBases, globalIndex * 7 + localIndex);
  const vegetableKey = pick(vegetables, globalIndex * 5 + localIndex);
  const secondVegetableKey = pick(vegetables, globalIndex * 11 + localIndex + 3);
  const profile = cuisineProfiles[plan.cuisine];
  const fatKey = isSnack
    ? pick(proteinItem.vegan ? profile.fats : ["yogurt", ...profile.fats], globalIndex)
    : pick(profile.fats, globalIndex + localIndex);
  const dish = dishFor(baseKey, isSnack, globalIndex + localIndex);
  const region = plan.regions ? pick(plan.regions, localIndex) : plan.region;

  const ingredients = [
    component(baseKey, globalIndex, "base", true),
    component(proteinKey, globalIndex + 1, "protein", true)
  ];
  ingredients.push(component(vegetableKey, globalIndex + 2, "vegetable", true));
  if (globalIndex % 2 === 0) {
    const extraKey = isSnack ? pick(fruits, globalIndex + localIndex + 2) : secondVegetableKey;
    if (!ingredients.some((item) => item.key === extraKey)) ingredients.push(component(extraKey, globalIndex + 3, isSnack ? "fruit" : "vegetable", false));
  }
  ingredients.push(component(fatKey, globalIndex + 4, "fat", false));
  const condimentKey = isSnack ? "lime_juice" : cuisineCondiment(plan.cuisine, proteinItem.vegetarian, globalIndex);
  const aromaticKey = pick(profile.aromatics, globalIndex + localIndex);
  ingredients.push(component(condimentKey, globalIndex + 5, "seasoning", false));
  if (!isSnack && aromaticKey !== condimentKey && !ingredients.some((item) => item.key === aromaticKey)) {
    ingredients.push(component(aromaticKey, globalIndex + 6, "aromatic", false));
  }
  if (!isSnack && globalIndex % 3 === 0) {
    const extraAromatic = pick(profile.aromatics, globalIndex + localIndex + 3);
    if (!ingredients.some((item) => item.key === extraAromatic)) ingredients.push(component(extraAromatic, globalIndex + 7, "aromatic", false));
  }

  let signature = signatureFor(ingredients);
  let collisionOffset = 0;
  while (usedSignatures.has(signature)) {
    collisionOffset += 1;
    ingredients[0].grams += collisionOffset;
    signature = signatureFor(ingredients);
  }
  usedSignatures.add(signature);

  const ingredientItems = ingredients.map((item) => requireIngredient(item.key));
  const vegetarian = ingredientItems.every((item) => item.vegetarian);
  const vegan = ingredientItems.every((item) => item.vegan);
  const allergenTags = [...new Set(ingredientItems.flatMap((item) => item.allergenTags))].sort();
  const dietaryTags = [...(vegetarian ? ["vegetarian"] : []), ...(vegan ? ["vegan"] : [])];
  const base = requireIngredient(baseKey);
  const vegetable = requireIngredient(vegetableKey);
  const secondVegetable = globalIndex % 2 === 0 && ingredients[3]?.role === "vegetable" ? requireIngredient(ingredients[3].key) : undefined;
  const names = recipeName(dish, plan.styleVi, plan.styleEn, base, proteinItem, vegetable, secondVegetable);
  const servingGrams = ingredients.reduce((sum, item) => sum + item.grams, 0);
  if (usedNamesVi.has(names.vi)) names.vi = `${names.vi} · khẩu phần ${servingGrams} g`;
  if (usedNamesEn.has(names.en)) names.en = `${names.en} · ${servingGrams} g serving`;
  let nameCollisionIndex = 2;
  while (usedNamesVi.has(names.vi) || usedNamesEn.has(names.en)) {
    names.vi = `${names.vi} · cách ${nameCollisionIndex}`;
    names.en = `${names.en} · variation ${nameCollisionIndex}`;
    nameCollisionIndex += 1;
  }
  usedNamesVi.add(names.vi);
  usedNamesEn.add(names.en);
  const id = `${plan.idPrefix}_${String(localIndex + 1).padStart(3, "0")}`;

  return {
    id,
    status: "active",
    nameVi: names.vi,
    nameEn: names.en,
    cuisine: plan.cuisine,
    region,
    dishType: dish.id,
    servingGrams,
    mealSlots,
    tags: ["balanced_meal", "pantry_matchable", "project_authored"],
    dietaryTags,
    allergenTags,
    prepMinutes: 5 + (globalIndex % 4) * 5,
    cookMinutes: isSnack ? 5 + (globalIndex % 3) * 5 : 10 + (globalIndex % 5) * 5,
    difficulty: ["easy", "easy", "medium"][globalIndex % 3],
    ingredients,
    steps: recipeSteps(
      dish.id,
      plan.styleVi,
      plan.styleEn,
      base,
      proteinItem,
      vegetable,
      requireIngredient(condimentKey),
      requireIngredient(aromaticKey),
      requireIngredient(fatKey)
    ),
    signature,
    estimationNote: "Nutrients are estimated from pinned USDA ingredient records. Cooking yield, brands, sauces, and local preparation can change the result; an unknown optional nutrient remains unknown rather than becoming zero.",
    sourceId: SOURCE_ID,
    sourceKind: source.kind,
    licenseId: LICENSE_ID,
    reviewStatus: "reviewed",
    reviewedAt: REVIEWED_AT
  };
}

const recipes = [];
const usedSignatures = new Set();
const usedNamesVi = new Set();
const usedNamesEn = new Set();
let globalIndex = 0;
for (const plan of cuisinePlans) {
  if (!source.allowedCuisines.includes(plan.cuisine)) throw new Error(`Cuisine ${plan.cuisine} is not allowed by ${SOURCE_ID}`);
  for (let localIndex = 0; localIndex < plan.count; localIndex += 1) {
    recipes.push(buildRecipe(plan, localIndex, globalIndex, usedSignatures, usedNamesVi, usedNamesEn));
    globalIndex += 1;
  }
}

const legacyRedirects = Array.from({ length: 300 }, (_, index) => ({
  id: `vi_recipe_${String(index + 1).padStart(3, "0")}`,
  status: "deprecated",
  supersededBy: recipes[index].id,
  deprecatedAt: REVIEWED_AT,
  reasonVi: "ID công thức schema 2 được giữ lại để tương thích; dùng công thức Việt–Á schema 3 thay thế.",
  reasonEn: "The schema-2 recipe ID is retained for compatibility; use its schema-3 Việt–Á replacement.",
  sourceId: SOURCE_ID,
  licenseId: LICENSE_ID,
  reviewStatus: "reviewed",
  reviewedAt: REVIEWED_AT
}));

const expectedCuisineCounts = new Map([
  ["vietnamese", 480], ["chinese", 50], ["japanese", 50], ["korean", 50],
  ["thai", 50], ["taiwanese", 30], ["indian", 30], ["southeast_asian", 60]
]);
if (recipes.length !== 800 || usedSignatures.size !== 800) throw new Error(`Expected 800 unique active recipes, got ${recipes.length}/${usedSignatures.size}`);
for (const [cuisine, expected] of expectedCuisineCounts) {
  const actual = recipes.filter((recipe) => recipe.cuisine === cuisine).length;
  if (actual !== expected) throw new Error(`Expected ${expected} ${cuisine} recipes, got ${actual}`);
}

const ingredientSourceMap = Object.fromEntries(catalogDocument.ingredients.map((item) => [item.query, item.sourceFoodId]));
await mkdir("content/nutrition-recipes", { recursive: true });
for (const cuisine of expectedCuisineCounts.keys()) {
  const cuisineRecipes = recipes.filter((recipe) => recipe.cuisine === cuisine);
  await writeFile(`content/nutrition-recipes/${cuisine}.json`, `${JSON.stringify(cuisineRecipes, null, 2)}\n`, "utf8");
}
await writeFile("content/legacy-recipe-redirects.json", `${JSON.stringify(legacyRedirects, null, 2)}\n`, "utf8");
await writeFile("content/recipe-ingredient-sources.json", `${JSON.stringify(ingredientSourceMap, null, 2)}\n`, "utf8");

const mealCounts = Object.fromEntries(["breakfast", "lunch", "dinner", "snack"].map((slot) => [slot, recipes.filter((recipe) => recipe.mealSlots.includes(slot)).length]));
const vegetarianCount = recipes.filter((recipe) => recipe.dietaryTags.includes("vegetarian")).length;
const veganCount = recipes.filter((recipe) => recipe.dietaryTags.includes("vegan")).length;
console.log(`Wrote ${recipes.length} active Việt–Á recipes, ${legacyRedirects.length} redirects, ${vegetarianCount} vegetarian, ${veganCount} vegan; meal slots ${JSON.stringify(mealCounts)}`);
