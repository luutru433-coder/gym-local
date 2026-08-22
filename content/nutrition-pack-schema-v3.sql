PRAGMA page_size=4096;
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
PRAGMA temp_store=MEMORY;
PRAGMA foreign_keys=ON;

CREATE TABLE pack_meta (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  name_vi TEXT NOT NULL,
  name_en TEXT NOT NULL,
  source TEXT NOT NULL,
  source_food_id TEXT,
  source_url TEXT,
  source_dataset_id TEXT,
  source_dataset_version TEXT,
  source_license_id TEXT,
  translation_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (translation_status IN ('unreviewed', 'generated', 'reviewed')),
  translation_reviewed_at TEXT,
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
  id TEXT PRIMARY KEY,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  language TEXT NOT NULL,
  UNIQUE (food_id, alias)
) WITHOUT ROWID;

CREATE TABLE food_groups (
  id TEXT PRIMARY KEY,
  name_vi TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_vi TEXT NOT NULL,
  description_en TEXT NOT NULL,
  source TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE food_group_members (
  id TEXT PRIMARY KEY,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES food_groups(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  UNIQUE (food_id, group_id)
) WITHOUT ROWID;

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  food_id TEXT UNIQUE REFERENCES foods(id) ON DELETE CASCADE,
  name_vi TEXT NOT NULL,
  name_en TEXT NOT NULL,
  serving_grams REAL,
  estimation_note TEXT NOT NULL,
  cuisine TEXT,
  region TEXT,
  dish_type TEXT,
  prep_minutes INTEGER,
  cook_minutes INTEGER,
  difficulty TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'deprecated')),
  superseded_by TEXT REFERENCES recipes(id),
  signature TEXT UNIQUE,
  source_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_url TEXT NOT NULL,
  license_id TEXT NOT NULL,
  review_status TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  CHECK (
    (status = 'active' AND food_id IS NOT NULL AND serving_grams > 0 AND cuisine IS NOT NULL
      AND prep_minutes >= 0 AND cook_minutes >= 0 AND signature IS NOT NULL AND superseded_by IS NULL)
    OR
    (status = 'deprecated' AND food_id IS NULL AND superseded_by IS NOT NULL AND signature IS NULL)
  )
) WITHOUT ROWID;

CREATE TABLE recipe_redirects (
  legacy_id TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  target_recipe_id TEXT NOT NULL REFERENCES recipes(id),
  reason_vi TEXT NOT NULL,
  reason_en TEXT NOT NULL,
  deprecated_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  food_id TEXT NOT NULL REFERENCES foods(id),
  query TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  name_en TEXT NOT NULL,
  grams REAL NOT NULL CHECK (grams > 0),
  role TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES food_groups(id),
  is_required INTEGER NOT NULL CHECK (is_required IN (0, 1)),
  UNIQUE (recipe_id, position)
) WITHOUT ROWID;

CREATE TABLE recipe_steps (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  text_vi TEXT NOT NULL,
  text_en TEXT NOT NULL,
  UNIQUE (recipe_id, position)
) WITHOUT ROWID;

CREATE TABLE recipe_tags (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE (recipe_id, kind, value)
) WITHOUT ROWID;

CREATE INDEX foods_source_food_id ON foods(source, source_food_id);
CREATE INDEX foods_source_dataset ON foods(source_dataset_id, source_dataset_version);
CREATE INDEX foods_translation_status ON foods(translation_status, id);
CREATE INDEX aliases_language ON aliases(language, alias);
CREATE INDEX food_group_members_group_id ON food_group_members(group_id, food_id);
CREATE INDEX recipes_status_cuisine ON recipes(status, cuisine, region, id);
CREATE INDEX recipes_superseded_by ON recipes(superseded_by);
CREATE INDEX recipe_ingredients_food_id ON recipe_ingredients(food_id, recipe_id);
CREATE INDEX recipe_ingredients_group_id ON recipe_ingredients(group_id, recipe_id);
CREATE INDEX recipe_steps_recipe_id ON recipe_steps(recipe_id, position);
CREATE INDEX recipe_tags_value ON recipe_tags(kind, value, recipe_id);
