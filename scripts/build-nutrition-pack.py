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


PACK_VERSION = "2026.11.1"
PACK_SCHEMA_VERSION = 3
PACK_CREATED_AT = "2026-11-21T00:00:00Z"
NUTRIENT_COLUMNS = (
    "calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium_mg",
    "calcium_mg", "iron_mg", "potassium_mg", "magnesium_mg", "zinc_mg",
    "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_e_mg",
    "vitamin_k_mcg", "vitamin_b6_mg", "vitamin_b12_mcg", "folate_mcg",
)
NUTRIENT_IDS: dict[str, tuple[int, ...]] = {
    "calories": (1008, 2048, 2047),
    "protein": (1003,),
    "carbs": (1005,),
    "fat": (1004, 1085),
    "fiber": (1079, 2033),
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
    parser.add_argument("--recipes", type=Path, default=Path("content/nutrition-recipes"))
    parser.add_argument("--ingredient-catalog", type=Path, default=Path("content/recipe-ingredient-catalog.json"))
    parser.add_argument("--legacy-redirects", type=Path, default=Path("content/legacy-recipe-redirects.json"))
    parser.add_argument("--source-allowlist", type=Path, default=Path("content/recipe-source-allowlist.json"))
    parser.add_argument("--food-groups", type=Path, default=Path("content/food-groups.json"))
    parser.add_argument("--schema", type=Path, default=Path("content/nutrition-pack-schema-v3.sql"))
    parser.add_argument("--output", type=Path, default=Path("outputs/gym-local-nutrition-2026.11.1.sqlite3"))
    parser.add_argument("--manifest", type=Path, default=Path("public/nutrition-pack-manifest.json"))
    parser.add_argument(
        "--download-url",
        default="./gym-local-nutrition-2026.11.1.sqlite3",
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


CONNECTIVES = {"and": "và", "or": "hoặc", "with": "với"}
NOISE = re.compile(r"\bnfs\b|\bns as to [^,]*", re.IGNORECASE)
# Adjacent terms are reordered head-first for Vietnamese. That is a heuristic, so
# a name that needed it is shown with its USDA description, and longer runs are
# not translated at all.
MAX_TERMS_PER_RUN = 2


def compile_dictionary(values: dict[str, str]) -> tuple[re.Pattern[str], dict[str, str]]:
    variants: dict[str, str] = {}
    for source, translated in values.items():
        key = source.lower()
        forms = {key}
        if not key.endswith("s"):
            forms.update({f"{key}s", f"{key}es"})
            if key.endswith("y"):
                forms.add(f"{key[:-1]}ies")
        for form in forms:
            variants.setdefault(form, translated)
    for source, translated in values.items():
        variants[source.lower()] = translated
    alternation = "|".join(re.escape(form) for form in sorted(variants, key=len, reverse=True))
    return re.compile(rf"(?<![A-Za-z])(?:{alternation})(?![A-Za-z])", re.IGNORECASE), variants


def translate_segment(segment: str, dictionary: tuple[re.Pattern[str], dict[str, str]]) -> tuple[str, bool, bool]:
    """Translate one comma-separated segment.

    Returns the text, whether nothing English is left, and whether no reordering was needed.
    """
    pattern, variants = dictionary
    text = NOISE.sub(" ", segment.lower())
    runs: list[list[str]] = [[]]
    joiners: list[str] = []
    complete = True
    position = 0

    def residual(value: str) -> None:
        nonlocal complete
        for word in re.findall(r"[^\s]+", value):
            if word in CONNECTIVES and runs[-1]:
                joiners.append(CONNECTIVES[word])
                runs.append([])
            else:
                complete = False

    for match in pattern.finditer(text):
        residual(text[position:match.start()])
        runs[-1].append(variants[match.group(0).lower()])
        position = match.end()
    residual(text[position:])
    if not runs[-1] and joiners:
        complete = False
    if any(len(run) > MAX_TERMS_PER_RUN for run in runs):
        complete = False
    parts: list[str] = []
    for index, run in enumerate(runs):
        if index:
            parts.append(joiners[index - 1])
        # English puts the head noun last; Vietnamese puts it first.
        parts.extend(reversed(run))
    return " ".join(parts), complete and bool(runs[0]), all(len(run) == 1 for run in runs)


def capitalize(value: str) -> str:
    return value[0].upper() + value[1:] if value else value


def translate_food(description: str, dictionary: tuple[re.Pattern[str], dict[str, str]]) -> tuple[str, bool, bool]:
    """Return the Vietnamese name, whether it is complete, and whether no reordering was needed."""
    segments = [segment for segment in (normalize_text(part) for part in description.split(",")) if NOISE.sub("", segment).strip()]
    translated = [translate_segment(segment, dictionary) for segment in segments]
    complete = bool(translated) and all(done for _, done, _ in translated)
    simple = all(plain for _, _, plain in translated)
    return capitalize(", ".join(text for text, _, _ in translated)), complete, simple


CATEGORY_LABELS = (
    (re.compile(r"\balcoholic beverages?\b|\bbeer\b|\bwine\b|\bliqueur\b", re.IGNORECASE), "Đồ uống có cồn"),
    (re.compile(r"\bbabyfood\b|\bbaby food\b|\binfant formula\b", re.IGNORECASE), "Thực phẩm cho trẻ nhỏ"),
    (re.compile(r"\bfast foods?\b|\brestaurant\b", re.IGNORECASE), "Thức ăn nhanh"),
    (re.compile(r"\bcand(?:y|ies)\b|\bcookies?\b|\bcakes?\b|\bpies?\b|\bdesserts?\b|\bsweeteners?\b|\bpuddings?\b|\bdoughnuts?\b|\bpastr(?:y|ies)\b", re.IGNORECASE), "Món ngọt"),
    (re.compile(r"\bbeverages?\b|\bdrinks?\b|\bcoffee\b|\btea\b|\bwater\b", re.IGNORECASE), "Đồ uống"),
    (re.compile(r"\bsoups?\b|\bstews?\b|\bsauces?\b|\bgravy\b", re.IGNORECASE), "Món nước và nước sốt"),
    (re.compile(r"\bsalad dressings?\b|\bdressings?\b", re.IGNORECASE), "Nước sốt salad"),
    (re.compile(r"\bsandwich(?:es)?\b|\bpizza\b|\bburgers?\b|\bmeals?\b|\bentrees?\b|\bburritos?\b|\btacos?\b", re.IGNORECASE), "Món ăn hỗn hợp"),
    (re.compile(r"\bcereals?\b|\bpasta\b|\bflour\b|\bgrains?\b|\bcrackers?\b|\bbagels?\b|\bmuffins?\b|\bpancakes?\b|\bwaffles?\b|\brolls?\b|\btortillas?\b", re.IGNORECASE), "Ngũ cốc và tinh bột"),
    (re.compile(r"\bsnacks?\b|\bchips\b", re.IGNORECASE), "Đồ ăn vặt"),
    (re.compile(r"\bspices?\b|\bseasonings?\b|\bherbs?\b", re.IGNORECASE), "Gia vị"),
    (re.compile(r"\bnuts?\b|\bseeds?\b", re.IGNORECASE), "Các loại hạt"),
    (re.compile(r"\bbeans?\b|\blegumes?\b", re.IGNORECASE), "Các loại đậu"),
    (re.compile(r"\bvegetables?\b|\bgreens\b|\bpeppers\b", re.IGNORECASE), "Rau củ"),
    (re.compile(r"\bfruits?\b|\bjuices?\b", re.IGNORECASE), "Trái cây và nước ép"),
    (re.compile(r"\bmeats?\b|\bsausages?\b|\bfrankfurters?\b|\bgame meat\b", re.IGNORECASE), "Thịt và sản phẩm từ thịt"),
    (re.compile(r"\bfish\b|\bseafood\b|\bshellfish\b|\bcrustaceans\b|\bmollusks\b", re.IGNORECASE), "Cá và hải sản"),
    (re.compile(r"\bcheese\b|\bcream\b", re.IGNORECASE), "Sản phẩm từ sữa"),
    (re.compile(r"\boils?\b|\bfats?\b|\bshortening\b", re.IGNORECASE), "Dầu và chất béo"),
)


def reviewed_vietnamese_label(
    description: str,
    dictionary: tuple[re.Pattern[str], dict[str, str]],
) -> tuple[str, str]:
    """Name a USDA food in Vietnamese without ever describing a different food.

    A description the dictionary covers completely becomes a Vietnamese name.
    Otherwise the Vietnamese part only names what the leading USDA segment
    (the food itself, before its qualifiers) is, and the exact USDA description
    follows in brackets so the entry can never be mistaken for another food.
    """
    translated, complete, simple = translate_food(description, dictionary)
    if complete and simple:
        return translated, "dictionary_complete"
    if complete:
        return f"{translated} ({description})", "bilingual_head"
    head = normalize_text(description.split(",", 1)[0])
    head_label, head_complete, _ = translate_segment(head, dictionary)
    if not head_complete:
        is_mixed_dish = any(re.search(rf"\b{word}\b", head, re.IGNORECASE) for word in CONNECTIVES)
        head_label = "Món ăn hỗn hợp" if is_mixed_dish else next(
            (label for pattern, label in CATEGORY_LABELS if pattern.search(head)), ""
        )
    if not head_label:
        return description, "unreviewed"
    return f"{capitalize(head_label)} ({description})", "bilingual_head"


def aliases_for(description: str, name_vi: str, name_en: str) -> list[tuple[str, str]]:
    aliases: set[tuple[str, str]] = {(normalize_text(description), "en"), (name_en, "en")}
    first_english = normalize_text(description.split(",", 1)[0])
    if first_english:
        aliases.add((first_english, "en"))
    if name_vi != description:
        aliases.update({(name_vi, "vi"), (normalize_text(strip_accents(name_vi)), "vi")})
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


def create_schema(connection: sqlite3.Connection, schema_path: Path) -> None:
    connection.executescript(schema_path.read_text(encoding="utf-8"))


def stable_id(prefix: str, *parts: str) -> str:
    source = "\x1f".join(parts).encode("utf-8")
    return f"{prefix}_{hashlib.sha256(source).hexdigest()[:24]}"


def alias_rows(food_id: str, aliases: list[tuple[str, str]]) -> list[tuple[str, str, str, str]]:
    return [
        (stable_id("alias", food_id, language, alias.casefold()), food_id, alias, language)
        for alias, language in aliases
    ]


def add_food_groups(connection: sqlite3.Connection, groups: list[dict[str, Any]]) -> set[str]:
    group_ids: set[str] = set()
    for group in groups:
        group_id = str(group["id"])
        if not re.fullmatch(r"[a-z][a-z0-9_]*", group_id) or group_id in group_ids:
            raise ValueError(f"Invalid or duplicate food group ID: {group_id}")
        connection.execute(
            "INSERT INTO food_groups VALUES (?, ?, ?, ?, ?, 'project_content', ?)",
            (
                group_id,
                str(group["nameVi"]),
                str(group["nameEn"]),
                str(group["descriptionVi"]),
                str(group["descriptionEn"]),
                "2026-08-14",
            ),
        )
        group_ids.add(group_id)
    return group_ids


DATASET_PRIORITY = {"usda-foundation": 0, "usda-sr-legacy": 1, "usda-fndds": 2}


def prepare_usda_food(
    food: dict[str, Any],
    dictionary: tuple[re.Pattern[str], dict[str, str]],
    catalog_by_source_id: dict[str, dict[str, Any]],
    dataset_id: str,
    dataset_version: str,
) -> dict[str, Any] | None:
    fdc_id = food.get("fdcId")
    description = normalize_text(str(food.get("description") or ""))
    if not fdc_id or not description:
        return None
    nutrients = nutrient_values(food)
    if any(nutrients[key] is None for key in ("calories", "protein", "carbs", "fat")):
        return None
    food_id = f"usda_{fdc_id}"
    curated = catalog_by_source_id.get(food_id)
    if curated:
        name_vi = normalize_text(str(curated["nameVi"]))
        name_en = normalize_text(str(curated["nameEn"]))
        naming = "curated"
    else:
        name_vi, naming = reviewed_vietnamese_label(description, dictionary)
        name_en = description
    serving_label, serving_grams = serving(food)
    micronutrient_count = sum(nutrients[column] is not None for column in NUTRIENT_COLUMNS[4:])
    return {
        "id": food_id,
        "fdc_id": str(fdc_id),
        "description": description,
        "name_vi": name_vi,
        "name_en": name_en,
        "naming": naming,
        "dataset_id": dataset_id,
        "dataset_version": dataset_version,
        "serving_label": serving_label,
        "serving_grams": serving_grams,
        "nutrients": nutrients,
        "data_quality": "complete" if micronutrient_count >= 10 else "partial",
    }


def description_key(description: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", NOISE.sub(" ", description.lower())).strip()


def singular_tokens(description: str) -> set[str]:
    return {token.rstrip("s") for token in tokens(NOISE.sub(" ", description))}


def deduplicate_usda_foods(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Keep one entry per food the user could not tell apart.

    USDA publishes the same food in several datasets. Two records are the same
    entry when their descriptions match, or when every stored nutrient matches
    and one description only adds words to the other (FNDDS copies SR Legacy
    analyses under a shorter name). Curated recipe ingredients always survive; otherwise the
    newest analysis (Foundation, then SR Legacy, then FNDDS) wins.
    """
    naming_rank = {"curated": 0, "dictionary_complete": 1, "bilingual_head": 2, "unreviewed": 3}

    def preference(record: dict[str, Any]) -> tuple[int, int, int, int, str]:
        return (
            0 if record["naming"] == "curated" else 1,
            DATASET_PRIORITY[record["dataset_id"]],
            naming_rank[record["naming"]],
            len(record["description"]),
            record["id"],
        )

    def profile_preference(record: dict[str, Any]) -> tuple[int, int, int, int, str]:
        return (
            0 if record["naming"] == "curated" else 1,
            naming_rank[record["naming"]],
            len(record["description"]),
            DATASET_PRIORITY[record["dataset_id"]],
            record["id"],
        )

    removed = {"same_description": 0, "same_nutrients": 0}
    by_description: dict[str, dict[str, Any]] = {}
    for record in records:
        key = description_key(record["description"])
        current = by_description.get(key)
        if current is None:
            by_description[key] = record
            continue
        removed["same_description"] += 1
        if record["naming"] == "curated" and current["naming"] == "curated":
            raise ValueError(f"Curated ingredients {current['id']} and {record['id']} are the same USDA food")
        if preference(record) < preference(current):
            by_description[key] = record

    by_profile: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for record in by_description.values():
        profile = tuple(
            None if record["nutrients"][column] is None else round(record["nutrients"][column], 2)
            for column in NUTRIENT_COLUMNS
        )
        by_profile.setdefault(profile, []).append(record)
    kept: list[dict[str, Any]] = []
    for group in by_profile.values():
        survivors: list[dict[str, Any]] = []
        for record in sorted(group, key=profile_preference):
            words = singular_tokens(record["description"])
            twin = next(
                (
                    other for other in survivors
                    if words <= singular_tokens(other["description"]) or words >= singular_tokens(other["description"])
                ),
                None,
            )
            if twin is None or record["naming"] == "curated":
                survivors.append(record)
            else:
                removed["same_nutrients"] += 1
        kept.extend(survivors)
    order = {record["id"]: index for index, record in enumerate(records)}
    kept.sort(key=lambda record: order[record["id"]])
    return kept, removed


def disambiguate_display_names(records: list[dict[str, Any]]) -> None:
    """Different foods whose Vietnamese names coincide also show their USDA description."""
    by_name: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        if record["naming"] != "unreviewed":
            by_name.setdefault(record["name_vi"].casefold(), []).append(record)
    for group in by_name.values():
        if len(group) < 2:
            continue
        for record in group:
            if record["naming"] == "dictionary_complete":
                record["name_vi"] = f"{record['name_vi']} ({record['description']})"
                record["naming"] = "bilingual_head"


def insert_usda_food(connection: sqlite3.Connection, record: dict[str, Any]) -> None:
    visible = record["naming"] != "unreviewed"
    values = [
        record["id"],
        record["name_vi"],
        record["name_en"],
        "usda_fdc",
        record["fdc_id"],
        f"https://fdc.nal.usda.gov/food-details/{record['fdc_id']}/nutrients",
        record["dataset_id"],
        record["dataset_version"],
        "CC0-1.0",
        "reviewed" if visible else "unreviewed",
        PACK_CREATED_AT[:10] if visible else None,
        record["serving_label"],
        record["serving_grams"],
        *[record["nutrients"][column] for column in NUTRIENT_COLUMNS],
        record["data_quality"],
    ]
    connection.execute(f"INSERT INTO foods VALUES ({','.join('?' for _ in values)})", values)
    connection.executemany(
        "INSERT OR IGNORE INTO aliases(id, food_id, alias, language) VALUES (?, ?, ?, ?)",
        alias_rows(record["id"], aliases_for(record["description"], record["name_vi"], record["name_en"])),
    )


def tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", strip_accents(value.lower())) if len(token) > 2}


def best_food_for_query(rows_by_id: dict[str, sqlite3.Row], query: str, source_food_id: str) -> sqlite3.Row:
    pinned = rows_by_id.get(source_food_id)
    if pinned is None:
        raise ValueError(f"Pinned USDA ingredient {source_food_id} for {query} is missing from the source datasets")
    if not tokens(query).intersection(tokens(str(pinned["name_en"]))):
        raise ValueError(f"Pinned USDA ingredient {source_food_id} does not match recipe query: {query}")
    return pinned


def best_food_for_query_legacy(rows: list[sqlite3.Row], query: str) -> sqlite3.Row:
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


def add_recipes(
    connection: sqlite3.Connection,
    recipes: list[dict[str, Any]],
    group_ids: set[str],
    repository_url: str,
) -> tuple[int, int]:
    connection.row_factory = sqlite3.Row
    ingredient_rows = connection.execute("SELECT * FROM foods WHERE source='usda_fdc'").fetchall()
    ingredient_rows_by_id = {str(row["id"]): row for row in ingredient_rows}
    count = 0
    for recipe in recipes:
        total_grams = float(recipe["servingGrams"])
        ingredients = recipe["ingredients"]
        ingredient_grams = sum(float(ingredient["grams"]) for ingredient in ingredients)
        if abs(ingredient_grams - total_grams) > 0.01:
            raise ValueError(f"Recipe {recipe['id']} serving grams do not equal its ingredient grams")
        totals: dict[str, float] = {column: 0.0 for column in NUTRIENT_COLUMNS}
        all_known: dict[str, bool] = {column: True for column in NUTRIENT_COLUMNS}
        matched_rows: list[sqlite3.Row] = []
        for ingredient in ingredients:
            group_id = str(ingredient["groupId"])
            if group_id not in group_ids:
                raise ValueError(f"Recipe {recipe['id']} uses unknown food group: {group_id}")
            query = str(ingredient["query"])
            source_food_id = str(ingredient.get("sourceFoodId") or "")
            row = best_food_for_query(ingredient_rows_by_id, query, source_food_id) if source_food_id else best_food_for_query_legacy(ingredient_rows, query)
            matched_rows.append(row)
            factor = float(ingredient["grams"]) / 100
            for column in NUTRIENT_COLUMNS:
                value = row[column]
                if value is None:
                    all_known[column] = False
                else:
                    totals[column] += float(value) * factor
        per_100g = {
            column: (totals[column] / total_grams * 100 if all_known[column] else None)
            for column in NUTRIENT_COLUMNS
        }
        matched_source_ids = [str(row["source_food_id"]) for row in matched_rows]
        values = [
            recipe["id"], recipe["nameVi"], recipe["nameEn"], "vietnamese_recipe",
            "+".join(matched_source_ids), f"{repository_url}/blob/main/content/nutrition-recipes/{recipe['cuisine']}.json", "1 khẩu phần", total_grams,
            *[per_100g[column] if per_100g[column] is not None else (0.0 if column in NUTRIENT_COLUMNS[:4] else None) for column in NUTRIENT_COLUMNS],
            "estimated_recipe",
        ]
        connection.execute(f"INSERT INTO foods VALUES ({','.join('?' for _ in values)})", values)
        recipe_aliases = {
            normalize_text(str(recipe["nameVi"])),
            normalize_text(strip_accents(str(recipe["nameVi"]))),
        }
        connection.executemany(
            "INSERT OR IGNORE INTO aliases(id, food_id, alias, language) VALUES (?, ?, ?, 'vi')",
            [
                (stable_id("alias", str(recipe["id"]), "vi", alias.casefold()), recipe["id"], alias)
                for alias in recipe_aliases
            ],
        )
        connection.execute(
            "INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                recipe["id"],
                recipe["id"],
                recipe["nameVi"],
                recipe["nameEn"],
                total_grams,
                recipe["estimationNote"],
                recipe["sourceId"],
                f"{repository_url}/blob/main/content/nutrition-recipes/{recipe['cuisine']}.json",
                recipe["reviewedAt"],
            ),
        )
        for position, (ingredient, row) in enumerate(zip(ingredients, matched_rows, strict=True), start=1):
            group_id = str(ingredient["groupId"])
            food_id = str(row["id"])
            connection.execute(
                "INSERT INTO recipe_ingredients VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f"{recipe['id']}_ingredient_{position}",
                    recipe["id"],
                    position,
                    food_id,
                    ingredient["query"],
                    float(ingredient["grams"]),
                    ingredient["role"],
                    group_id,
                    1 if ingredient["required"] else 0,
                ),
            )
            connection.execute(
                "INSERT OR IGNORE INTO food_group_members VALUES (?, ?, ?, 'recipe_ingredient', ?)",
                (
                    stable_id("group_member", food_id, group_id),
                    food_id,
                    group_id,
                    recipe["reviewedAt"],
                ),
            )
        tag_values = [
            *(('meal_slot', value) for value in recipe["mealSlots"]),
            *(('tag', value) for value in recipe["tags"]),
            *(('dietary', value) for value in recipe["dietaryTags"]),
            *(('allergen', value) for value in recipe["allergenTags"]),
        ]
        connection.executemany(
            "INSERT INTO recipe_tags VALUES (?, ?, ?, ?)",
            [
                (stable_id("recipe_tag", str(recipe["id"]), kind, value), recipe["id"], kind, value)
                for kind, value in tag_values
            ],
        )
        count += 1
    ingredient_count = connection.execute("SELECT count(*) FROM recipe_ingredients").fetchone()[0]
    return count, ingredient_count


def add_recipes_v3(
    connection: sqlite3.Connection,
    recipes: list[dict[str, Any]],
    legacy_redirects: list[dict[str, Any]],
    ingredient_catalog: dict[str, Any],
    source_allowlist: dict[str, Any],
    group_ids: set[str],
    repository_url: str,
) -> dict[str, Any]:
    connection.row_factory = sqlite3.Row
    ingredient_rows = connection.execute("SELECT * FROM foods WHERE source='usda_fdc'").fetchall()
    ingredient_rows_by_id = {str(row["id"]): row for row in ingredient_rows}
    catalog_by_source_id = {str(item["sourceFoodId"]): item for item in ingredient_catalog["ingredients"]}
    allowlisted_sources = {str(item["id"]): item for item in source_allowlist["sources"]}
    active_ids = {str(recipe["id"]) for recipe in recipes}
    signatures: set[str] = set()
    cuisine_counts: dict[str, int] = {}
    meal_slot_counts = {slot: 0 for slot in ("breakfast", "lunch", "dinner", "snack")}
    vegetarian_count = 0
    vegan_count = 0

    for recipe in recipes:
        if recipe.get("status") != "active":
            raise ValueError(f"Generated recipe {recipe.get('id')} must be active")
        source_id = str(recipe["sourceId"])
        source = allowlisted_sources.get(source_id)
        if not source or source.get("kind") != "project_authored" or source.get("licenseId") != recipe.get("licenseId"):
            raise ValueError(f"Recipe {recipe['id']} uses a source that is not allowlisted")
        cuisine = str(recipe["cuisine"])
        if cuisine not in source.get("allowedCuisines", []):
            raise ValueError(f"Recipe {recipe['id']} uses a cuisine not allowed by its source")
        signature = str(recipe["signature"])
        if not re.fullmatch(r"[a-f0-9]{64}", signature) or signature in signatures:
            raise ValueError(f"Recipe {recipe['id']} has an invalid or duplicate signature")
        signatures.add(signature)

        total_grams = float(recipe["servingGrams"])
        ingredients = recipe["ingredients"]
        if not 4 <= len(ingredients) <= 8:
            raise ValueError(f"Recipe {recipe['id']} must contain 4-8 ingredients")
        ingredient_grams = sum(float(ingredient["grams"]) for ingredient in ingredients)
        if abs(ingredient_grams - total_grams) > 0.01:
            raise ValueError(f"Recipe {recipe['id']} serving grams do not equal its ingredient grams")

        totals: dict[str, float] = {column: 0.0 for column in NUTRIENT_COLUMNS}
        all_known: dict[str, bool] = {column: True for column in NUTRIENT_COLUMNS}
        matched_rows: list[sqlite3.Row] = []
        for ingredient in ingredients:
            group_id = str(ingredient["groupId"])
            if group_id not in group_ids:
                raise ValueError(f"Recipe {recipe['id']} uses unknown food group: {group_id}")
            source_food_id = str(ingredient.get("sourceFoodId") or "")
            curated = catalog_by_source_id.get(source_food_id)
            if not curated:
                raise ValueError(f"Recipe {recipe['id']} uses ingredient {source_food_id} outside the reviewed catalog")
            if ingredient.get("nameVi") != curated.get("nameVi") or ingredient.get("nameEn") != curated.get("nameEn"):
                raise ValueError(f"Recipe {recipe['id']} ingredient display names do not match the reviewed catalog")
            row = best_food_for_query(ingredient_rows_by_id, str(ingredient["query"]), source_food_id)
            if row["name_vi"] != curated["nameVi"] or row["name_en"] != curated["nameEn"]:
                raise ValueError(f"Built USDA display names do not match reviewed ingredient {source_food_id}")
            matched_rows.append(row)
            factor = float(ingredient["grams"]) / 100
            for column in NUTRIENT_COLUMNS:
                value = row[column]
                if value is None:
                    all_known[column] = False
                else:
                    totals[column] += float(value) * factor

        per_100g = {
            column: (totals[column] / total_grams * 100 if all_known[column] else None)
            for column in NUTRIENT_COLUMNS
        }
        if any(per_100g[column] is None for column in NUTRIENT_COLUMNS[:4]):
            raise ValueError(f"Recipe {recipe['id']} is missing a required macro nutrient")
        matched_source_ids = [str(row["source_food_id"]) for row in matched_rows]
        recipe_food_source = "vietnamese_recipe" if cuisine == "vietnamese" else "asian_recipe"
        food_values = (
            recipe["id"], recipe["nameVi"], recipe["nameEn"], recipe_food_source,
            "+".join(matched_source_ids), f"{repository_url}/blob/main/content/nutrition-recipes/{cuisine}.json",
            source_id, PACK_VERSION, recipe["licenseId"], "reviewed", recipe["reviewedAt"],
            "1 khẩu phần", total_grams,
            *[per_100g[column] for column in NUTRIENT_COLUMNS],
            "estimated_recipe",
        )
        connection.execute(
            f"""INSERT INTO foods(
              id, name_vi, name_en, source, source_food_id, source_url,
              source_dataset_id, source_dataset_version, source_license_id,
              translation_status, translation_reviewed_at, serving_label, serving_grams,
              {', '.join(NUTRIENT_COLUMNS)}, data_quality
            ) VALUES ({','.join('?' for _ in food_values)})""",
            food_values,
        )
        recipe_aliases = {
            normalize_text(str(recipe["nameVi"])),
            normalize_text(strip_accents(str(recipe["nameVi"]))),
            normalize_text(str(recipe["nameEn"])),
        }
        connection.executemany(
            "INSERT OR IGNORE INTO aliases(id, food_id, alias, language) VALUES (?, ?, ?, ?)",
            [
                (
                    stable_id("alias", str(recipe["id"]), "vi" if alias != recipe["nameEn"] else "en", alias.casefold()),
                    recipe["id"], alias, "vi" if alias != recipe["nameEn"] else "en",
                )
                for alias in recipe_aliases
            ],
        )
        connection.execute(
            """INSERT INTO recipes(
              id, food_id, name_vi, name_en, serving_grams, estimation_note,
              cuisine, region, dish_type, prep_minutes, cook_minutes, difficulty,
              status, superseded_by, signature, source_id, source_kind, source_url,
              license_id, review_status, reviewed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?, ?, ?)""",
            (
                recipe["id"], recipe["id"], recipe["nameVi"], recipe["nameEn"], total_grams,
                recipe["estimationNote"], cuisine, recipe["region"], recipe["dishType"],
                int(recipe["prepMinutes"]), int(recipe["cookMinutes"]), recipe["difficulty"],
                signature, source_id, recipe["sourceKind"],
                f"{repository_url}/blob/main/content/nutrition-recipes/{cuisine}.json",
                recipe["licenseId"], recipe["reviewStatus"], recipe["reviewedAt"],
            ),
        )

        for position, (ingredient, row) in enumerate(zip(ingredients, matched_rows, strict=True), start=1):
            group_id = str(ingredient["groupId"])
            food_id = str(row["id"])
            connection.execute(
                """INSERT INTO recipe_ingredients(
                  id, recipe_id, position, food_id, query, name_vi, name_en,
                  grams, role, group_id, is_required
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    f"{recipe['id']}_ingredient_{position}", recipe["id"], position, food_id,
                    ingredient["query"], ingredient["nameVi"], ingredient["nameEn"],
                    float(ingredient["grams"]), ingredient["role"], group_id,
                    1 if ingredient["required"] else 0,
                ),
            )
            connection.execute(
                "INSERT OR IGNORE INTO food_group_members VALUES (?, ?, ?, 'recipe_ingredient', ?)",
                (stable_id("group_member", food_id, group_id), food_id, group_id, recipe["reviewedAt"]),
            )

        for step in recipe["steps"]:
            connection.execute(
                "INSERT INTO recipe_steps VALUES (?, ?, ?, ?, ?)",
                (
                    f"{recipe['id']}_step_{int(step['position'])}", recipe["id"],
                    int(step["position"]), step["vi"], step["en"],
                ),
            )
        tag_values = [
            *(('meal_slot', value) for value in recipe["mealSlots"]),
            *(('tag', value) for value in recipe["tags"]),
            ('tag', f"cuisine:{cuisine}"),
            ('tag', f"region:{recipe['region']}"),
            ('tag', f"dish_type:{recipe['dishType']}"),
            *(('dietary', value) for value in recipe["dietaryTags"]),
            *(('allergen', value) for value in recipe["allergenTags"]),
        ]
        connection.executemany(
            "INSERT INTO recipe_tags VALUES (?, ?, ?, ?)",
            [
                (stable_id("recipe_tag", str(recipe["id"]), kind, value), recipe["id"], kind, value)
                for kind, value in tag_values
            ],
        )
        cuisine_counts[cuisine] = cuisine_counts.get(cuisine, 0) + 1
        for slot in recipe["mealSlots"]:
            meal_slot_counts[slot] += 1
        vegetarian_count += int("vegetarian" in recipe["dietaryTags"])
        vegan_count += int("vegan" in recipe["dietaryTags"])

    legacy_ids: set[str] = set()
    for redirect in legacy_redirects:
        legacy_id = str(redirect["id"])
        target_id = str(redirect["supersededBy"])
        if legacy_id in active_ids or legacy_id in legacy_ids or target_id not in active_ids:
            raise ValueError(f"Invalid legacy recipe redirect: {legacy_id} -> {target_id}")
        legacy_ids.add(legacy_id)
        connection.execute(
            """INSERT INTO recipes(
              id, food_id, name_vi, name_en, serving_grams, estimation_note,
              cuisine, region, dish_type, prep_minutes, cook_minutes, difficulty,
              status, superseded_by, signature, source_id, source_kind, source_url,
              license_id, review_status, reviewed_at
            ) VALUES (?, NULL, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL,
              'deprecated', ?, NULL, ?, 'project_authored', ?, ?, ?, ?)""",
            (
                legacy_id, f"Công thức cũ {legacy_id}", f"Legacy recipe {legacy_id}", redirect["reasonEn"],
                target_id, redirect["sourceId"], f"{repository_url}/blob/main/content/legacy-recipe-redirects.json",
                redirect["licenseId"], redirect["reviewStatus"], redirect["reviewedAt"],
            ),
        )
        connection.execute(
            "INSERT INTO recipe_redirects VALUES (?, ?, ?, ?, ?)",
            (legacy_id, target_id, redirect["reasonVi"], redirect["reasonEn"], redirect["deprecatedAt"]),
        )

    return {
        "active_recipe_count": len(recipes),
        "vietnamese_recipe_count": cuisine_counts.get("vietnamese", 0),
        "deprecated_recipe_count": len(legacy_ids),
        "recipe_redirect_count": len(legacy_ids),
        "recipe_ingredient_count": connection.execute("SELECT count(*) FROM recipe_ingredients").fetchone()[0],
        "recipe_step_count": connection.execute("SELECT count(*) FROM recipe_steps").fetchone()[0],
        "unique_recipe_signature_count": len(signatures),
        "vegetarian_recipe_count": vegetarian_count,
        "vegan_recipe_count": vegan_count,
        "cuisine_counts": dict(sorted(cuisine_counts.items())),
        "meal_slot_counts": meal_slot_counts,
    }


def finalize(connection: sqlite3.Connection, metadata: dict[str, str]) -> None:
    connection.executemany("INSERT INTO pack_meta(id, value) VALUES (?, ?)", metadata.items())
    connection.executescript(
        """
        CREATE VIRTUAL TABLE food_fts USING fts5(
          name_vi, name_en, aliases,
          tokenize='unicode61 remove_diacritics 2'
        );
        INSERT INTO food_fts(rowid, name_vi, name_en, aliases)
          SELECT f.rowid, f.name_vi, f.name_en, COALESCE(group_concat(a.alias, ' '), '')
          FROM foods f LEFT JOIN aliases a ON a.food_id=f.id
          WHERE f.translation_status='reviewed'
          GROUP BY f.rowid;
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
    recipe_paths = sorted(args.recipes.glob("*.json")) if args.recipes.is_dir() else [args.recipes]
    if not recipe_paths:
        raise ValueError(f"No recipe content found at {args.recipes}")
    recipes = [recipe for path in recipe_paths for recipe in json.loads(path.read_text(encoding="utf-8"))]
    ingredient_catalog = json.loads(args.ingredient_catalog.read_text(encoding="utf-8"))
    legacy_redirects = json.loads(args.legacy_redirects.read_text(encoding="utf-8"))
    source_allowlist = json.loads(args.source_allowlist.read_text(encoding="utf-8"))
    groups = json.loads(args.food_groups.read_text(encoding="utf-8"))
    if len(recipes) != 800:
        raise ValueError(f"Expected exactly 800 active Việt–Á recipes, got {len(recipes)}")
    if len(legacy_redirects) != 300:
        raise ValueError(f"Expected exactly 300 legacy recipe redirects, got {len(legacy_redirects)}")

    connection = sqlite3.connect(args.output)
    create_schema(connection, args.schema)
    group_ids = add_food_groups(connection, groups)
    catalog_by_source_id = {str(item["sourceFoodId"]): item for item in ingredient_catalog["ingredients"]}
    datasets = [
        (args.foundation, "usda-foundation", "2026-04"),
        (args.sr_legacy, "usda-sr-legacy", "2018-04"),
        (args.fndds, "usda-fndds", "2021-2023"),
    ]
    records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for path, dataset_id, dataset_version in datasets:
        dataset_count = 0
        for food in stream_top_level_array(path):
            record = prepare_usda_food(food, dictionary, catalog_by_source_id, dataset_id, dataset_version)
            if record is None or record["id"] in seen_ids:
                continue
            seen_ids.add(record["id"])
            records.append(record)
            dataset_count += 1
            if args.limit_per_dataset and dataset_count >= args.limit_per_dataset:
                break
        print(f"{path.name}: {dataset_count} foods")
    records, removed_duplicates = deduplicate_usda_foods(records)
    disambiguate_display_names(records)
    for record in records:
        insert_usda_food(connection, record)
    connection.commit()
    duplicate_display_names = connection.execute(
        """SELECT name_vi FROM foods WHERE translation_status='reviewed'
           GROUP BY lower(name_vi) HAVING count(*) > 1 LIMIT 5"""
    ).fetchall()
    if duplicate_display_names:
        raise ValueError(f"Searchable foods share a display name: {duplicate_display_names}")
    print(
        f"Removed {removed_duplicates['same_description']} same-description and "
        f"{removed_duplicates['same_nutrients']} same-nutrient duplicates; {len(records)} USDA foods kept"
    )

    recipe_stats = add_recipes_v3(
        connection, recipes, legacy_redirects, ingredient_catalog, source_allowlist, group_ids, repository_url
    )
    food_count = connection.execute("SELECT count(*) FROM foods").fetchone()[0]
    alias_count = connection.execute("SELECT count(*) FROM aliases WHERE language='vi'").fetchone()[0]
    vietnamese_display_food_count = connection.execute(
        "SELECT count(*) FROM foods WHERE translation_status='reviewed'"
    ).fetchone()[0]
    if alias_count < 2000:
        raise ValueError(f"Vietnamese alias coverage too small: {alias_count} (minimum 2000)")
    if vietnamese_display_food_count < 5_000:
        raise ValueError(
            f"Searchable Vietnamese display-name coverage too small: {vietnamese_display_food_count} (minimum 5000)"
        )
    created_at = PACK_CREATED_AT
    metadata = {
        "id": "gym-local-nutrition",
        "version": PACK_VERSION,
        "schema_version": str(PACK_SCHEMA_VERSION),
        "created_at": created_at,
        "food_count": str(food_count),
        "alias_count": str(alias_count),
        "vietnamese_display_food_count": str(vietnamese_display_food_count),
        "vietnamese_recipe_count": str(recipe_stats["vietnamese_recipe_count"]),
        "active_recipe_count": str(recipe_stats["active_recipe_count"]),
        "deprecated_recipe_count": str(recipe_stats["deprecated_recipe_count"]),
        "recipe_redirect_count": str(recipe_stats["recipe_redirect_count"]),
        "food_group_count": str(len(group_ids)),
        "recipe_ingredient_count": str(recipe_stats["recipe_ingredient_count"]),
        "recipe_step_count": str(recipe_stats["recipe_step_count"]),
        "unique_recipe_signature_count": str(recipe_stats["unique_recipe_signature_count"]),
        "vegetarian_recipe_count": str(recipe_stats["vegetarian_recipe_count"]),
        "vegan_recipe_count": str(recipe_stats["vegan_recipe_count"]),
        "cuisine_counts": json.dumps(recipe_stats["cuisine_counts"], sort_keys=True, separators=(",", ":")),
        "meal_slot_counts": json.dumps(recipe_stats["meal_slot_counts"], sort_keys=True, separators=(",", ":")),
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
        "minimumAppVersion": "0.7.0",
        "fileName": args.output.name,
        "downloadUrl": args.download_url,
        "sizeBytes": args.output.stat().st_size,
        "sha256": checksum,
        "foodCount": food_count,
        "aliasCount": alias_count,
        "vietnameseDisplayFoodCount": vietnamese_display_food_count,
        "vietnameseRecipeCount": recipe_stats["vietnamese_recipe_count"],
        "activeRecipeCount": recipe_stats["active_recipe_count"],
        "deprecatedRecipeCount": recipe_stats["deprecated_recipe_count"],
        "recipeRedirectCount": recipe_stats["recipe_redirect_count"],
        "foodGroupCount": len(group_ids),
        "recipeIngredientCount": recipe_stats["recipe_ingredient_count"],
        "recipeStepCount": recipe_stats["recipe_step_count"],
        "uniqueRecipeSignatureCount": recipe_stats["unique_recipe_signature_count"],
        "vegetarianRecipeCount": recipe_stats["vegetarian_recipe_count"],
        "veganRecipeCount": recipe_stats["vegan_recipe_count"],
        "cuisineCounts": recipe_stats["cuisine_counts"],
        "mealSlotCounts": recipe_stats["meal_slot_counts"],
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
                "id": "gym-local-project-authored-asian-recipes",
                "label": "Gym Local project-authored Việt–Á recipe estimates",
                "url": f"{repository_url}/tree/main/content/nutrition-recipes",
                "licenseId": "project-content",
                "licenseUrl": f"{repository_url}/blob/main/LICENSE",
                "retrievedAt": "2026-08-14",
            },
        ],
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Built {args.output} ({args.output.stat().st_size:,} bytes, {food_count} foods, "
        f"{alias_count} VI aliases, {recipe_stats['active_recipe_count']} active recipes, "
        f"{recipe_stats['deprecated_recipe_count']} redirects, {recipe_stats['recipe_ingredient_count']} recipe ingredients)"
    )


if __name__ == "__main__":
    main()
