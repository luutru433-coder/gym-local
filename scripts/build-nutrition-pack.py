#!/usr/bin/env python3
"""Build the versioned Gym Local offline nutrition SQLite pack from USDA JSON."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


PACK_VERSION = "2026.04"
PACK_SCHEMA_VERSION = 1
NUTRIENT_COLUMNS = (
    "calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium_mg",
    "calcium_mg", "iron_mg", "potassium_mg", "magnesium_mg", "zinc_mg",
    "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_e_mg",
    "vitamin_k_mcg", "vitamin_b6_mg", "vitamin_b12_mcg", "folate_mcg",
)
NUTRIENT_IDS: dict[str, tuple[int, ...]] = {
    "calories": (1008, 2047, 2048),
    "protein": (1003,),
    "carbs": (1005,),
    "fat": (1004, 1085),
    "fiber": (1079,),
    "sugar": (2000, 1063),
    "sodium_mg": (1093,),
    "calcium_mg": (1087,),
    "iron_mg": (1089,),
    "potassium_mg": (1092,),
    "magnesium_mg": (1090,),
    "zinc_mg": (1095,),
    "vitamin_a_mcg": (1106,),
    "vitamin_c_mg": (1162,),
    "vitamin_d_mcg": (1114,),
    "vitamin_e_mg": (1109,),
    "vitamin_k_mcg": (1185,),
    "vitamin_b6_mg": (1175,),
    "vitamin_b12_mcg": (1178,),
    "folate_mcg": (1177,),
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--foundation", type=Path, required=True)
    parser.add_argument("--sr-legacy", type=Path, required=True)
    parser.add_argument("--fndds", type=Path, required=True)
    parser.add_argument("--dictionary", type=Path, default=Path("content/vietnamese-food-dictionary.json"))
    parser.add_argument("--recipes", type=Path, default=Path("content/vietnamese-recipes.json"))
    parser.add_argument("--output", type=Path, default=Path("outputs/gym-local-nutrition-2026.04.sqlite3"))
    parser.add_argument("--manifest", type=Path, default=Path("public/nutrition-pack-manifest.json"))
    parser.add_argument(
        "--download-url",
        default="./gym-local-nutrition-2026.04.sqlite3",
    )
    parser.add_argument("--repository-url", required=True, help="Canonical HTTPS repository URL used in source attribution")
    parser.add_argument("--limit-per-dataset", type=int)
    return parser.parse_args()


def stream_top_level_array(path: Path) -> Iterator[dict[str, Any]]:
    decoder = json.JSONDecoder()
    with path.open("r", encoding="utf-8") as handle:
        buffer = ""
        while "[" not in buffer:
            chunk = handle.read(64 * 1024)
            if not chunk:
                raise ValueError(f"No top-level array found in {path}")
            buffer += chunk
        buffer = buffer.split("[", 1)[1]
        while True:
            buffer = buffer.lstrip(" \r\n\t,")
            if buffer.startswith("]"):
                return
            try:
                value, end = decoder.raw_decode(buffer)
            except json.JSONDecodeError:
                chunk = handle.read(256 * 1024)
                if not chunk:
                    raise ValueError(f"Unexpected end of JSON in {path}")
                buffer += chunk
                continue
            if isinstance(value, dict):
                yield value
            buffer = buffer[end:]


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(character for character in normalized if unicodedata.category(character) != "Mn").replace("đ", "d").replace("Đ", "D")


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("_", " ")).strip(" ,.;")


def compile_dictionary(values: dict[str, str]) -> list[tuple[re.Pattern[str], str]]:
    result = []
    for source, translated in sorted(values.items(), key=lambda item: len(item[0]), reverse=True):
        pattern = re.compile(rf"(?<![A-Za-z]){re.escape(source)}(?![A-Za-z])", re.IGNORECASE)
        result.append((pattern, translated))
    return result


def translate_food(description: str, dictionary: list[tuple[re.Pattern[str], str]]) -> tuple[str, bool]:
    translated = description.lower()
    changed = False
    for pattern, replacement in dictionary:
        translated, count = pattern.subn(replacement, translated)
        changed = changed or count > 0
    translated = normalize_text(translated)
    if translated:
        translated = translated[0].upper() + translated[1:]
    return translated or description, changed


def aliases_for(description: str, translated: str, changed: bool) -> list[tuple[str, str]]:
    aliases: set[tuple[str, str]] = {(normalize_text(description), "en")}
    first_english = normalize_text(description.split(",", 1)[0])
    if first_english:
        aliases.add((first_english, "en"))
    if changed:
        vi_values = {
            normalize_text(translated),
            normalize_text(translated.split(",", 1)[0]),
            normalize_text(strip_accents(translated)),
        }
        aliases.update((value, "vi") for value in vi_values if value)
    return sorted((alias[:300], language) for alias, language in aliases if alias)


def nutrient_values(food: dict[str, Any]) -> dict[str, float | None]:
    by_id: dict[int, float] = {}
    energy_kj: float | None = None
    for entry in food.get("foodNutrients") or []:
        nutrient = entry.get("nutrient") or {}
        nutrient_id = nutrient.get("id")
        amount = entry.get("amount")
        if not isinstance(nutrient_id, int) or not isinstance(amount, (int, float)) or amount < 0:
            continue
        if nutrient_id == 1062:
            energy_kj = float(amount)
        by_id.setdefault(nutrient_id, float(amount))
    values: dict[str, float | None] = {}
    for column, identifiers in NUTRIENT_IDS.items():
        values[column] = next((by_id[identifier] for identifier in identifiers if identifier in by_id), None)
    if values["calories"] is None and energy_kj is not None:
        values["calories"] = energy_kj / 4.184
    if values["calories"] is None and all(values[key] is not None for key in ("protein", "carbs", "fat")):
        values["calories"] = values["protein"] * 4 + values["carbs"] * 4 + values["fat"] * 9  # type: ignore[operator]
    return values


def serving(food: dict[str, Any]) -> tuple[str | None, float | None]:
    portions = food.get("foodPortions") or []
    for portion in portions:
        grams = portion.get("gramWeight")
        if not isinstance(grams, (int, float)) or grams <= 0:
            continue
        unit = (portion.get("measureUnit") or {}).get("name") or (portion.get("measureUnit") or {}).get("abbreviation") or "portion"
        amount = portion.get("amount") or portion.get("value") or 1
        modifier = normalize_text(str(portion.get("modifier") or ""))
        label = normalize_text(f"{amount:g} {unit} {modifier}" if isinstance(amount, (int, float)) else f"{amount} {unit} {modifier}")
        return label[:160], float(grams)
    return None, None


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA page_size=4096;
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        PRAGMA temp_store=MEMORY;
        CREATE TABLE pack_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
        CREATE TABLE foods (
          id TEXT PRIMARY KEY,
          name_vi TEXT NOT NULL,
          name_en TEXT NOT NULL,
          source TEXT NOT NULL,
          source_food_id TEXT,
          source_url TEXT,
          serving_label TEXT,
          serving_grams REAL,
          calories REAL NOT NULL,
          protein REAL NOT NULL,
          carbs REAL NOT NULL,
          fat REAL NOT NULL,
          fiber REAL,
          sugar REAL,
          sodium_mg REAL,
          calcium_mg REAL,
          iron_mg REAL,
          potassium_mg REAL,
          magnesium_mg REAL,
          zinc_mg REAL,
          vitamin_a_mcg REAL,
          vitamin_c_mg REAL,
          vitamin_d_mcg REAL,
          vitamin_e_mg REAL,
          vitamin_k_mcg REAL,
          vitamin_b6_mg REAL,
          vitamin_b12_mcg REAL,
          folate_mcg REAL,
          data_quality TEXT NOT NULL
        );
        CREATE TABLE aliases (
          food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
          alias TEXT NOT NULL,
          language TEXT NOT NULL,
          PRIMARY KEY (food_id, alias)
        ) WITHOUT ROWID;
        CREATE INDEX foods_source_food_id ON foods(source, source_food_id);
        CREATE INDEX aliases_language ON aliases(language, alias);
        """
    )


def add_usda_food(
    connection: sqlite3.Connection,
    food: dict[str, Any],
    dictionary: list[tuple[re.Pattern[str], str]],
) -> bool:
    fdc_id = food.get("fdcId")
    description = normalize_text(str(food.get("description") or ""))
    if not fdc_id or not description:
        return False
    nutrients = nutrient_values(food)
    macros = {key: nutrients[key] for key in ("calories", "protein", "carbs", "fat")}
    if any(value is None for value in macros.values()):
        return False
    name_vi, changed = translate_food(description, dictionary)
    serving_label, serving_grams = serving(food)
    micronutrient_count = sum(nutrients[column] is not None for column in NUTRIENT_COLUMNS[4:])
    data_quality = "complete" if micronutrient_count >= 10 else "partial"
    food_id = f"usda_{fdc_id}"
    values = [
        food_id,
        name_vi,
        description,
        "usda_fdc",
        str(fdc_id),
        f"https://fdc.nal.usda.gov/food-details/{fdc_id}/nutrients",
        serving_label,
        serving_grams,
        *[nutrients[column] for column in NUTRIENT_COLUMNS],
        data_quality,
    ]
    cursor = connection.execute(
        f"INSERT OR IGNORE INTO foods VALUES ({','.join('?' for _ in values)})",
        values,
    )
    if cursor.rowcount == 0:
        return False
    connection.executemany(
        "INSERT OR IGNORE INTO aliases(food_id, alias, language) VALUES (?, ?, ?)",
        [(food_id, alias, language) for alias, language in aliases_for(description, name_vi, changed)],
    )
    return True


def tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", strip_accents(value.lower())) if len(token) > 2}


def best_food_for_query(rows: list[sqlite3.Row], query: str) -> sqlite3.Row:
    wanted = tokens(query)
    ranked = sorted(
        rows,
        key=lambda row: (
            len(wanted & tokens(str(row["name_en"]))) * 10
            + (12 if query.lower() in str(row["name_en"]).lower() else 0)
            - (4 if "raw" in str(row["name_en"]).lower() and "raw" not in query.lower() else 0)
        ),
        reverse=True,
    )
    if not ranked or not wanted.intersection(tokens(str(ranked[0]["name_en"]))):
        raise ValueError(f"No USDA ingredient matched recipe query: {query}")
    return ranked[0]


def add_recipes(connection: sqlite3.Connection, recipes: list[dict[str, Any]]) -> int:
    connection.row_factory = sqlite3.Row
    ingredient_rows = connection.execute("SELECT * FROM foods WHERE source='usda_fdc'").fetchall()
    count = 0
    for recipe in recipes:
        total_grams = float(recipe["servingGrams"])
        totals: dict[str, float] = {column: 0.0 for column in NUTRIENT_COLUMNS}
        seen: dict[str, bool] = {column: False for column in NUTRIENT_COLUMNS}
        matched_ids: list[str] = []
        for ingredient in recipe["ingredients"]:
            row = best_food_for_query(ingredient_rows, str(ingredient["query"]))
            matched_ids.append(str(row["source_food_id"]))
            factor = float(ingredient["grams"]) / 100
            for column in NUTRIENT_COLUMNS:
                value = row[column]
                if value is not None:
                    totals[column] += float(value) * factor
                    seen[column] = True
        per_100g = {column: (totals[column] / total_grams * 100 if seen[column] else None) for column in NUTRIENT_COLUMNS}
        values = [
            recipe["id"], recipe["nameVi"], recipe["nameEn"], "vietnamese_recipe",
            "+".join(matched_ids), None, "1 khẩu phần", total_grams,
            *[per_100g[column] if per_100g[column] is not None else (0.0 if column in NUTRIENT_COLUMNS[:4] else None) for column in NUTRIENT_COLUMNS],
            "estimated_recipe",
        ]
        connection.execute(f"INSERT INTO foods VALUES ({','.join('?' for _ in values)})", values)
        recipe_aliases = {
            normalize_text(str(recipe["nameVi"])),
            normalize_text(strip_accents(str(recipe["nameVi"]))),
        }
        connection.executemany(
            "INSERT OR IGNORE INTO aliases(food_id, alias, language) VALUES (?, ?, 'vi')",
            [(recipe["id"], alias) for alias in recipe_aliases],
        )
        count += 1
    return count


def finalize(connection: sqlite3.Connection, metadata: dict[str, str]) -> None:
    connection.executemany("INSERT INTO pack_meta(key, value) VALUES (?, ?)", metadata.items())
    connection.executescript(
        """
        CREATE VIRTUAL TABLE food_fts USING fts5(
          name_vi, name_en, aliases,
          tokenize='unicode61 remove_diacritics 2'
        );
        INSERT INTO food_fts(rowid, name_vi, name_en, aliases)
          SELECT f.rowid, f.name_vi, f.name_en, COALESCE(group_concat(a.alias, ' '), '')
          FROM foods f LEFT JOIN aliases a ON a.food_id=f.id GROUP BY f.rowid;
        INSERT INTO food_fts(food_fts) VALUES('optimize');
        ANALYZE;
        """
    )
    connection.commit()
    connection.execute("VACUUM")
    connection.execute("PRAGMA optimize")
    connection.commit()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    args = arguments()
    repository_url = args.repository_url.rstrip("/")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        args.output.unlink()
    dictionary_values = json.loads(args.dictionary.read_text(encoding="utf-8"))
    dictionary = compile_dictionary(dictionary_values)
    recipes = json.loads(args.recipes.read_text(encoding="utf-8"))
    if len(recipes) != 300:
        raise ValueError(f"Expected exactly 300 Vietnamese recipes, got {len(recipes)}")

    connection = sqlite3.connect(args.output)
    create_schema(connection)
    inserted = 0
    datasets = [args.foundation, args.sr_legacy, args.fndds]
    for path in datasets:
        dataset_count = 0
        for food in stream_top_level_array(path):
            if add_usda_food(connection, food, dictionary):
                inserted += 1
                dataset_count += 1
            if args.limit_per_dataset and dataset_count >= args.limit_per_dataset:
                break
            if inserted and inserted % 500 == 0:
                connection.commit()
        connection.commit()
        print(f"{path.name}: {dataset_count} foods")

    recipe_count = add_recipes(connection, recipes)
    food_count = connection.execute("SELECT count(*) FROM foods").fetchone()[0]
    alias_count = connection.execute("SELECT count(*) FROM aliases WHERE language='vi'").fetchone()[0]
    if alias_count < 2000:
        raise ValueError(f"Vietnamese alias coverage too small: {alias_count} (minimum 2000)")
    created_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    metadata = {
        "id": "gym-local-nutrition",
        "version": PACK_VERSION,
        "schema_version": str(PACK_SCHEMA_VERSION),
        "created_at": created_at,
        "food_count": str(food_count),
        "alias_count": str(alias_count),
        "vietnamese_recipe_count": str(recipe_count),
    }
    finalize(connection, metadata)
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    connection.close()
    if integrity != "ok":
        raise ValueError(f"SQLite integrity check failed: {integrity}")

    checksum = sha256_file(args.output)
    manifest = {
        "id": "gym-local-nutrition",
        "version": PACK_VERSION,
        "schemaVersion": PACK_SCHEMA_VERSION,
        "createdAt": created_at,
        "minimumAppVersion": "0.2.0",
        "fileName": args.output.name,
        "downloadUrl": args.download_url,
        "sizeBytes": args.output.stat().st_size,
        "sha256": checksum,
        "foodCount": food_count,
        "aliasCount": alias_count,
        "vietnameseRecipeCount": recipe_count,
        "sources": [
            {
                "id": "usda-foundation-2026-04",
                "label": "USDA FoodData Central Foundation Foods 04/2026",
                "url": "https://fdc.nal.usda.gov/download-datasets/",
                "licenseId": "CC0-1.0",
                "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
                "retrievedAt": "2026-08-10",
            },
            {
                "id": "usda-sr-legacy-2018-04",
                "label": "USDA FoodData Central SR Legacy 04/2018",
                "url": "https://fdc.nal.usda.gov/download-datasets/",
                "licenseId": "CC0-1.0",
                "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
                "retrievedAt": "2026-08-10",
            },
            {
                "id": "usda-fndds-2021-2023",
                "label": "USDA FoodData Central FNDDS 2021-2023",
                "url": "https://fdc.nal.usda.gov/download-datasets/",
                "licenseId": "CC0-1.0",
                "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
                "retrievedAt": "2026-08-10",
            },
            {
                "id": "gym-local-vietnamese-recipes",
                "label": "Gym Local Vietnamese recipe estimates",
                "url": f"{repository_url}/blob/main/content/vietnamese-recipes.json",
                "licenseId": "project-content",
                "licenseUrl": f"{repository_url}/blob/main/LICENSE",
                "retrievedAt": "2026-08-10",
            },
        ],
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {args.output} ({args.output.stat().st_size:,} bytes, {food_count} foods, {alias_count} VI aliases, {recipe_count} recipes)")


if __name__ == "__main__":
    main()
