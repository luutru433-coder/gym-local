#!/usr/bin/env python3
"""Verify a built Gym Local nutrition pack before publishing it."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


parser = argparse.ArgumentParser()
parser.add_argument("--db", type=Path, required=True)
parser.add_argument("--manifest", type=Path, required=True)
args = parser.parse_args()

manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
assert args.db.stat().st_size == manifest["sizeBytes"], "manifest byte size mismatch"
assert digest(args.db) == manifest["sha256"], "manifest checksum mismatch"
assert manifest["schemaVersion"] == 2, "nutrition pack schema must be 2"
assert manifest["aliasCount"] >= 2000, "too few Vietnamese aliases"
assert manifest["vietnameseRecipeCount"] == 300, "recipe count must be 300"
assert manifest["foodGroupCount"] == 10, "food group count must be 10"
assert manifest["recipeIngredientCount"] == 1200, "recipe ingredient count must be 1200"

connection = sqlite3.connect(f"file:{args.db.as_posix()}?mode=ro", uri=True)
connection.row_factory = sqlite3.Row
assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not connection.execute("PRAGMA foreign_key_check").fetchall(), "foreign key violations found"
food_count = connection.execute("SELECT count(*) FROM foods").fetchone()[0]
alias_count = connection.execute("SELECT count(*) FROM aliases WHERE language='vi'").fetchone()[0]
recipe_count = connection.execute("SELECT count(*) FROM recipes").fetchone()[0]
food_group_count = connection.execute("SELECT count(*) FROM food_groups").fetchone()[0]
recipe_ingredient_count = connection.execute("SELECT count(*) FROM recipe_ingredients").fetchone()[0]
assert food_count == manifest["foodCount"]
assert alias_count == manifest["aliasCount"]
assert recipe_count == manifest["vietnameseRecipeCount"]
assert food_group_count == manifest["foodGroupCount"]
assert recipe_ingredient_count == manifest["recipeIngredientCount"]

invalid_recipe_rows = connection.execute(
    """
    SELECT r.id, count(ri.id) AS ingredient_count,
           sum(CASE WHEN ri.is_required=1 THEN 1 ELSE 0 END) AS required_count
    FROM recipes r LEFT JOIN recipe_ingredients ri ON ri.recipe_id=r.id
    GROUP BY r.id
    HAVING ingredient_count != 4 OR required_count != 3
    """
).fetchall()
assert not invalid_recipe_rows, "every generated recipe must contain four ingredients and three required roles"

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
        GROUP BY r.id
        HAVING sum(CASE WHEN ingredient_food.{nutrient} IS NULL THEN 1 ELSE 0 END) > 0
           AND recipe_food.{nutrient} IS NOT NULL
        LIMIT 1
        """
    ).fetchone()
    assert incorrectly_complete is None, f"recipe {nutrient} must be NULL when any ingredient value is unknown"

for query in ('"ức"* "gà"*', '"uc"* "ga"*', '"cơm"* "gà"*', '"chicken"* "breast"*'):
    row = connection.execute(
        "SELECT f.name_vi, f.name_en, f.calories, f.protein, f.iron_mg, f.vitamin_c_mg "
        "FROM food_fts JOIN foods f ON f.rowid=food_fts.rowid WHERE food_fts MATCH ? LIMIT 1",
        (query,),
    ).fetchone()
    assert row is not None, f"FTS query returned no results: {query}"
    assert row["calories"] >= 0 and row["protein"] >= 0

metadata = dict(connection.execute("SELECT id, value FROM pack_meta"))
assert int(metadata["food_count"]) == food_count
assert int(metadata["alias_count"]) == alias_count
assert int(metadata["food_group_count"]) == food_group_count
assert int(metadata["recipe_ingredient_count"]) == recipe_ingredient_count
connection.close()
print(
    f"PASS nutrition pack: {food_count} foods, {alias_count} VI aliases, {recipe_count} recipes, "
    f"{recipe_ingredient_count} ingredients, SHA-256 {manifest['sha256']}"
)
