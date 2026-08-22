import { useMemo, useState } from "react";
import { Check, CircleAlert, PackageOpen, Plus, Save, Search, Sparkles, Trash2, Utensils } from "lucide-react";
import {
  createId,
  FOOD_GROUP_IDS,
  type FoodGroupId,
  type FoodItem,
  type MealEntry,
  type PantryItem
} from "@gym/contracts";
import { nutritionPackSupportsMenuSuggestions } from "@gym/nutrition";
import { Button, Card, EmptyState, Field, Notice, SectionTitle } from "@gym/ui";
import { formatNumber, localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";
import "./PantryMenuSection.css";

const groupLabels: Record<FoodGroupId, { vi: string; en: string }> = {
  starch: { vi: "Tinh bột", en: "Starch" },
  meat: { vi: "Thịt", en: "Meat" },
  seafood: { vi: "Cá & hải sản", en: "Fish & seafood" },
  eggs: { vi: "Trứng", en: "Eggs" },
  plant_protein: { vi: "Đạm thực vật", en: "Plant protein" },
  vegetables: { vi: "Rau", en: "Vegetables" },
  fruit: { vi: "Trái cây", en: "Fruit" },
  dairy: { vi: "Sữa", en: "Dairy" },
  fats: { vi: "Chất béo", en: "Fats" },
  seasonings: { vi: "Gia vị", en: "Seasonings" }
};

const allergenLabels = {
  egg: { vi: "Trứng", en: "Egg" },
  gluten: { vi: "Gluten", en: "Gluten" },
  fish: { vi: "Cá", en: "Fish" },
  shellfish: { vi: "Hải sản có vỏ", en: "Shellfish" },
  soy: { vi: "Đậu nành", en: "Soy" }
} as const;

const mealLabels: Record<MealEntry["meal"], { vi: string; en: string }> = {
  breakfast: { vi: "Bữa sáng", en: "Breakfast" },
  lunch: { vi: "Bữa trưa", en: "Lunch" },
  dinner: { vi: "Bữa tối", en: "Dinner" },
  snack: { vi: "Ăn nhẹ", en: "Snack" }
};

function optionalAmount(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const amount = Number(raw.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new Error("Amount must be between 0 and 1,000,000 grams");
  return amount;
}

function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function PantryMenuSection() {
  const profile = useGymStore((state) => state.profile)!;
  const pantryItems = useGymStore((state) => state.pantryItems);
  const packRecord = useGymStore((state) => state.nutritionPackRecord);
  const packManifest = useGymStore((state) => state.nutritionPackManifest);
  const suggestions = useGymStore((state) => state.menuSuggestions);
  const suggestionStatus = useGymStore((state) => state.menuSuggestionStatus);
  const suggestionError = useGymStore((state) => state.menuSuggestionError);
  const saveUserPantryItem = useGymStore((state) => state.saveUserPantryItem);
  const removePantryItem = useGymStore((state) => state.removePantryItem);
  const refreshMenuSuggestions = useGymStore((state) => state.refreshMenuSuggestions);
  const searchOfflineNutritionFoods = useGymStore((state) => state.searchOfflineNutritionFoods);
  const addMeal = useGymStore((state) => state.addMeal);
  const locale = "vi" as const;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem>();
  const [newAmount, setNewAmount] = useState("");
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [mealSlot, setMealSlot] = useState<MealEntry["meal"]>("lunch");
  const [calorieTarget, setCalorieTarget] = useState(profile.nutritionTarget ? String(Math.round(profile.nutritionTarget.calories / 3)) : "");
  const [vegetarian, setVegetarian] = useState(false);
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [loggedRecipeId, setLoggedRecipeId] = useState<string>();
  const menuReady = packRecord.status === "ready" && nutritionPackSupportsMenuSuggestions(packManifest);
  const existingGroupIds = useMemo(() => new Set(pantryItems.filter((item) => item.kind === "group").map((item) => item.groupId)), [pantryItems]);

  const searchFoods = async () => {
    if (!query.trim() || !menuReady) return;
    setSearching(true);
    setError(undefined);
    try {
      const found = await searchOfflineNutritionFoods(query.trim());
      setResults(found.filter((food) => food.source !== "vietnamese_recipe").slice(0, 12));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Offline search failed");
    } finally {
      setSearching(false);
    }
  };

  const addGroup = async (groupId: FoodGroupId) => {
    const now = new Date().toISOString();
    await saveUserPantryItem({
      id: createId("pantry"),
      kind: "group",
      groupId,
      groupNameSnapshot: groupLabels[groupId],
      createdAt: now,
      updatedAt: now
    });
  };

  const addExactFood = async () => {
    if (!selectedFood) return;
    setError(undefined);
    try {
      const amount = optionalAmount(newAmount);
      const existing = pantryItems.find((item) => item.kind === "food" && item.foodId === selectedFood.id);
      const now = new Date().toISOString();
      await saveUserPantryItem({
        id: existing?.id ?? createId("pantry"),
        kind: "food",
        foodId: selectedFood.id,
        foodNameSnapshot: { ...selectedFood.name },
        groupId: existing?.kind === "food" ? existing.groupId : undefined,
        availableGrams: amount,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
      setSelectedFood(undefined);
      setNewAmount("");
      setQuery("");
      setResults([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save pantry food");
    }
  };

  const saveAmount = async (item: PantryItem) => {
    setError(undefined);
    try {
      const raw = amountDrafts[item.id] ?? (item.availableGrams === undefined ? "" : String(item.availableGrams));
      await saveUserPantryItem({ ...item, availableGrams: optionalAmount(raw), updatedAt: new Date().toISOString() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update amount");
    }
  };

  const generateMenus = async () => {
    setError(undefined);
    setLoggedRecipeId(undefined);
    try {
      const calories = calorieTarget.trim() ? Number(calorieTarget.replace(",", ".")) : undefined;
      if (calories !== undefined && (!Number.isFinite(calories) || calories <= 0 || calories > 10_000)) {
        throw new Error(locale === "vi" ? "Mục tiêu kcal phải từ 1–10.000." : "Calorie target must be between 1 and 10,000.");
      }
      await refreshMenuSuggestions({
        mealSlot,
        calorieTarget: calories,
        dietaryTags: vegetarian ? ["vegetarian"] : [],
        excludedAllergens,
        limit: 12
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate menus");
    }
  };

  const logSuggestion = async (suggestion: (typeof suggestions)[number]) => {
    const entry: MealEntry = {
      id: createId("meal"),
      date: localDate(),
      meal: mealSlot,
      foodId: `pack_${suggestion.recipeId}`,
      foodNameSnapshot: { ...suggestion.name },
      grams: suggestion.servingGrams,
      nutrientsSnapshot: { ...suggestion.nutrients },
      createdAt: new Date().toISOString()
    };
    await addMeal(entry);
    setLoggedRecipeId(suggestion.recipeId);
  };

  return (
    <section className="pantry-menu" aria-describedby="pantry-menu-description">
      <SectionTitle
        eyebrow={locale === "vi" ? "Offline · dữ liệu của bạn" : "Offline · your data"}
        title={locale === "vi" ? "Trong bếp có gì?" : "What is in your pantry?"}
      />
      <p className="pantry-menu__intro" id="pantry-menu-description">
        {locale === "vi" ? "Nhập đúng thực phẩm hoặc chọn nhóm rộng. App ưu tiên món dùng đúng nguyên liệu bạn có và chỉ ra phần còn thiếu." : "Add exact foods or broad groups. The app prioritizes recipes using what you have and shows what is missing."}
      </p>

      {!menuReady ? <Notice tone="warning">{packRecord.status === "ready"
        ? (locale === "vi" ? "Gói đang cài là bản cũ. Hãy cập nhật kho thực phẩm schema 2 để dùng gợi ý món." : "The installed pack is older. Update to nutrition pack schema 2 for menu suggestions.")
        : (locale === "vi" ? "Tải kho thực phẩm offline ở phía trên trước khi thêm thực phẩm theo tên và tạo gợi ý." : "Install the offline food library above before searching foods and generating menus.")}</Notice> : null}

      <div className="pantry-menu__workspace">
        <Card className="pantry-builder">
          <div className="pantry-builder__heading"><PackageOpen size={23} /><div><h3>{locale === "vi" ? "Kho nguyên liệu của tôi" : "My pantry"}</h3><p>{locale === "vi" ? "Số gram là tùy chọn." : "Amounts are optional."}</p></div></div>
          <div className="pantry-groups" aria-label={locale === "vi" ? "Thêm nhóm thực phẩm" : "Add food group"}>
            {FOOD_GROUP_IDS.map((groupId) => <button type="button" key={groupId} disabled={existingGroupIds.has(groupId)} aria-pressed={existingGroupIds.has(groupId)} onClick={() => void addGroup(groupId)}><Plus size={14} />{groupLabels[groupId][locale]}</button>)}
          </div>

          <div className="pantry-search">
            <div className="search-box"><Search size={18} /><input aria-label={locale === "vi" ? "Tìm thực phẩm cho kho" : "Search pantry foods"} value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); }} onKeyDown={(event) => { if (event.key === "Enter") void searchFoods(); }} placeholder={locale === "vi" ? "Ví dụ: ức gà, cơm, bông cải…" : "For example: chicken, rice, broccoli…"} /></div>
            <Button size="sm" variant="secondary" disabled={!menuReady || searching || !query.trim()} onClick={() => void searchFoods()}>{searching ? "…" : (locale === "vi" ? "Tìm" : "Search")}</Button>
          </div>
          {results.length ? <div className="pantry-search-results" aria-label={locale === "vi" ? "Kết quả thực phẩm" : "Food results"}>{results.map((food) => <button type="button" aria-pressed={selectedFood?.id === food.id} key={food.id} onClick={() => setSelectedFood(food)}><span><strong>{localize(food.name, locale)}</strong><small>{formatNumber(food.per100g.calories, locale, 0)} kcal / 100g · USDA</small></span>{selectedFood?.id === food.id ? <Check size={17} /> : <Plus size={17} />}</button>)}</div> : null}
          {selectedFood ? <div className="pantry-add-selected"><div><small>{locale === "vi" ? "Đã chọn" : "Selected"}</small><strong>{localize(selectedFood.name, locale)}</strong></div><Field label={locale === "vi" ? "Đang có (g, tùy chọn)" : "Available (g, optional)"}><input inputMode="decimal" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} placeholder="500" /></Field><Button size="sm" onClick={() => void addExactFood()}><Plus size={16} />{locale === "vi" ? "Thêm vào kho" : "Add to pantry"}</Button></div> : null}

          {pantryItems.length ? <ul className="pantry-list">{pantryItems.map((item) => {
            const name = item.kind === "food" ? localize(item.foodNameSnapshot, locale) : localize(item.groupNameSnapshot, locale);
            const amount = amountDrafts[item.id] ?? (item.availableGrams === undefined ? "" : String(item.availableGrams));
            return <li key={item.id}><span className={`pantry-list__kind pantry-list__kind--${item.kind}`}>{item.kind === "food" ? (locale === "vi" ? "Đúng món" : "Exact") : (locale === "vi" ? "Nhóm" : "Group")}</span><div><strong>{name}</strong><small>{item.availableGrams === undefined ? (locale === "vi" ? "Không giới hạn lượng" : "Amount not specified") : `${formatNumber(item.availableGrams, locale)} g`}</small></div><input aria-label={`${locale === "vi" ? "Số gram" : "Grams"}: ${name}`} inputMode="decimal" value={amount} onChange={(event) => setAmountDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="g" /><button type="button" onClick={() => void saveAmount(item)} aria-label={`${locale === "vi" ? "Lưu số gram" : "Save grams"}: ${name}`}><Save size={16} /></button><button type="button" onClick={() => void removePantryItem(item.id)} aria-label={`${locale === "vi" ? "Xóa khỏi kho" : "Remove from pantry"}: ${name}`}><Trash2 size={16} /></button></li>;
          })}</ul> : <EmptyState title={locale === "vi" ? "Kho đang trống" : "Your pantry is empty"} body={locale === "vi" ? "Chọn một nhóm hoặc tìm đúng thực phẩm ở trên." : "Choose a group or search for an exact food above."} />}
        </Card>

        <Card className="menu-controls">
          <div className="pantry-builder__heading"><Sparkles size={23} /><div><h3>{locale === "vi" ? "Bộ lọc gợi ý" : "Suggestion filters"}</h3><p>{locale === "vi" ? "Chỉ lọc theo điều bạn chọn." : "Only selected filters are applied."}</p></div></div>
          <div className="menu-controls__grid"><Field label={locale === "vi" ? "Bữa" : "Meal"}><select value={mealSlot} onChange={(event) => setMealSlot(event.target.value as MealEntry["meal"])}>{(Object.keys(mealLabels) as MealEntry["meal"][]).map((meal) => <option value={meal} key={meal}>{mealLabels[meal][locale]}</option>)}</select></Field><Field label={locale === "vi" ? "Mục tiêu kcal (tùy chọn)" : "Calorie target (optional)"}><input inputMode="numeric" value={calorieTarget} onChange={(event) => setCalorieTarget(event.target.value.replace(/[^0-9.,]/g, ""))} /></Field></div>
          <label className="menu-toggle"><input type="checkbox" checked={vegetarian} onChange={(event) => setVegetarian(event.target.checked)} /><span>{locale === "vi" ? "Chỉ món chay" : "Vegetarian only"}</span></label>
          <fieldset className="allergen-picker"><legend>{locale === "vi" ? "Loại trừ dị ứng" : "Exclude allergens"}</legend>{Object.entries(allergenLabels).map(([value, label]) => <label key={value}><input type="checkbox" checked={excludedAllergens.includes(value)} onChange={(event) => setExcludedAllergens((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value))} /><span>{label[locale]}</span></label>)}</fieldset>
          <Button full disabled={!menuReady || !pantryItems.length || suggestionStatus === "loading"} onClick={() => void generateMenus()}><Sparkles size={17} />{suggestionStatus === "loading" ? (locale === "vi" ? "Đang tính…" : "Ranking…") : (locale === "vi" ? "Gợi ý món phù hợp" : "Suggest matching meals")}</Button>
          <p className="menu-controls__note">{locale === "vi" ? "Ước tính dinh dưỡng, không phải tư vấn y tế. Dị ứng dựa trên tag đã rà soát nhưng vẫn cần kiểm tra nguyên liệu thực tế." : "Nutrition is estimated, not medical advice. Allergen tags are reviewed, but always check actual ingredients."}</p>
        </Card>
      </div>

      {error || suggestionError ? <Notice tone="warning">{error ?? suggestionError}</Notice> : null}
      <div className="menu-results" aria-live="polite">
        {suggestions.map((suggestion) => <Card className="menu-suggestion" key={suggestion.recipeId}>
          <header><div><span className={suggestion.completeRequired ? "menu-match menu-match--complete" : "menu-match"}>{suggestion.completeRequired ? (locale === "vi" ? "Đủ nguyên liệu chính" : "Main ingredients ready") : `${Math.round(suggestion.requiredCoverage * 100)}% ${locale === "vi" ? "phù hợp" : "matched"}`}</span><h3>{localize(suggestion.name, locale)}</h3><p>{formatNumber(suggestion.nutrients.calories, locale)} kcal · Đạm {formatNumber(suggestion.nutrients.protein, locale)}g · Bột đường {formatNumber(suggestion.nutrients.carbs, locale)}g · Béo {formatNumber(suggestion.nutrients.fat, locale)}g</p></div><Utensils size={22} /></header>
          <ul>{suggestion.ingredients.map((ingredient) => {
            const sufficient = ingredient.availabilityRatio >= 1;
            const status = sufficient ? ingredient.matchedBy : "missing";
            const label = status === "exact" ? (locale === "vi" ? "đúng món" : "exact") : status === "group" ? (locale === "vi" ? "theo nhóm" : "by group") : (locale === "vi" ? "còn thiếu" : "missing");
            return <li key={`${suggestion.recipeId}-${ingredient.position}`} className={`ingredient-match ingredient-match--${status}`}>{status === "missing" ? <CircleAlert size={15} /> : <Check size={15} />}<span><strong>{localize(ingredient.name, locale)}</strong><small>{ingredient.grams}g · {label}{!sufficient && ingredient.availabilityRatio > 0 ? ` (${Math.round(ingredient.availabilityRatio * 100)}%)` : ""}</small></span></li>;
          })}</ul>
          <footer><span>{suggestion.exactMatchCount} {locale === "vi" ? "khớp chính xác" : "exact"} · {suggestion.groupMatchCount} {locale === "vi" ? "theo nhóm" : "by group"}</span><Button size="sm" variant="secondary" onClick={() => void logSuggestion(suggestion)}>{loggedRecipeId === suggestion.recipeId ? <Check size={15} /> : <Plus size={15} />}{loggedRecipeId === suggestion.recipeId ? (locale === "vi" ? "Đã ghi" : "Logged") : (locale === "vi" ? "Ghi 1 khẩu phần" : "Log 1 serving")}</Button></footer>
        </Card>)}
        {suggestionStatus === "ready" && !suggestions.length ? <EmptyState title={locale === "vi" ? "Chưa có món phù hợp bộ lọc" : "No meals match these filters"} body={locale === "vi" ? "Thêm nhóm thực phẩm, bỏ bớt bộ lọc dị ứng/chế độ ăn, hoặc đổi bữa." : "Add food groups, relax filters, or choose another meal."} /> : null}
      </div>
    </section>
  );
}
