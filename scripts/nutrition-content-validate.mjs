import { readFile } from "node:fs/promises";

const dictionary = JSON.parse(await readFile("content/vietnamese-food-dictionary.json", "utf8"));
const recipes = JSON.parse(await readFile("content/vietnamese-recipes.json", "utf8"));
const manifest = JSON.parse(await readFile("public/nutrition-pack-manifest.json", "utf8"));

const checks = [
  ["Vietnamese dictionary", Object.keys(dictionary).length >= 100],
  ["Exactly 300 recipe estimates", recipes.length === 300 && new Set(recipes.map((recipe) => recipe.id)).size === 300],
  ["Recipe ingredient provenance", recipes.every((recipe) => recipe.ingredients?.length >= 3 && recipe.estimationNote)],
  ["Pack schema", manifest.id === "gym-local-nutrition" && manifest.schemaVersion === 1],
  ["Pack checksum metadata", /^[a-f0-9]{64}$/.test(manifest.sha256) && manifest.sizeBytes > 0],
  ["Pack coverage metadata", manifest.foodCount >= 10_000 && manifest.aliasCount >= 2_000 && manifest.vietnameseRecipeCount === 300],
  ["Declared source licenses", manifest.sources?.length >= 4 && manifest.sources.every((source) => source.url?.startsWith("https://") && source.licenseId && source.licenseUrl?.startsWith("https://"))],
  ["No unresolved placeholders", !JSON.stringify(manifest).includes("__OWNER__")]
];

for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
