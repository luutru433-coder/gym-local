#!/usr/bin/env python3
"""Verify a schema-3 Gym Local nutrition pack before publishing it."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import unicodedata
from pathlib import Path


EXPECTED_CUISINES = {
    "vietnamese": 480,
    "chinese": 50,
    "japanese": 50,
    "korean": 50,
    "thai": 50,
    "taiwanese": 30,
    "indian": 30,
    "southeast_asian": 60,
}
EXPECTED_REGIONS = {
    "north": 120,
    "central": 120,
    "south": 120,
    "national_home_gym": 120,
    "national": 260,
    "indonesia": 10,
    "malaysia": 10,
    "singapore": 10,
    "philippines": 10,
    "cambodia": 10,
    "laos": 10,
}
EXPECTED_MEAL_SLOTS = {"breakfast": 160, "lunch": 640, "dinner": 480, "snack": 160}


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def normalized_tokens(value: str) -> set[str]:
    normalized = unicodedata.normalize("NFD", value.casefold())
    ascii_value = "".join(character for character in normalized if unicodedata.category(character) != "Mn")
    ascii_value = ascii_value.replace("đ", "d")
    return {token for token in re.findall(r"[a-z]+", ascii_value) if len(token) >= 4}


parser = argparse.ArgumentParser()
parser.add_argument("--db", type=Path, required=True)
parser.add_argument("--manifest", type=Path, required=True)
parser.add_argument("--ingredient-catalog", type=Path, default=Path("content/recipe-ingredient-catalog.json"))
args = parser.parse_args()

manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
catalog = json.loads(args.ingredient_catalog.read_text(encoding="utf-8"))
assert args.db.stat().st_size == manifest["sizeBytes"], "manifest byte size mismatch"
assert digest(args.db) == manifest["sha256"], "manifest checksum mismatch"
assert manifest["schemaVersion"] == 3, "nutrition pack schema must be 3"
assert manifest["version"] == "2026.08.1", "unexpected nutrition pack version"
assert manifest["aliasCount"] >= 2000, "too few Vietnamese aliases"
assert manifest["vietnameseDisplayFoodCount"] >= 10_000, "fewer than 10,000 reviewed Vietnamese display names"
assert manifest["vietnameseRecipeCount"] == 480, "Vietnamese recipe count must be 480"
assert manifest["activeRecipeCount"] == 800, "active recipe count must be 800"
assert manifest["deprecatedRecipeCount"] == 300, "deprecated recipe count must be 300"
assert manifest["recipeRedirectCount"] == 300, "recipe redirect count must be 300"
assert manifest["foodGroupCount"] == 10, "food group count must be 10"
assert manifest["recipeStepCount"] == 3200, "every active recipe must have four bilingual steps"
assert manifest["uniqueRecipeSignatureCount"] == 800, "active recipe signatures must be unique"
assert manifest["vegetarianRecipeCount"] >= 160, "vegetarian coverage is too small"
assert manifest["veganRecipeCount"] >= 80, "vegan coverage is too small"
assert manifest["cuisineCounts"] == EXPECTED_CUISINES, "cuisine coverage mismatch"
assert manifest["mealSlotCounts"] == EXPECTED_MEAL_SLOTS, "meal-slot coverage mismatch"
assert all(source.get("licenseId") and str(source.get("url", "")).startswith("https://") for source in manifest["sources"])

connection = sqlite3.connect(f"file:{args.db.as_posix()}?mode=ro", uri=True)
connection.row_factory = sqlite3.Row
assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not connection.execute("PRAGMA foreign_key_check").fetchall(), "foreign key violations found"

required_tables = {
    "pack_meta", "foods", "aliases", "food_groups", "food_group_members", "recipes",
    "recipe_redirects", "recipe_ingredients", "recipe_steps", "recipe_tags", "food_fts",
}
actual_tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view')")}
assert required_tables <= actual_tables, f"missing schema-3 tables: {sorted(required_tables - actual_tables)}"

food_count = connection.execute("SELECT count(*) FROM foods").fetchone()[0]
alias_count = connection.execute("SELECT count(*) FROM aliases WHERE language='vi'").fetchone()[0]
active_recipe_count = connection.execute("SELECT count(*) FROM recipes WHERE status='active'").fetchone()[0]
deprecated_recipe_count = connection.execute("SELECT count(*) FROM recipes WHERE status='deprecated'").fetchone()[0]
redirect_count = connection.execute("SELECT count(*) FROM recipe_redirects").fetchone()[0]
food_group_count = connection.execute("SELECT count(*) FROM food_groups").fetchone()[0]
recipe_ingredient_count = connection.execute("SELECT count(*) FROM recipe_ingredients").fetchone()[0]
recipe_step_count = connection.execute("SELECT count(*) FROM recipe_steps").fetchone()[0]
reviewed_display_count = connection.execute(
    "SELECT count(*) FROM foods WHERE translation_status='reviewed'"
).fetchone()[0]
assert food_count == manifest["foodCount"]
assert alias_count == manifest["aliasCount"]
assert active_recipe_count == manifest["activeRecipeCount"]
assert deprecated_recipe_count == manifest["deprecatedRecipeCount"]
assert redirect_count == manifest["recipeRedirectCount"]
assert food_group_count == manifest["foodGroupCount"]
assert recipe_ingredient_count == manifest["recipeIngredientCount"]
assert recipe_step_count == manifest["recipeStepCount"]
assert reviewed_display_count == manifest["vietnameseDisplayFoodCount"]
assert connection.execute("SELECT count(*) FROM food_fts").fetchone()[0] == reviewed_display_count
assert connection.execute(
    "SELECT count(*) FROM foods WHERE source='vietnamese_recipe'"
).fetchone()[0] == 480
assert connection.execute(
    "SELECT count(*) FROM foods WHERE source='asian_recipe'"
).fetchone()[0] == 320

cuisine_counts = dict(connection.execute(
    "SELECT cuisine, count(*) FROM recipes WHERE status='active' GROUP BY cuisine ORDER BY cuisine"
))
region_counts = dict(connection.execute(
    "SELECT region, count(*) FROM recipes WHERE status='active' GROUP BY region ORDER BY region"
))
meal_slot_counts = dict(connection.execute(
    "SELECT value, count(*) FROM recipe_tags WHERE kind='meal_slot' GROUP BY value ORDER BY value"
))
assert cuisine_counts == EXPECTED_CUISINES, "SQLite cuisine counts mismatch"
assert region_counts == EXPECTED_REGIONS, "SQLite region counts mismatch"
assert meal_slot_counts == EXPECTED_MEAL_SLOTS, "SQLite meal-slot counts mismatch"

invalid_active_rows = connection.execute(
    """
    SELECT r.id, count(ri.id) AS ingredient_count,
           sum(CASE WHEN ri.is_required=1 THEN 1 ELSE 0 END) AS required_count,
           count(DISTINCT rs.position) AS step_count
    FROM recipes r
    LEFT JOIN recipe_ingredients ri ON ri.recipe_id=r.id
    LEFT JOIN recipe_steps rs ON rs.recipe_id=r.id
    WHERE r.status='active'
    GROUP BY r.id
    HAVING count(DISTINCT ri.id) NOT BETWEEN 4 AND 8
       OR required_count / count(DISTINCT rs.id) < 3
       OR step_count != 4
    """
).fetchall()
assert not invalid_active_rows, "active recipes must have 4-8 ingredients, at least 3 required ingredients, and 4 steps"

invalid_deprecated_rows = connection.execute(
    """
    SELECT id FROM recipes
    WHERE status='deprecated' AND (food_id IS NOT NULL OR superseded_by IS NULL OR signature IS NOT NULL)
    UNION ALL
    SELECT r.id FROM recipes r JOIN recipe_redirects rr ON rr.legacy_id=r.id
    WHERE rr.target_recipe_id != r.superseded_by
    """
).fetchall()
assert not invalid_deprecated_rows, "deprecated recipes must resolve without appearing as active foods"
expected_legacy_ids = {f"vi_recipe_{index:03d}" for index in range(1, 301)}
actual_legacy_ids = {row[0] for row in connection.execute("SELECT legacy_id FROM recipe_redirects")}
assert actual_legacy_ids == expected_legacy_ids, "legacy IDs must be preserved exactly and never reused"

signature_count = connection.execute(
    "SELECT count(DISTINCT signature) FROM recipes WHERE status='active'"
).fetchone()[0]
assert signature_count == 800, "active recipe signatures are not unique"
vegetarian_count = connection.execute(
    "SELECT count(*) FROM recipe_tags WHERE kind='dietary' AND value='vegetarian'"
).fetchone()[0]
vegan_count = connection.execute(
    "SELECT count(*) FROM recipe_tags WHERE kind='dietary' AND value='vegan'"
).fetchone()[0]
assert vegetarian_count == manifest["vegetarianRecipeCount"]
assert vegan_count == manifest["veganRecipeCount"]

catalog_by_id = {item["sourceFoodId"]: item for item in catalog["ingredients"]}
for source_food_id, item in catalog_by_id.items():
    row = connection.execute(
        "SELECT name_vi, name_en, translation_status, source_license_id FROM foods WHERE id=?",
        (source_food_id,),
    ).fetchone()
    assert row is not None, f"reviewed catalog ingredient is missing: {source_food_id}"
    assert row["name_vi"] == item["nameVi"] and row["name_en"] == item["nameEn"]
    assert row["translation_status"] == "reviewed" and row["source_license_id"] == "CC0-1.0"

invalid_ingredient_names = connection.execute(
    """
    SELECT ri.id FROM recipe_ingredients ri JOIN foods f ON f.id=ri.food_id
    WHERE ri.name_vi != f.name_vi OR ri.name_en != f.name_en OR f.translation_status != 'reviewed'
    LIMIT 1
    """
).fetchone()
assert invalid_ingredient_names is None, "recipe ingredients must use reviewed bilingual display names"

for row in connection.execute(
    "SELECT id, name_vi, name_en, translation_status FROM foods WHERE source='usda_fdc'"
):
    if row["translation_status"] == "generated":
        residue = normalized_tokens(row["name_vi"]) & normalized_tokens(row["name_en"])
        assert not residue, f"hybrid VI/EN display name remains for {row['id']}: {sorted(residue)}"
    elif row["translation_status"] == "unreviewed":
        assert row["name_vi"] == row["name_en"], f"unreviewed food must display the original English name: {row['id']}"

optional_nutrients = (
    "fiber", "sugar", "sodium_mg", "calcium_mg", "iron_mg", "potassium_mg",
    "magnesium_mg", "zinc_mg", "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg",
    "vitamin_e_mg", "vitamin_k_mcg", "vitamin_b6_mg", "vitamin_b12_mcg", "folate_mcg",
)
for nutrient in optional_nutrients:
    incorrectly_complete = connection.execute(
        f"""
        SELECT r.id
        FROM recipes r
        JOIN foods recipe_food ON recipe_food.id=r.food_id
        JOIN recipe_ingredients ri ON ri.recipe_id=r.id
        JOIN foods ingredient_food ON ingredient_food.id=ri.food_id
        WHERE r.status='active'
        GROUP BY r.id
        HAVING sum(CASE WHEN ingredient_food.{nutrient} IS NULL THEN 1 ELSE 0 END) > 0
           AND recipe_food.{nutrient} IS NOT NULL
        LIMIT 1
        """
    ).fetchone()
    assert incorrectly_complete is None, f"recipe {nutrient} must remain NULL when any ingredient value is unknown"

for query in ('"cơm"* "gà"*', '"com"* "ga"*', '"chicken"* "breast"*'):
    row = connection.execute(
        "SELECT f.name_vi, f.name_en, f.calories, f.protein FROM food_fts "
        "JOIN foods f ON f.rowid=food_fts.rowid WHERE food_fts MATCH ? LIMIT 1",
        (query,),
    ).fetchone()
    assert row is not None, f"FTS query returned no results: {query}"
    assert row["calories"] >= 0 and row["protein"] >= 0

metadata = dict(connection.execute("SELECT id, value FROM pack_meta"))
assert int(metadata["food_count"]) == food_count
assert int(metadata["alias_count"]) == alias_count
assert int(metadata["active_recipe_count"]) == active_recipe_count
assert int(metadata["deprecated_recipe_count"]) == deprecated_recipe_count
assert int(metadata["recipe_redirect_count"]) == redirect_count
assert int(metadata["food_group_count"]) == food_group_count
assert int(metadata["recipe_ingredient_count"]) == recipe_ingredient_count
assert int(metadata["recipe_step_count"]) == recipe_step_count
connection.close()

print(
    f"PASS nutrition pack schema 3: {food_count} foods, {alias_count} VI aliases, "
    f"{active_recipe_count} active recipes, {deprecated_recipe_count} redirects, "
    f"{recipe_ingredient_count} ingredients, {recipe_step_count} steps, SHA-256 {manifest['sha256']}"
)
