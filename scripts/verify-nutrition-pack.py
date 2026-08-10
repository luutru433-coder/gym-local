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
assert manifest["aliasCount"] >= 2000, "too few Vietnamese aliases"
assert manifest["vietnameseRecipeCount"] == 300, "recipe count must be 300"

connection = sqlite3.connect(f"file:{args.db.as_posix()}?mode=ro", uri=True)
connection.row_factory = sqlite3.Row
assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
food_count = connection.execute("SELECT count(*) FROM foods").fetchone()[0]
alias_count = connection.execute("SELECT count(*) FROM aliases WHERE language='vi'").fetchone()[0]
recipe_count = connection.execute("SELECT count(*) FROM foods WHERE source='vietnamese_recipe'").fetchone()[0]
assert food_count == manifest["foodCount"]
assert alias_count == manifest["aliasCount"]
assert recipe_count == manifest["vietnameseRecipeCount"]

for query in ('"ức"* "gà"*', '"uc"* "ga"*', '"cơm"* "gà"*', '"chicken"* "breast"*'):
    row = connection.execute(
        "SELECT f.name_vi, f.name_en, f.calories, f.protein, f.iron_mg, f.vitamin_c_mg "
        "FROM food_fts JOIN foods f ON f.rowid=food_fts.rowid WHERE food_fts MATCH ? LIMIT 1",
        (query,),
    ).fetchone()
    assert row is not None, f"FTS query returned no results: {query}"
    assert row["calories"] >= 0 and row["protein"] >= 0

metadata = dict(connection.execute("SELECT key, value FROM pack_meta"))
assert int(metadata["food_count"]) == food_count
assert int(metadata["alias_count"]) == alias_count
connection.close()
print(f"PASS nutrition pack: {food_count} foods, {alias_count} VI aliases, {recipe_count} recipes, SHA-256 {manifest['sha256']}")
