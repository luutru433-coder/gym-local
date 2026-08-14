import { useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Barcode, Camera, Check, ChevronRight, CookingPot, Database, Download, Droplets, Flame, HardDrive, Heart, Pencil, Plus, Salad, ScanLine, Search, ShieldCheck, Trash2, Utensils } from "lucide-react";
import { Button, Card, EmptyState, Field, MetricRing, Modal, Notice, ProgressBar, SectionTitle } from "@gym/ui";
import type { FoodItem, MealEntry, Recipe } from "@gym/contracts";
import { assessNutrientCompleteness, completeFoodLookupCandidate, createMealEntry, createMealEntryFromRecipe, createRecipe, createWaterEntry, dailyNutrition, dailyNutritionWithMicronutrients, estimateNutritionTarget, nutritionTargetNeedsConfirmation, parseNutritionNumber, rankFoodsByPreference, recipeNutrition, upsertFoodPreference, validateCustomFoodDraft, validateMealInput, type FoodLookupCandidate, type NutritionEstimateInput, type NutritionValidationError } from "@gym/nutrition";
import { formatNumber, localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";
import { PantryMenuSection } from "./PantryMenuSection";
import "./NutritionPage.css";

const mealLabels: Record<MealEntry["meal"], { vi: string; en: string }> = {
  breakfast: { vi: "Bữa sáng", en: "Breakfast" },
  lunch: { vi: "Bữa trưa", en: "Lunch" },
  dinner: { vi: "Bữa tối", en: "Dinner" },
  snack: { vi: "Ăn nhẹ", en: "Snack" }
};

function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatBytes(value: number, locale: "vi" | "en"): string {
  if (value < 1024 * 1024) return `${formatNumber(value / 1024, locale, 0)} KB`;
  return `${formatNumber(value / 1024 / 1024, locale, 1)} MB`;
}

export function NutritionPage() {
  const profile = useGymStore((state) => state.profile)!;
  const foods = useGymStore((state) => state.foods);
  const meals = useGymStore((state) => state.meals);
  const waterEntries = useGymStore((state) => state.waterEntries);
  const foodPreferences = useGymStore((state) => state.foodPreferences);
  const recipes = useGymStore((state) => state.recipes);
  const addFood = useGymStore((state) => state.addFood);
  const addMeal = useGymStore((state) => state.addMeal);
  const updateMeal = useGymStore((state) => state.updateMeal);
  const removeMeal = useGymStore((state) => state.removeMeal);
  const addWater = useGymStore((state) => state.addWater);
  const removeWater = useGymStore((state) => state.removeWater);
  const saveUserFoodPreference = useGymStore((state) => state.saveUserFoodPreference);
  const saveUserRecipe = useGymStore((state) => state.saveUserRecipe);
  const removeRecipe = useGymStore((state) => state.removeRecipe);
  const packManifest = useGymStore((state) => state.nutritionPackManifest);
  const packRecord = useGymStore((state) => state.nutritionPackRecord);
  const packError = useGymStore((state) => state.nutritionPackError);
  const refreshNutritionPack = useGymStore((state) => state.refreshNutritionPack);
  const installOfflineNutritionPack = useGymStore((state) => state.installOfflineNutritionPack);
  const removeOfflineNutritionPack = useGymStore((state) => state.removeOfflineNutritionPack);
  const searchOfflineNutritionFoods = useGymStore((state) => state.searchOfflineNutritionFoods);
  const lookupBarcodeFood = useGymStore((state) => state.lookupBarcodeFood);
  const locale = profile.locale;
  const [date, setDate] = useState(localDate());
  const [addOpen, setAddOpen] = useState(false);
  const [mealType, setMealType] = useState<MealEntry["meal"]>("breakfast");
  const [foodQuery, setFoodQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<FoodItem>();
  const [editingMealId, setEditingMealId] = useState<string>();
  const [grams, setGrams] = useState("100");
  const [barcode, setBarcode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string>();
  const [lookupCandidate, setLookupCandidate] = useState<FoodLookupCandidate>();
  const [lookupValues, setLookupValues] = useState({ calories: "", protein: "", carbs: "", fat: "" });
  const [formErrors, setFormErrors] = useState<NutritionValidationError[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [nutritionError, setNutritionError] = useState<string>();
  const [offlineResults, setOfflineResults] = useState<FoodItem[]>([]);
  const [offlineSearchBusy, setOfflineSearchBusy] = useState(false);
  const [waterAmount, setWaterAmount] = useState("250");
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string>();
  const [recipeName, setRecipeName] = useState("");
  const [recipeYield, setRecipeYield] = useState("500");
  const [recipeServings, setRecipeServings] = useState("2");
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ foodId: string; grams: string }>>([]);

  const dayMeals = useMemo(() => meals.filter((entry) => entry.date === date), [date, meals]);
  const total = dailyNutrition(meals, date);
  const micronutrientTotal = dailyNutritionWithMicronutrients(meals, date);
  const micronutrientCompleteness = assessNutrientCompleteness(micronutrientTotal);
  const dayWaterEntries = useMemo(() => waterEntries.filter((entry) => entry.date === date), [date, waterEntries]);
  const dayWaterMl = dayWaterEntries.reduce((sum, entry) => sum + entry.amountMl, 0);
  const currentEstimateInput = useMemo<NutritionEstimateInput | undefined>(() => {
    if (!profile.age || !profile.heightCm || !profile.weightKg || !profile.activityFactor || (profile.biologicalSex !== "female" && profile.biologicalSex !== "male")) return undefined;
    return { age: profile.age, heightCm: profile.heightCm, weightKg: profile.weightKg, activityFactor: profile.activityFactor, biologicalSex: profile.biologicalSex, goal: profile.goal };
  }, [profile.activityFactor, profile.age, profile.biologicalSex, profile.goal, profile.heightCm, profile.weightKg]);
  const currentEstimatedTarget = useMemo(() => {
    if (!currentEstimateInput) return undefined;
    try {
      return estimateNutritionTarget(currentEstimateInput);
    } catch {
      return undefined;
    }
  }, [currentEstimateInput]);
  const targetIsCurrent = Boolean(profile.nutritionTarget && currentEstimatedTarget
    && !nutritionTargetNeedsConfirmation(profile.nutritionTarget, currentEstimateInput));
  const target = targetIsCurrent ? profile.nutritionTarget : undefined;
  const filteredFoods = rankFoodsByPreference(foods, foodPreferences, locale, foodQuery);
  const visibleFoods = [...filteredFoods, ...offlineResults.filter((candidate) => !filteredFoods.some((saved) => saved.id === candidate.id))];

  useEffect(() => {
    void refreshNutritionPack().catch(() => undefined);
  }, [refreshNutritionPack]);

  const openAdd = (meal: MealEntry["meal"]) => {
    setMealType(meal);
    setEditingMealId(undefined);
    setSelectedFood(undefined);
    setFoodQuery("");
    setOfflineResults([]);
    setLookupCandidate(undefined);
    setFormErrors([]);
    setLookupError(undefined);
    setAddOpen(true);
  };

  const lookup = async (value = barcode) => {
    setLookupBusy(true);
    setLookupError(undefined);
    try {
      const food = await lookupBarcodeFood(value);
      if (!food) {
        setLookupError(locale === "vi" ? "Không tìm thấy sản phẩm. Bạn có thể tạo thực phẩm thủ công." : "Product not found. You can create it manually.");
      } else {
        setBarcode(food.barcode);
        const values = {
          calories: food.per100g.calories == null ? "" : String(food.per100g.calories),
          protein: food.per100g.protein == null ? "" : String(food.per100g.protein),
          carbs: food.per100g.carbs == null ? "" : String(food.per100g.carbs),
          fat: food.per100g.fat == null ? "" : String(food.per100g.fat)
        };
        setLookupValues(values);
        if (food.missingCoreNutrients.length) {
          setLookupCandidate(food);
          setSelectedFood(undefined);
          setLookupError(locale === "vi" ? "Nguồn còn thiếu calories hoặc macro. Hãy nhập các giá trị còn thiếu theo nhãn sản phẩm." : "The source is missing calories or macros. Fill the missing values from the product label.");
        } else {
          const completed = completeFoodLookupCandidate(food, values, locale);
          if (!completed.ok) {
            setFormErrors(completed.errors);
            return;
          }
          await addFood(completed.value);
          setSelectedFood(completed.value);
          setLookupCandidate(undefined);
        }
      }
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setLookupBusy(false);
    }
  };

  const submitMeal = async () => {
    if (!selectedFood) return;
    const validated = validateMealInput(grams, date, locale);
    if (!validated.ok) {
      setFormErrors(validated.errors);
      return;
    }
    setFormErrors([]);
    try {
      if (!foods.some((food) => food.id === selectedFood.id)) await addFood(selectedFood);
      const created = createMealEntry(selectedFood, validated.value.grams, validated.value.date, mealType);
      if (editingMealId) {
        const original = meals.find((entry) => entry.id === editingMealId);
        await updateMeal({ ...created, id: editingMealId, createdAt: original?.createdAt ?? created.createdAt });
      } else {
        await addMeal(created);
      }
      setAddOpen(false);
      setSelectedFood(undefined);
      setEditingMealId(undefined);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : (locale === "vi" ? "Không thể lưu món ăn." : "Could not save the meal."));
    }
  };

  const installPack = async () => {
    if (!packManifest || packRecord.status === "downloading" || packRecord.status === "installing") return;
    setNutritionError(undefined);
    try {
      await installOfflineNutritionPack();
    } catch (error) {
      setNutritionError(error instanceof Error ? error.message : "Nutrition pack install failed");
    }
  };

  const removePack = async () => {
    const approved = window.confirm(locale === "vi" ? "Xóa gói thực phẩm offline? Nhật ký và thực phẩm đã lưu vẫn được giữ nguyên." : "Remove the offline food pack? Diary entries and saved foods will remain.");
    if (!approved) return;
    try {
      await removeOfflineNutritionPack();
      setOfflineResults([]);
    } catch (error) {
      setNutritionError(error instanceof Error ? error.message : (locale === "vi" ? "Không thể xóa gói dinh dưỡng." : "Could not remove the nutrition pack."));
    }
  };

  const searchFoods = async () => {
    if (!foodQuery.trim() || packRecord.status !== "ready") return;
    setOfflineSearchBusy(true);
    setLookupError(undefined);
    try {
      setOfflineResults(await searchOfflineNutritionFoods(foodQuery.trim()));
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Offline search failed");
    } finally {
      setOfflineSearchBusy(false);
    }
  };

  const removeMealEntry = async (id: string) => {
    try {
      await removeMeal(id);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : (locale === "vi" ? "Không thể xóa món khỏi nhật ký." : "Could not remove the diary entry."));
    }
  };

  const editMealEntry = (entry: MealEntry) => {
    const food = foods.find((item) => item.id === entry.foodId) ?? {
      id: entry.foodId,
      name: entry.foodNameSnapshot,
      per100g: {
        calories: entry.nutrientsSnapshot.calories * 100 / entry.grams,
        protein: entry.nutrientsSnapshot.protein * 100 / entry.grams,
        carbs: entry.nutrientsSnapshot.carbs * 100 / entry.grams,
        fat: entry.nutrientsSnapshot.fat * 100 / entry.grams
      },
      source: "custom" as const,
      dataQuality: "partial" as const,
      updatedAt: entry.createdAt
    };
    setEditingMealId(entry.id);
    setMealType(entry.meal);
    setDate(entry.date);
    setSelectedFood(food);
    setGrams(String(entry.grams));
    setFoodQuery("");
    setOfflineResults([]);
    setFormErrors([]);
    setLookupError(undefined);
    setAddOpen(true);
  };

  const submitCustom = async () => {
    const validated = validateCustomFoodDraft(custom, locale);
    if (!validated.ok) {
      setFormErrors(validated.errors);
      return;
    }
    setFormErrors([]);
    try {
      await addFood(validated.value);
      setSelectedFood(validated.value);
      setCustomOpen(false);
      setCustom({ name: "", calories: "", protein: "", carbs: "", fat: "" });
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : (locale === "vi" ? "Không thể lưu thực phẩm." : "Could not save the food."));
    }
  };

  const completeLookup = async () => {
    if (!lookupCandidate) return;
    const completed = completeFoodLookupCandidate(lookupCandidate, lookupValues, locale);
    if (!completed.ok) {
      setFormErrors(completed.errors);
      return;
    }
    setFormErrors([]);
    try {
      await addFood(completed.value);
      setSelectedFood(completed.value);
      setLookupCandidate(undefined);
      setLookupError(undefined);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : (locale === "vi" ? "Không thể lưu thực phẩm." : "Could not save the food."));
    }
  };

  const gramsPreview = parseNutritionNumber(grams, locale, "grams", { min: 0.1, max: 100_000 });

  const toggleFavorite = async (food: FoodItem) => {
    const existing = foodPreferences.find((preference) => preference.foodId === food.id);
    await saveUserFoodPreference(upsertFoodPreference(existing, food.id, { favorite: !existing?.favorite }));
  };

  const logWater = async () => {
    const amountMl = Number(waterAmount.replace(",", "."));
    if (!Number.isFinite(amountMl) || amountMl < 1 || amountMl > 20_000) {
      setNutritionError(locale === "vi" ? "Lượng nước phải từ 1–20.000 ml." : "Water must be between 1–20,000 ml.");
      return;
    }
    try {
      await addWater(createWaterEntry(amountMl, date));
      setNutritionError(undefined);
    } catch (error) {
      setNutritionError(error instanceof Error ? error.message : "Could not save water");
    }
  };

  const openRecipeEditor = (recipe?: Recipe) => {
    setEditingRecipeId(recipe?.id);
    setRecipeName(recipe ? localize(recipe.name, locale) : "");
    setRecipeYield(String(recipe?.yieldGrams ?? 500));
    setRecipeServings(recipe?.servings ? String(recipe.servings) : "2");
    setRecipeIngredients(recipe
      ? recipe.ingredients.map((ingredient) => ({ foodId: ingredient.foodId, grams: String(ingredient.grams) }))
      : [{ foodId: foods[0]?.id ?? "", grams: "100" }]);
    setNutritionError(undefined);
    setRecipeOpen(true);
  };

  const recipeFood = (foodId: string, existing?: Recipe): FoodItem | undefined => {
    const saved = foods.find((food) => food.id === foodId);
    if (saved) return saved;
    const ingredient = existing?.ingredients.find((item) => item.foodId === foodId);
    return ingredient ? {
      id: ingredient.foodId,
      name: ingredient.foodNameSnapshot,
      per100g: ingredient.nutrientsPer100gSnapshot,
      source: "custom",
      dataQuality: "partial",
      updatedAt: existing?.updatedAt ?? new Date().toISOString()
    } : undefined;
  };

  const submitRecipe = async () => {
    const original = recipes.find((recipe) => recipe.id === editingRecipeId);
    try {
      const ingredients = recipeIngredients.map((ingredient) => ({
        food: recipeFood(ingredient.foodId, original),
        grams: Number(ingredient.grams.replace(",", "."))
      }));
      if (ingredients.some((ingredient) => !ingredient.food)) throw new Error(locale === "vi" ? "Hãy chọn thực phẩm cho mọi nguyên liệu." : "Choose a food for every ingredient.");
      const saved = createRecipe(recipeName, ingredients as Array<{ food: FoodItem; grams: number }>, {
        id: original?.id,
        yieldGrams: Number(recipeYield.replace(",", ".")),
        servings: Number(recipeServings.replace(",", ".")),
        createdAt: original?.createdAt
      });
      await saveUserRecipe(saved);
      setRecipeOpen(false);
      setNutritionError(undefined);
    } catch (error) {
      setNutritionError(error instanceof Error ? error.message : "Could not save recipe");
    }
  };

  const logRecipeServing = async (recipe: Recipe) => {
    try {
      await addMeal(createMealEntryFromRecipe(recipe, undefined, date, "snack"));
      setNutritionError(undefined);
    } catch (error) {
      setNutritionError(error instanceof Error ? error.message : "Could not log recipe");
    }
  };

  return (
    <div className="page nutrition-page">
      <header className="page-header nutrition-header">
        <div><span className="eyebrow">{locale === "vi" ? "Theo dõi đơn giản" : "Simple tracking"}</span><h1>{locale === "vi" ? "Dinh dưỡng" : "Nutrition"}</h1><p>{locale === "vi" ? "Calories và macro được tính theo đúng lượng thực phẩm bạn nhập." : "Calories and macros use the exact food amount you log."}</p></div>
        <label className="date-control"><span>{locale === "vi" ? "Ngày" : "Date"}</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </header>

      {target ? (
        <Card className="macro-dashboard">
          <div className="calorie-summary">
            <span className="calorie-summary__icon"><Flame size={25} /></span>
            <div><span>{locale === "vi" ? "Đã ăn" : "Consumed"}</span><strong>{formatNumber(total.calories, locale)} <small>/ {target.calories} kcal</small></strong><ProgressBar value={(total.calories / target.calories) * 100} /></div>
            <em>{Math.max(0, target.calories - total.calories)}<small>{locale === "vi" ? "còn lại" : "remaining"}</small></em>
          </div>
          <div className="ring-row ring-row--nutrition">
            <MetricRing value={total.protein} max={target.protein} label="Protein" unit="g" tone="coral" />
            <MetricRing value={total.carbs} max={target.carbs} label="Carbs" unit="g" tone="sky" />
            <MetricRing value={total.fat} max={target.fat} label="Fat" unit="g" tone="gold" />
          </div>
        </Card>
      ) : <Notice tone="warning">{profile.nutritionTarget && !targetIsCurrent ? (locale === "vi" ? "Mục tiêu cũ không còn khớp thông tin cơ thể hiện tại. Hãy kiểm tra và lưu lại trong Cài đặt." : "The previous target no longer matches your current body details. Review and save them in Settings.") : (locale === "vi" ? "Chưa có mục tiêu dinh dưỡng. Bạn có thể thêm số đo trong Cài đặt để app ước tính calories và macro." : "No nutrition target yet. Add body details in Settings for an estimate.")}</Notice>}

      {dayMeals.length && !micronutrientCompleteness.complete ? <Notice tone="warning">{locale === "vi" ? `Nhật ký hôm nay có dữ liệu cho ${micronutrientCompleteness.availableCount}/${micronutrientCompleteness.totalCount} vi chất. Phần còn thiếu được để trống, không tự tính là 0.` : `Today's diary covers ${micronutrientCompleteness.availableCount}/${micronutrientCompleteness.totalCount} micronutrients. Missing values remain unknown and are not counted as zero.`}</Notice> : null}

      <section className="recipe-section">
        <SectionTitle eyebrow={`${recipes.length} ${locale === "vi" ? "công thức" : "recipes"}`} title={locale === "vi" ? "Món tự nấu" : "My recipes"} action={<Button size="sm" variant="secondary" disabled={!foods.length} onClick={() => openRecipeEditor()}><Plus size={16} />{locale === "vi" ? "Tạo công thức" : "Create recipe"}</Button>} />
        {recipes.length ? <div className="recipe-grid">{recipes.map((recipe) => { const nutrition = recipeNutrition(recipe); const serving = nutrition.perServing ?? nutrition.total; return <Card className="recipe-card" key={recipe.id}><span className="recipe-card__icon"><CookingPot size={20} /></span><div><h3>{localize(recipe.name, locale)}</h3><p>{recipe.ingredients.length} {locale === "vi" ? "nguyên liệu" : "ingredients"} · {recipe.servings ?? 1} {locale === "vi" ? "khẩu phần" : "servings"}</p><strong>{serving.calories} kcal · P {serving.protein}g · C {serving.carbs}g · F {serving.fat}g</strong><small>{nutrition.completeness.percent}% {locale === "vi" ? "vi chất có dữ liệu" : "micronutrient data available"}</small></div><div className="recipe-card__actions"><Button size="sm" onClick={() => void logRecipeServing(recipe)}>{locale === "vi" ? "+ 1 phần" : "+ 1 serving"}</Button><button type="button" onClick={() => openRecipeEditor(recipe)} aria-label={locale === "vi" ? `Sửa ${localize(recipe.name, locale)}` : `Edit ${localize(recipe.name, locale)}`}><Pencil size={15} /></button><button type="button" onClick={() => { if (window.confirm(locale === "vi" ? "Xóa công thức? Nhật ký cũ vẫn được giữ." : "Delete recipe? Existing diary entries remain.")) void removeRecipe(recipe.id); }} aria-label={locale === "vi" ? `Xóa ${localize(recipe.name, locale)}` : `Delete ${localize(recipe.name, locale)}`}><Trash2 size={15} /></button></div></Card>; })}</div> : <p className="recipe-empty">{foods.length ? (locale === "vi" ? "Ghép thực phẩm đã lưu thành công thức để ghi nhanh theo khẩu phần." : "Combine saved foods into recipes for quick serving-based logging.") : (locale === "vi" ? "Hãy tạo hoặc lưu ít nhất một thực phẩm trước." : "Create or save at least one food first.")}</p>}
      </section>

      <Card className="nutrition-pack-card">
        <div className="nutrition-pack-card__icon"><Database size={27} /></div>
        <div className="nutrition-pack-card__copy"><span className="eyebrow">{locale === "vi" ? "Tùy chọn · chỉ tải khi bạn đồng ý" : "Optional · downloads only on your click"}</span><h2>{locale === "vi" ? "Kho thực phẩm offline" : "Offline food library"}</h2><p>{locale === "vi" ? "USDA Foundation + SR Legacy + FNDDS, tìm tiếng Việt/không dấu, gồm vi chất và 300 món Việt ước tính." : "USDA Foundation + SR Legacy + FNDDS, Vietnamese/accentless search, micronutrients, and 300 estimated Vietnamese dishes."}</p></div>
        <div className="nutrition-pack-card__stats"><span><strong>{formatNumber(packManifest?.foodCount ?? 13_835, locale)}</strong>{locale === "vi" ? "thực phẩm" : "foods"}</span><span><strong>{formatNumber(packManifest?.aliasCount ?? 24_907, locale)}</strong>{locale === "vi" ? "alias VI" : "VI aliases"}</span><span><strong>300</strong>{locale === "vi" ? "món Việt" : "VI dishes"}</span></div>
        <div className="nutrition-pack-card__action">
          {packRecord.status === "ready" ? <><span className="pack-ready"><ShieldCheck size={16} />{locale === "vi" ? `Đã cài v${packRecord.version}` : `Installed v${packRecord.version}`}</span><Button size="sm" variant="ghost" onClick={() => void removePack()}>{locale === "vi" ? "Xóa gói" : "Remove"}</Button></> : <Button disabled={!packManifest || packRecord.status === "downloading" || packRecord.status === "installing"} onClick={() => void installPack()}><Download size={17} />{packRecord.status === "downloading" ? (locale === "vi" ? "Đang tải…" : "Downloading…") : `${locale === "vi" ? "Tải & cài" : "Download & install"} ${packManifest ? formatBytes(packManifest.sizeBytes, locale) : ""}`}</Button>}
          {packRecord.status === "downloading" ? <div className="pack-progress"><ProgressBar value={(packRecord.bytesDownloaded / Math.max(1, packRecord.totalBytes ?? 1)) * 100} /><small>{formatBytes(packRecord.bytesDownloaded, locale)} / {packRecord.totalBytes ? formatBytes(packRecord.totalBytes, locale) : "—"}</small></div> : null}
          {packError || nutritionError ? <small className="pack-error" role="alert">{nutritionError ?? packError}</small> : null}
        </div>
      </Card>

      <PantryMenuSection />

      <div className="meal-layout">
        <section>
          <SectionTitle eyebrow={`${dayMeals.length} ${locale === "vi" ? "món đã ghi" : "entries"}`} title={locale === "vi" ? "Nhật ký ăn uống" : "Food diary"} />
          <div className="meal-groups">
            {(Object.keys(mealLabels) as MealEntry["meal"][]).map((meal) => {
              const entries = dayMeals.filter((entry) => entry.meal === meal);
              const calories = entries.reduce((sum, entry) => sum + entry.nutrientsSnapshot.calories, 0);
              return (
                <Card className="meal-card" key={meal}>
                  <header><span className="meal-card__icon"><Utensils size={18} /></span><div><h3>{mealLabels[meal][locale]}</h3><p>{calories} kcal</p></div><button type="button" className="icon-button" onClick={() => openAdd(meal)} aria-label={`Add ${meal}`}><Plus size={20} /></button></header>
                  {entries.length ? <ul>{entries.map((entry) => <li key={entry.id}><div><strong>{localize(entry.foodNameSnapshot, locale)}</strong><small>{entry.grams}g · P {entry.nutrientsSnapshot.protein}g · C {entry.nutrientsSnapshot.carbs}g · F {entry.nutrientsSnapshot.fat}g</small></div><span>{entry.nutrientsSnapshot.calories} kcal</span><span className="meal-entry-actions"><button type="button" onClick={() => editMealEntry(entry)} aria-label={locale === "vi" ? `Sửa ${localize(entry.foodNameSnapshot, locale)}` : `Edit ${localize(entry.foodNameSnapshot, locale)}`}><Pencil size={15} /></button><button type="button" onClick={() => void removeMealEntry(entry.id)} aria-label={locale === "vi" ? `Xóa ${localize(entry.foodNameSnapshot, locale)}` : `Delete ${localize(entry.foodNameSnapshot, locale)}`}><Trash2 size={15} /></button></span></li>)}</ul> : <button className="meal-card__empty" type="button" onClick={() => openAdd(meal)}><Plus size={16} />{locale === "vi" ? "Thêm món" : "Add food"}</button>}
                </Card>
              );
            })}
          </div>
        </section>

        <aside className="nutrition-aside">
          <Card className="water-card water-card--interactive"><span className="water-card__icon"><Droplets size={26} /></span><div><span>{locale === "vi" ? "Nước hôm nay" : "Water today"}</span><strong>{formatNumber(dayWaterMl / 1000, locale)} L {target ? <small>/ {formatNumber(target.waterMl / 1000, locale)} L</small> : null}</strong><p>{locale === "vi" ? "Mục tiêu chỉ là ước tính khởi đầu." : "The target is only a starting estimate."}</p></div><div className="water-controls"><input aria-label={locale === "vi" ? "Lượng nước ml" : "Water amount in ml"} inputMode="numeric" value={waterAmount} onChange={(event) => setWaterAmount(event.target.value.replace(/\D/g, ""))} /><Button size="sm" onClick={() => void logWater()}><Plus size={15} />ml</Button></div>{dayWaterEntries.length ? <ul aria-label={locale === "vi" ? "Nước đã ghi" : "Logged water"}>{dayWaterEntries.map((entry) => <li key={entry.id}><span>{entry.amountMl} ml</span><button type="button" onClick={() => void removeWater(entry.id)} aria-label={locale === "vi" ? `Xóa ${entry.amountMl} ml nước` : `Delete ${entry.amountMl} ml water`}><Trash2 size={14} /></button></li>)}</ul> : null}</Card>
          <Card className="barcode-card"><div className="barcode-art"><Barcode size={56} /></div><span className="eyebrow">Open Food Facts</span><h3>{locale === "vi" ? "Quét mã, nhập nhanh" : "Scan it, log it"}</h3><p>{locale === "vi" ? "Tra cứu miễn phí. Thông tin cộng đồng có thể chưa đầy đủ — hãy kiểm tra nhãn sản phẩm." : "Free lookup. Community data can be incomplete—check the product label."}</p><Button full variant="secondary" onClick={() => { setAddOpen(true); setScannerOpen(true); }}><ScanLine size={18} />{locale === "vi" ? "Quét mã vạch" : "Scan barcode"}</Button></Card>
        </aside>
      </div>

      <Modal open={addOpen} title={`${editingMealId ? (locale === "vi" ? "Sửa món trong" : "Edit food in") : (locale === "vi" ? "Thêm vào" : "Add to")} ${mealLabels[mealType][locale].toLocaleLowerCase(locale)}`} onClose={() => { setAddOpen(false); setEditingMealId(undefined); }} className="modal--wide">
        <div className="food-picker">
          <div className="food-picker__tabs">
            <div className="search-box"><Search size={18} /><input value={foodQuery} onChange={(event) => { setFoodQuery(event.target.value); setOfflineResults([]); }} onKeyDown={(event) => { if (event.key === "Enter") void searchFoods(); }} placeholder={packRecord.status === "ready" ? (locale === "vi" ? "Nhập tên rồi bấm Tìm offline…" : "Enter a name, then search offline…") : (locale === "vi" ? "Tìm thực phẩm đã lưu…" : "Search saved foods…")} /></div>
            {packRecord.status === "ready" ? <Button variant="secondary" disabled={offlineSearchBusy || !foodQuery.trim()} onClick={() => void searchFoods()}><HardDrive size={17} />{offlineSearchBusy ? "…" : (locale === "vi" ? "Tìm offline" : "Search offline")}</Button> : null}
            <Button variant="secondary" onClick={() => setScannerOpen(true)}><ScanLine size={17} />{locale === "vi" ? "Quét mã" : "Scan"}</Button>
            <Button variant="ghost" onClick={() => { setFormErrors([]); setCustomOpen(true); }}><Plus size={17} />{locale === "vi" ? "Tự tạo" : "Custom"}</Button>
          </div>

          <div className="barcode-manual"><Field label={locale === "vi" ? "Hoặc nhập mã vạch" : "Or enter a barcode"}><div className="input-action"><input inputMode="numeric" value={barcode} onChange={(event) => setBarcode(event.target.value.replace(/\D/g, ""))} placeholder="893…" /><Button size="sm" disabled={lookupBusy || barcode.length < 8} onClick={() => void lookup()}>{lookupBusy ? "…" : (locale === "vi" ? "Tra cứu" : "Look up")}</Button></div></Field>{lookupError ? <Notice tone="warning">{lookupError}</Notice> : null}</div>

          {lookupCandidate ? <div className="custom-food-form"><strong>{localize(lookupCandidate.name, locale)}</strong><Notice tone="warning">{locale === "vi" ? "Chỉ lưu được sau khi tất cả calories và macro trên 100g đã có giá trị." : "This food can only be saved after all per-100g calories and macros have values."}</Notice><div className="form-grid form-grid--4">{(["calories", "protein", "carbs", "fat"] as const).map((field) => <Field key={field} label={field === "calories" ? "kcal" : `${field} (g)`}><input inputMode="decimal" value={lookupValues[field]} onChange={(event) => setLookupValues((current) => ({ ...current, [field]: event.target.value }))} aria-invalid={formErrors.some((error) => error.field === field)} /></Field>)}</div><Button size="sm" onClick={() => void completeLookup()}>{locale === "vi" ? "Xác nhận dữ liệu" : "Confirm nutrition"}</Button></div> : null}

          {formErrors.length ? <Notice tone="warning"><ul>{formErrors.map((error, index) => <li key={`${error.field}-${error.code}-${index}`}>{error.message}</li>)}</ul></Notice> : null}

          <div className="food-results">
            {visibleFoods.length ? visibleFoods.map((food) => { const favorite = foodPreferences.find((preference) => preference.foodId === food.id)?.favorite; return <div className={selectedFood?.id === food.id ? "food-result food-result--selected" : "food-result"} key={food.id}><button type="button" className="food-result__select" onClick={() => { setSelectedFood(food); setGrams(String(foodPreferences.find((preference) => preference.foodId === food.id)?.defaultServingGrams ?? food.servingGrams ?? 100)); }}><span className="food-result__icon"><Salad size={19} /></span><span><strong>{localize(food.name, locale)}</strong><small>{food.brand ? `${food.brand} · ` : ""}{formatNumber(food.per100g.calories, locale, 1)} kcal / 100g · {food.source === "vietnamese_recipe" ? (locale === "vi" ? "món ước tính" : "recipe estimate") : food.source === "usda_fdc" ? "USDA" : (locale === "vi" ? "đã lưu" : "saved")}</small></span>{selectedFood?.id === food.id ? <Check size={18} /> : <ChevronRight size={18} />}</button>{foods.some((saved) => saved.id === food.id) ? <button type="button" className="favorite-button" aria-pressed={Boolean(favorite)} aria-label={favorite ? (locale === "vi" ? `Bỏ yêu thích ${localize(food.name, locale)}` : `Unfavorite ${localize(food.name, locale)}`) : (locale === "vi" ? `Yêu thích ${localize(food.name, locale)}` : `Favorite ${localize(food.name, locale)}`)} onClick={() => void toggleFavorite(food)}><Heart size={16} fill={favorite ? "currentColor" : "none"} /></button> : null}</div>; }) : <EmptyState title={locale === "vi" ? "Chưa có kết quả" : "No results yet"} body={packRecord.status === "ready" ? (locale === "vi" ? "Nhập tên và bấm Tìm offline, hoặc quét mã vạch." : "Enter a name and press Search offline, or scan a barcode.") : (locale === "vi" ? "Cài kho offline, quét mã vạch hoặc tạo thực phẩm thủ công." : "Install the offline library, scan a barcode, or create a custom food.")} />}
          </div>

          {selectedFood ? <><div className="food-selection"><div><span>{locale === "vi" ? "Đã chọn" : "Selected"}</span><strong>{localize(selectedFood.name, locale)}</strong></div><Field label={locale === "vi" ? "Khối lượng (g)" : "Amount (g)"}><input inputMode="decimal" value={grams} onChange={(event) => { setGrams(event.target.value); setFormErrors([]); }} aria-invalid={formErrors.some((error) => error.field === "grams")} /></Field><div className="food-selection__calories"><strong>{gramsPreview.ok ? Math.round(selectedFood.per100g.calories * gramsPreview.value / 100) : "—"}</strong><span>kcal</span></div></div><NutrientDetails food={selectedFood} locale={locale} /></> : null}
          <div className="modal-actions"><Button variant="ghost" onClick={() => { setAddOpen(false); setEditingMealId(undefined); }}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={!selectedFood || !gramsPreview.ok} onClick={() => void submitMeal()}>{editingMealId ? (locale === "vi" ? "Lưu thay đổi" : "Save changes") : (locale === "vi" ? "Thêm vào nhật ký" : "Add to diary")}</Button></div>
        </div>
      </Modal>

      <Modal open={customOpen} title={locale === "vi" ? "Tạo thực phẩm" : "Create food"} onClose={() => setCustomOpen(false)}>
        <div className="custom-food-form">
          <Notice>{locale === "vi" ? "Nhập các giá trị trên 100g theo nhãn dinh dưỡng." : "Enter per-100g values from the nutrition label."}</Notice>
          <Field label={locale === "vi" ? "Tên thực phẩm" : "Food name"}><input value={custom.name} onChange={(event) => setCustom((value) => ({ ...value, name: event.target.value }))} autoFocus /></Field>
          <div className="form-grid form-grid--4"><Field label="kcal"><input inputMode="decimal" value={custom.calories} onChange={(event) => setCustom((value) => ({ ...value, calories: event.target.value }))} /></Field><Field label="Protein (g)"><input inputMode="decimal" value={custom.protein} onChange={(event) => setCustom((value) => ({ ...value, protein: event.target.value }))} /></Field><Field label="Carb (g)"><input inputMode="decimal" value={custom.carbs} onChange={(event) => setCustom((value) => ({ ...value, carbs: event.target.value }))} /></Field><Field label="Fat (g)"><input inputMode="decimal" value={custom.fat} onChange={(event) => setCustom((value) => ({ ...value, fat: event.target.value }))} /></Field></div>
          {formErrors.length ? <Notice tone="warning"><ul>{formErrors.map((error, index) => <li key={`${error.field}-${error.code}-${index}`}>{error.message}</li>)}</ul></Notice> : null}
          <div className="modal-actions"><Button variant="ghost" onClick={() => setCustomOpen(false)}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={!custom.name.trim()} onClick={() => void submitCustom()}>{locale === "vi" ? "Lưu & chọn" : "Save & select"}</Button></div>
        </div>
      </Modal>

      <Modal open={recipeOpen} title={editingRecipeId ? (locale === "vi" ? "Sửa công thức" : "Edit recipe") : (locale === "vi" ? "Tạo công thức" : "Create recipe")} onClose={() => setRecipeOpen(false)} className="modal--wide">
        <div className="recipe-editor">
          <div className="form-grid form-grid--3"><Field label={locale === "vi" ? "Tên món" : "Recipe name"}><input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} autoFocus /></Field><Field label={locale === "vi" ? "Khối lượng thành phẩm (g)" : "Finished yield (g)"}><input inputMode="decimal" value={recipeYield} onChange={(event) => setRecipeYield(event.target.value)} /></Field><Field label={locale === "vi" ? "Số khẩu phần" : "Servings"}><input inputMode="decimal" value={recipeServings} onChange={(event) => setRecipeServings(event.target.value)} /></Field></div>
          <div className="recipe-ingredients"><strong>{locale === "vi" ? "Nguyên liệu" : "Ingredients"}</strong>{recipeIngredients.map((ingredient, index) => <div className="recipe-ingredient" key={`${ingredient.foodId}-${index}`}><select aria-label={`${locale === "vi" ? "Nguyên liệu" : "Ingredient"} ${index + 1}`} value={ingredient.foodId} onChange={(event) => setRecipeIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, foodId: event.target.value } : item))}>{foods.map((food) => <option key={food.id} value={food.id}>{localize(food.name, locale)}</option>)}</select><input aria-label={`${locale === "vi" ? "Khối lượng nguyên liệu" : "Ingredient amount"} ${index + 1}`} inputMode="decimal" value={ingredient.grams} onChange={(event) => setRecipeIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, grams: event.target.value } : item))} /><span>g</span><button type="button" disabled={recipeIngredients.length === 1} onClick={() => setRecipeIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={locale === "vi" ? `Xóa nguyên liệu ${index + 1}` : `Remove ingredient ${index + 1}`}><Trash2 size={15} /></button></div>)}</div>
          <Button size="sm" variant="secondary" onClick={() => setRecipeIngredients((current) => [...current, { foodId: foods[0]?.id ?? "", grams: "100" }])}><Plus size={15} />{locale === "vi" ? "Thêm nguyên liệu" : "Add ingredient"}</Button>
          {nutritionError ? <Notice tone="warning">{nutritionError}</Notice> : null}
          <div className="modal-actions"><Button variant="ghost" onClick={() => setRecipeOpen(false)}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={!recipeName.trim() || !recipeIngredients.length} onClick={() => void submitRecipe()}>{locale === "vi" ? "Lưu công thức" : "Save recipe"}</Button></div>
        </div>
      </Modal>

      {scannerOpen ? <BarcodeScanner locale={locale} onClose={() => setScannerOpen(false)} onResult={(value) => { setBarcode(value); setScannerOpen(false); void lookup(value); }} /> : null}
    </div>
  );
}

function NutrientDetails({ food, locale }: { food: FoodItem; locale: "vi" | "en" }) {
  const nutrients = [
    [locale === "vi" ? "Chất xơ" : "Fiber", food.per100g.fiber, "g"],
    [locale === "vi" ? "Đường" : "Sugar", food.per100g.sugar, "g"],
    ["Natri", food.per100g.sodiumMg, "mg"],
    ["Canxi", food.per100g.calciumMg, "mg"],
    ["Sắt", food.per100g.ironMg, "mg"],
    ["Kali", food.per100g.potassiumMg, "mg"],
    ["Magiê", food.per100g.magnesiumMg, "mg"],
    ["Kẽm", food.per100g.zincMg, "mg"],
    ["Vitamin A", food.per100g.vitaminAMcg, "µg"],
    ["Vitamin C", food.per100g.vitaminCMg, "mg"],
    ["Vitamin D", food.per100g.vitaminDMcg, "µg"],
    ["Vitamin E", food.per100g.vitaminEMg, "mg"],
    ["Vitamin K", food.per100g.vitaminKMcg, "µg"],
    ["Vitamin B6", food.per100g.vitaminB6Mg, "mg"],
    ["Vitamin B12", food.per100g.vitaminB12Mcg, "µg"],
    [locale === "vi" ? "Folate" : "Folate", food.per100g.folateMcg, "µg"]
  ].filter((entry) => entry[1] !== null && entry[1] !== undefined) as Array<[string, number, string]>;
  return <div className="nutrient-details"><header><strong>{locale === "vi" ? "Vi chất trên 100g" : "Micronutrients per 100g"}</strong><small>{food.dataQuality === "estimated_recipe" ? (locale === "vi" ? "Ước tính từ nguyên liệu USDA" : "Estimated from USDA ingredients") : food.source === "usda_fdc" ? "USDA FoodData Central · CC0" : (locale === "vi" ? "Có thể thiếu dữ liệu" : "Some values may be missing")}</small></header>{nutrients.length ? <div>{nutrients.map(([label, value, unit]) => <span key={label}><small>{label}</small><strong>{formatNumber(value, locale, value < 10 ? 2 : 1)} {unit}</strong></span>)}</div> : <p>{locale === "vi" ? "Nguồn này chưa cung cấp vi chất; không tự gán bằng 0." : "This source does not provide micronutrients; missing values are not shown as zero."}</p>}</div>;
}

function BarcodeScanner({ locale, onClose, onResult }: { locale: "vi" | "en"; onClose: () => void; onResult: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | undefined>(undefined);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(false);

  useEffect(() => () => controlsRef.current?.stop(), []);

  const startCamera = async () => {
    setStarting(true);
    setError(undefined);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (!result) return;
        controlsRef.current?.stop();
        onResult(result.getText());
      });
      controlsRef.current = controls;
      setEnabled(true);
    } catch {
      setError(locale === "vi" ? "Camera chưa được cấp quyền hoặc không khả dụng. Bạn vẫn có thể nhập mã thủ công." : "Camera permission was declined or unavailable. You can still enter the barcode manually.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Modal open title={locale === "vi" ? "Quét mã vạch" : "Scan barcode"} onClose={onClose}>
      <div className="scanner">
        {!enabled ? <div className="permission-gate"><span><Camera size={32} /></span><h3>{locale === "vi" ? "Cho phép dùng camera?" : "Allow camera access?"}</h3><p>{locale === "vi" ? "Camera chỉ dùng trực tiếp trong trình duyệt để đọc mã. App không chụp, tải lên hay lưu video." : "The camera is used in-browser only to read the code. No photo or video is captured, uploaded, or saved."}</p><Button disabled={starting} onClick={() => void startCamera()}><Camera size={17} />{starting ? (locale === "vi" ? "Đang mở…" : "Starting…") : (locale === "vi" ? "Tiếp tục & xin quyền" : "Continue & request access")}</Button><Button variant="ghost" onClick={onClose}>{locale === "vi" ? "Không dùng camera" : "Don't use camera"}</Button></div> : null}
        <div className={enabled ? "scanner__viewport scanner__viewport--active" : "scanner__viewport"}><video ref={videoRef} muted playsInline /><span className="scanner__line" /></div>
        {enabled ? <p><ScanLine size={16} />{locale === "vi" ? "Đưa mã vạch vào giữa khung hình." : "Center the barcode in the frame."}</p> : null}
        {error ? <Notice tone="warning">{error}</Notice> : null}
      </div>
    </Modal>
  );
}
