import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Barcode, Camera, Check, ChevronRight, Database, Download, Droplets, Flame, HardDrive, Plus, Salad, ScanLine, Search, ShieldCheck, Trash2, Utensils } from "lucide-react";
import { Button, Card, EmptyState, Field, MetricRing, Modal, Notice, ProgressBar, SectionTitle } from "@gym/ui";
import type { FoodItem, MealEntry, NutritionPackManifest, NutritionPackRecord } from "@gym/contracts";
import { createCustomFood, createMealEntry, dailyNutrition, installNutritionPack, loadNutritionPackManifest, lookupFoodByBarcode, nutritionPackInfo, removeNutritionPack, searchOfflineFoods } from "@gym/nutrition";
import { getNutritionPackRecord, saveNutritionPackRecord } from "@gym/storage";
import { formatNumber, localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";

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
  const addFood = useGymStore((state) => state.addFood);
  const addMeal = useGymStore((state) => state.addMeal);
  const removeMeal = useGymStore((state) => state.removeMeal);
  const locale = profile.locale;
  const [date, setDate] = useState(localDate());
  const [addOpen, setAddOpen] = useState(false);
  const [mealType, setMealType] = useState<MealEntry["meal"]>("breakfast");
  const [foodQuery, setFoodQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<FoodItem>();
  const [grams, setGrams] = useState("100");
  const [barcode, setBarcode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string>();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [packManifest, setPackManifest] = useState<NutritionPackManifest>();
  const [packRecord, setPackRecord] = useState<NutritionPackRecord>({ id: "nutrition-pack", status: "not_installed", bytesDownloaded: 0 });
  const [packError, setPackError] = useState<string>();
  const [offlineResults, setOfflineResults] = useState<FoodItem[]>([]);
  const [offlineSearchBusy, setOfflineSearchBusy] = useState(false);

  const dayMeals = useMemo(() => meals.filter((entry) => entry.date === date), [date, meals]);
  const total = dailyNutrition(meals, date);
  const target = profile.nutritionTarget;
  const filteredFoods = foods.filter((food) => {
    const term = foodQuery.trim().toLocaleLowerCase(locale);
    return !term || localize(food.name, locale).toLocaleLowerCase(locale).includes(term) || food.brand?.toLocaleLowerCase(locale).includes(term);
  });
  const visibleFoods = [...filteredFoods, ...offlineResults.filter((candidate) => !filteredFoods.some((saved) => saved.id === candidate.id))];

  useEffect(() => {
    void Promise.all([getNutritionPackRecord(), nutritionPackInfo(), loadNutritionPackManifest()])
      .then(([stored, info, manifest]) => {
        setPackManifest(manifest);
        if (info.installed) {
          const ready: NutritionPackRecord = {
            ...stored,
            id: "nutrition-pack",
            status: "ready",
            version: info.metadata?.version ?? stored.version,
            bytesDownloaded: stored.bytesDownloaded || manifest.sizeBytes,
            totalBytes: manifest.sizeBytes,
            foodCount: Number(info.metadata?.food_count ?? manifest.foodCount),
            aliasCount: Number(info.metadata?.alias_count ?? manifest.aliasCount),
            vietnameseRecipeCount: Number(info.metadata?.vietnamese_recipe_count ?? manifest.vietnameseRecipeCount)
          };
          setPackRecord(ready);
          void saveNutritionPackRecord(ready);
        } else {
          const interrupted = stored.status === "ready" || stored.status === "downloading" || stored.status === "installing";
          const next = interrupted ? { id: "nutrition-pack" as const, status: "not_installed" as const, bytesDownloaded: 0 } : stored;
          setPackRecord(next);
          if (interrupted) void saveNutritionPackRecord(next);
        }
      })
      .catch((error) => setPackError(error instanceof Error ? error.message : "Nutrition pack unavailable"));
  }, []);

  const openAdd = (meal: MealEntry["meal"]) => {
    setMealType(meal);
    setSelectedFood(undefined);
    setFoodQuery("");
    setOfflineResults([]);
    setAddOpen(true);
  };

  const lookup = async (value = barcode) => {
    setLookupBusy(true);
    setLookupError(undefined);
    try {
      const food = await lookupFoodByBarcode(value);
      if (!food) {
        setLookupError(locale === "vi" ? "Không tìm thấy sản phẩm. Bạn có thể tạo thực phẩm thủ công." : "Product not found. You can create it manually.");
      } else {
        await addFood(food);
        setSelectedFood(food);
        setBarcode(food.barcode ?? value);
      }
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setLookupBusy(false);
    }
  };

  const submitMeal = async () => {
    if (!selectedFood || Number(grams) <= 0) return;
    if (!foods.some((food) => food.id === selectedFood.id)) await addFood(selectedFood);
    await addMeal(createMealEntry(selectedFood, Number(grams), date, mealType));
    setAddOpen(false);
    setSelectedFood(undefined);
  };

  const installPack = async () => {
    if (!packManifest || packRecord.status === "downloading" || packRecord.status === "installing") return;
    setPackError(undefined);
    const initial: NutritionPackRecord = { id: "nutrition-pack", status: "downloading", version: packManifest.version, bytesDownloaded: 0, totalBytes: packManifest.sizeBytes };
    setPackRecord(initial);
    await saveNutritionPackRecord(initial);
    try {
      const result = await installNutritionPack(packManifest, (progress) => {
        setPackRecord((current) => ({ ...current, status: "downloading", bytesDownloaded: progress.bytesDownloaded, totalBytes: progress.totalBytes ?? packManifest.sizeBytes }));
      });
      const ready: NutritionPackRecord = {
        id: "nutrition-pack",
        status: "ready",
        version: packManifest.version,
        bytesDownloaded: result.bytesDownloaded,
        totalBytes: packManifest.sizeBytes,
        installedAt: new Date().toISOString(),
        checksum: result.checksum,
        foodCount: packManifest.foodCount,
        aliasCount: packManifest.aliasCount,
        vietnameseRecipeCount: packManifest.vietnameseRecipeCount
      };
      setPackRecord(ready);
      await saveNutritionPackRecord(ready);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nutrition pack install failed";
      const failed: NutritionPackRecord = { ...initial, status: "error", error: message };
      setPackRecord(failed);
      setPackError(message);
      await saveNutritionPackRecord(failed);
    }
  };

  const removePack = async () => {
    const approved = window.confirm(locale === "vi" ? "Xóa gói thực phẩm offline? Nhật ký và thực phẩm đã lưu vẫn được giữ nguyên." : "Remove the offline food pack? Diary entries and saved foods will remain.");
    if (!approved) return;
    await removeNutritionPack();
    const empty: NutritionPackRecord = { id: "nutrition-pack", status: "not_installed", bytesDownloaded: 0 };
    setPackRecord(empty);
    setOfflineResults([]);
    await saveNutritionPackRecord(empty);
  };

  const searchFoods = async () => {
    if (!foodQuery.trim() || packRecord.status !== "ready") return;
    setOfflineSearchBusy(true);
    setLookupError(undefined);
    try {
      setOfflineResults(await searchOfflineFoods(foodQuery.trim()));
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Offline search failed");
    } finally {
      setOfflineSearchBusy(false);
    }
  };

  const submitCustom = async () => {
    if (!custom.name.trim()) return;
    const food = createCustomFood(custom.name.trim(), {
      calories: Math.max(0, Number(custom.calories) || 0),
      protein: Math.max(0, Number(custom.protein) || 0),
      carbs: Math.max(0, Number(custom.carbs) || 0),
      fat: Math.max(0, Number(custom.fat) || 0)
    });
    await addFood(food);
    setSelectedFood(food);
    setCustomOpen(false);
    setCustom({ name: "", calories: "", protein: "", carbs: "", fat: "" });
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
      ) : <Notice tone="warning">{locale === "vi" ? "Chưa có mục tiêu dinh dưỡng. Bạn có thể thêm số đo trong Cài đặt để app ước tính calories và macro." : "No nutrition target yet. Add body details in Settings for an estimate."}</Notice>}

      <Card className="nutrition-pack-card">
        <div className="nutrition-pack-card__icon"><Database size={27} /></div>
        <div className="nutrition-pack-card__copy"><span className="eyebrow">{locale === "vi" ? "Tùy chọn · chỉ tải khi bạn đồng ý" : "Optional · downloads only on your click"}</span><h2>{locale === "vi" ? "Kho thực phẩm offline" : "Offline food library"}</h2><p>{locale === "vi" ? "USDA Foundation + SR Legacy + FNDDS, tìm tiếng Việt/không dấu, gồm vi chất và 300 món Việt ước tính." : "USDA Foundation + SR Legacy + FNDDS, Vietnamese/accentless search, micronutrients, and 300 estimated Vietnamese dishes."}</p></div>
        <div className="nutrition-pack-card__stats"><span><strong>{formatNumber(packManifest?.foodCount ?? 13_835, locale)}</strong>{locale === "vi" ? "thực phẩm" : "foods"}</span><span><strong>{formatNumber(packManifest?.aliasCount ?? 24_907, locale)}</strong>{locale === "vi" ? "alias VI" : "VI aliases"}</span><span><strong>300</strong>{locale === "vi" ? "món Việt" : "VI dishes"}</span></div>
        <div className="nutrition-pack-card__action">
          {packRecord.status === "ready" ? <><span className="pack-ready"><ShieldCheck size={16} />{locale === "vi" ? `Đã cài v${packRecord.version}` : `Installed v${packRecord.version}`}</span><Button size="sm" variant="ghost" onClick={() => void removePack()}>{locale === "vi" ? "Xóa gói" : "Remove"}</Button></> : <Button disabled={!packManifest || packRecord.status === "downloading" || packRecord.status === "installing"} onClick={() => void installPack()}><Download size={17} />{packRecord.status === "downloading" ? (locale === "vi" ? "Đang tải…" : "Downloading…") : `${locale === "vi" ? "Tải & cài" : "Download & install"} ${packManifest ? formatBytes(packManifest.sizeBytes, locale) : ""}`}</Button>}
          {packRecord.status === "downloading" ? <div className="pack-progress"><ProgressBar value={(packRecord.bytesDownloaded / Math.max(1, packRecord.totalBytes ?? 1)) * 100} /><small>{formatBytes(packRecord.bytesDownloaded, locale)} / {packRecord.totalBytes ? formatBytes(packRecord.totalBytes, locale) : "—"}</small></div> : null}
          {packError ? <small className="pack-error">{packError}</small> : null}
        </div>
      </Card>

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
                  {entries.length ? <ul>{entries.map((entry) => <li key={entry.id}><div><strong>{localize(entry.foodNameSnapshot, locale)}</strong><small>{entry.grams}g · P {entry.nutrientsSnapshot.protein}g · C {entry.nutrientsSnapshot.carbs}g · F {entry.nutrientsSnapshot.fat}g</small></div><span>{entry.nutrientsSnapshot.calories} kcal</span><button type="button" onClick={() => void removeMeal(entry.id)} aria-label="Delete"><Trash2 size={16} /></button></li>)}</ul> : <button className="meal-card__empty" type="button" onClick={() => openAdd(meal)}><Plus size={16} />{locale === "vi" ? "Thêm món" : "Add food"}</button>}
                </Card>
              );
            })}
          </div>
        </section>

        <aside className="nutrition-aside">
          <Card className="water-card"><span className="water-card__icon"><Droplets size={26} /></span><div><span>{locale === "vi" ? "Mục tiêu nước" : "Water target"}</span><strong>{target ? `${formatNumber(target.waterMl / 1000, locale)} L` : "—"}</strong><p>{locale === "vi" ? "Ước tính 35 ml / kg cân nặng" : "Estimated at 35 ml / kg bodyweight"}</p></div></Card>
          <Card className="barcode-card"><div className="barcode-art"><Barcode size={56} /></div><span className="eyebrow">Open Food Facts</span><h3>{locale === "vi" ? "Quét mã, nhập nhanh" : "Scan it, log it"}</h3><p>{locale === "vi" ? "Tra cứu miễn phí. Thông tin cộng đồng có thể chưa đầy đủ — hãy kiểm tra nhãn sản phẩm." : "Free lookup. Community data can be incomplete—check the product label."}</p><Button full variant="secondary" onClick={() => { setAddOpen(true); setScannerOpen(true); }}><ScanLine size={18} />{locale === "vi" ? "Quét mã vạch" : "Scan barcode"}</Button></Card>
        </aside>
      </div>

      <Modal open={addOpen} title={`${locale === "vi" ? "Thêm vào" : "Add to"} ${mealLabels[mealType][locale].toLocaleLowerCase(locale)}`} onClose={() => setAddOpen(false)} className="modal--wide">
        <div className="food-picker">
          <div className="food-picker__tabs">
            <div className="search-box"><Search size={18} /><input value={foodQuery} onChange={(event) => { setFoodQuery(event.target.value); setOfflineResults([]); }} onKeyDown={(event) => { if (event.key === "Enter") void searchFoods(); }} placeholder={packRecord.status === "ready" ? (locale === "vi" ? "Nhập tên rồi bấm Tìm offline…" : "Enter a name, then search offline…") : (locale === "vi" ? "Tìm thực phẩm đã lưu…" : "Search saved foods…")} /></div>
            {packRecord.status === "ready" ? <Button variant="secondary" disabled={offlineSearchBusy || !foodQuery.trim()} onClick={() => void searchFoods()}><HardDrive size={17} />{offlineSearchBusy ? "…" : (locale === "vi" ? "Tìm offline" : "Search offline")}</Button> : null}
            <Button variant="secondary" onClick={() => setScannerOpen(true)}><ScanLine size={17} />{locale === "vi" ? "Quét mã" : "Scan"}</Button>
            <Button variant="ghost" onClick={() => setCustomOpen(true)}><Plus size={17} />{locale === "vi" ? "Tự tạo" : "Custom"}</Button>
          </div>

          <div className="barcode-manual"><Field label={locale === "vi" ? "Hoặc nhập mã vạch" : "Or enter a barcode"}><div className="input-action"><input inputMode="numeric" value={barcode} onChange={(event) => setBarcode(event.target.value.replace(/\D/g, ""))} placeholder="893…" /><Button size="sm" disabled={lookupBusy || barcode.length < 8} onClick={() => void lookup()}>{lookupBusy ? "…" : (locale === "vi" ? "Tra cứu" : "Look up")}</Button></div></Field>{lookupError ? <Notice tone="warning">{lookupError}</Notice> : null}</div>

          <div className="food-results">
            {visibleFoods.length ? visibleFoods.map((food) => <button type="button" key={food.id} className={selectedFood?.id === food.id ? "food-result food-result--selected" : "food-result"} onClick={() => setSelectedFood(food)}><span className="food-result__icon"><Salad size={19} /></span><span><strong>{localize(food.name, locale)}</strong><small>{food.brand ? `${food.brand} · ` : ""}{formatNumber(food.per100g.calories, locale, 1)} kcal / 100g · {food.source === "vietnamese_recipe" ? (locale === "vi" ? "món ước tính" : "recipe estimate") : food.source === "usda_fdc" ? "USDA" : (locale === "vi" ? "đã lưu" : "saved")}</small></span>{selectedFood?.id === food.id ? <Check size={18} /> : <ChevronRight size={18} />}</button>) : <EmptyState title={locale === "vi" ? "Chưa có kết quả" : "No results yet"} body={packRecord.status === "ready" ? (locale === "vi" ? "Nhập tên và bấm Tìm offline, hoặc quét mã vạch." : "Enter a name and press Search offline, or scan a barcode.") : (locale === "vi" ? "Cài kho offline, quét mã vạch hoặc tạo thực phẩm thủ công." : "Install the offline library, scan a barcode, or create a custom food.")} />}
          </div>

          {selectedFood ? <><div className="food-selection"><div><span>{locale === "vi" ? "Đã chọn" : "Selected"}</span><strong>{localize(selectedFood.name, locale)}</strong></div><Field label={locale === "vi" ? "Khối lượng (g)" : "Amount (g)"}><input inputMode="decimal" value={grams} onChange={(event) => setGrams(event.target.value)} /></Field><div className="food-selection__calories"><strong>{Math.round(selectedFood.per100g.calories * (Number(grams) || 0) / 100)}</strong><span>kcal</span></div></div><NutrientDetails food={selectedFood} locale={locale} /></> : null}
          <div className="modal-actions"><Button variant="ghost" onClick={() => setAddOpen(false)}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={!selectedFood || Number(grams) <= 0} onClick={() => void submitMeal()}>{locale === "vi" ? "Thêm vào nhật ký" : "Add to diary"}</Button></div>
        </div>
      </Modal>

      <Modal open={customOpen} title={locale === "vi" ? "Tạo thực phẩm" : "Create food"} onClose={() => setCustomOpen(false)}>
        <div className="custom-food-form">
          <Notice>{locale === "vi" ? "Nhập các giá trị trên 100g theo nhãn dinh dưỡng." : "Enter per-100g values from the nutrition label."}</Notice>
          <Field label={locale === "vi" ? "Tên thực phẩm" : "Food name"}><input value={custom.name} onChange={(event) => setCustom((value) => ({ ...value, name: event.target.value }))} autoFocus /></Field>
          <div className="form-grid form-grid--4"><Field label="kcal"><input inputMode="decimal" value={custom.calories} onChange={(event) => setCustom((value) => ({ ...value, calories: event.target.value }))} /></Field><Field label="Protein (g)"><input inputMode="decimal" value={custom.protein} onChange={(event) => setCustom((value) => ({ ...value, protein: event.target.value }))} /></Field><Field label="Carb (g)"><input inputMode="decimal" value={custom.carbs} onChange={(event) => setCustom((value) => ({ ...value, carbs: event.target.value }))} /></Field><Field label="Fat (g)"><input inputMode="decimal" value={custom.fat} onChange={(event) => setCustom((value) => ({ ...value, fat: event.target.value }))} /></Field></div>
          <div className="modal-actions"><Button variant="ghost" onClick={() => setCustomOpen(false)}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={!custom.name.trim()} onClick={() => void submitCustom()}>{locale === "vi" ? "Lưu & chọn" : "Save & select"}</Button></div>
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
