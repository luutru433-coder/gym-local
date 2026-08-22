import { useMemo, useState } from "react";
import type { AsianCuisine, MealPlanRequest } from "@gym/contracts";
import { CalendarDays, RefreshCw, Save, Sparkles } from "lucide-react";
import { Button, Card, EmptyState, Field, Notice, SectionTitle } from "@gym/ui";
import { nutritionTargetNeedsConfirmation } from "@gym/nutrition";
import { formatNumber } from "../../../lib/i18n";
import { useGymStore } from "../../../store/useGymStore";
import { MealPlanDayCard } from "./MealPlanDayCard";
import { MealPlanFilters, type MealPlanFilterValue } from "./MealPlanFilters";
import { MealPlanShoppingList } from "./MealPlanShoppingList";
import { SavedMealPlans } from "./SavedMealPlans";
import "./MealPlanSection.css";

const allCuisines: AsianCuisine[] = [
  "vietnamese", "chinese", "japanese", "korean", "thai", "taiwanese", "indian", "southeast_asian"
];

const warningLabels = {
  insufficient_candidates: "Kho món không đủ ứng viên cho toàn bộ bộ lọc đã chọn.",
  partial_plan: "Một số bữa chưa có món phù hợp.",
  target_out_of_range: "Có ngày chưa đạt dải năng lượng hoặc chất đa lượng ưu tiên.",
  missing_pantry: "Cần mua thêm nguyên liệu; pantry chỉ được dùng để tính toán và chưa bị trừ.",
  unknown_nutrients: "Một số vitamin hoặc khoáng chất chưa có dữ liệu; ứng dụng giữ trạng thái chưa biết thay vì ghi thành 0.",
  stale_target: "Mục tiêu dinh dưỡng cần được xác nhận lại trước khi dùng để lập thực đơn."
} as const;

function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function MealPlanSection() {
  const profile = useGymStore((state) => state.profile)!;
  const packRecord = useGymStore((state) => state.nutritionPackRecord);
  const packManifest = useGymStore((state) => state.nutritionPackManifest);
  const generated = useGymStore((state) => state.generatedMealPlan);
  const savedPlans = useGymStore((state) => state.mealPlans);
  const status = useGymStore((state) => state.mealPlanStatus);
  const storeError = useGymStore((state) => state.mealPlanError);
  const generateUserMealPlan = useGymStore((state) => state.generateUserMealPlan);
  const clearGeneratedMealPlan = useGymStore((state) => state.clearGeneratedMealPlan);
  const saveGeneratedMealPlan = useGymStore((state) => state.saveGeneratedMealPlan);
  const removeSavedMealPlan = useGymStore((state) => state.removeSavedMealPlan);
  const logSavedMealPlanDays = useGymStore((state) => state.logSavedMealPlanDays);
  const [filters, setFilters] = useState<MealPlanFilterValue>({
    startDate: localDate(),
    includeSnack: false,
    cuisines: allCuisines,
    diet: "all",
    excludedAllergens: [],
    seed: "gym-local-week"
  });
  const [planName, setPlanName] = useState(`Thực đơn từ ${localDate()}`);
  const [localError, setLocalError] = useState<string>();
  const [swapRevision, setSwapRevision] = useState(0);
  const busy = status === "loading" || status === "saving";
  const targetNeedsConfirmation = nutritionTargetNeedsConfirmation(profile.nutritionTarget);
  const schemaReady = packRecord.status === "ready"
    && (packRecord.schemaVersion ?? packRecord.active?.schemaVersion ?? 0) >= 3
    && (packRecord.activeRecipeCount ?? packRecord.active?.activeRecipeCount ?? packManifest?.activeRecipeCount ?? 0) > 0;

  const request = useMemo<MealPlanRequest | undefined>(() => {
    const target = profile.nutritionTarget;
    if (!target) return undefined;
    return {
      durationDays: 7,
      includeSnack: filters.includeSnack,
      startDate: filters.startDate,
      target: {
        calories: target.calories,
        protein: target.protein,
        carbs: target.carbs,
        fat: target.fat,
        formulaVersion: target.formulaVersion,
        confirmedAt: target.confirmedAt,
        source: target.source
      },
      cuisines: filters.cuisines,
      dietaryTags: filters.diet === "all" ? [] : [filters.diet],
      excludedAllergens: filters.excludedAllergens,
      seed: filters.seed
    };
  }, [filters, profile.nutritionTarget]);

  const generate = async (seedSuffix = "") => {
    setLocalError(undefined);
    if (!request || targetNeedsConfirmation) {
      setLocalError("Hãy xác nhận lại mục tiêu dinh dưỡng trước khi lập thực đơn.");
      return;
    }
    if (!schemaReady) {
      setLocalError("Hãy cài hoặc cập nhật kho dinh dưỡng schema 3 trước khi lập thực đơn 7 ngày.");
      return;
    }
    try {
      await generateUserMealPlan({ ...request, seed: `${request.seed ?? "gym-local-week"}${seedSuffix}` });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Không thể lập thực đơn.");
    }
  };

  const swapMeal = (dayIndex: number, plannedMealId: string) => {
    const nextRevision = swapRevision + 1;
    setSwapRevision(nextRevision);
    void generate(`:swap:${dayIndex}:${plannedMealId}:${nextRevision}`);
  };

  return (
    <section className="meal-plan-section" aria-labelledby="meal-plan-title">
      <SectionTitle eyebrow="Ngoại tuyến · 7 ngày" title="Lập thực đơn Việt–Á" />
      <Card className="meal-plan-controller">
        <div className="meal-plan-controller__intro">
          <span className="meal-plan-controller__icon"><CalendarDays size={25} /></span>
          <div>
            <h3 id="meal-plan-title">Ba bữa chính mỗi ngày, bữa phụ tùy chọn</h3>
            <p>Ưu tiên mục tiêu năng lượng và chất đa lượng, dị ứng, chế độ ăn, nguyên liệu đang có và độ đa dạng. Đây là thông tin tham khảo, không phải chế độ điều trị.</p>
          </div>
        </div>

        {targetNeedsConfirmation ? <Notice tone="warning">Mục tiêu hiện tại chưa được xác nhận hoặc đã cũ. Xác nhận lại mục tiêu ở phần phía trên trước khi tạo kế hoạch.</Notice> : null}
        {!schemaReady ? <Notice tone="warning">Tính năng này cần kho dinh dưỡng schema 3 đã cài trên thiết bị. Kế hoạch đã lưu vẫn an toàn khi cài hoặc cập nhật pack.</Notice> : null}
        <MealPlanFilters value={filters} disabled={busy} onChange={setFilters} />
        <div className="meal-plan-controller__actions">
          <Button disabled={busy || targetNeedsConfirmation || !schemaReady || !filters.cuisines.length} onClick={() => void generate()}>
            {busy ? <RefreshCw className="spin" size={17} /> : <Sparkles size={17} />}
            {status === "loading" ? "Đang lập thực đơn…" : "Tạo thực đơn 7 ngày"}
          </Button>
          {generated ? <Button variant="ghost" disabled={busy} onClick={clearGeneratedMealPlan}>Làm lại từ đầu</Button> : null}
        </div>
        {localError || storeError ? <Notice tone="warning">{localError ?? storeError}</Notice> : null}
      </Card>

      {generated ? (
        <div className="generated-meal-plan">
          <div className="generated-meal-plan__summary">
            <div>
              <span className="eyebrow">Kết quả · thuật toán {generated.algorithmVersion}</span>
              <h3>{generated.days.length} ngày · {generated.days.reduce((sum, day) => sum + day.meals.length, 0)} bữa</h3>
              <p>
                Mục tiêu/ngày: {formatNumber(generated.targetSnapshot.calories, "vi", 0)} kcal · Chất đạm {formatNumber(generated.targetSnapshot.protein, "vi", 0)} g · Chất bột đường {formatNumber(generated.targetSnapshot.carbs, "vi", 0)} g · Chất béo {formatNumber(generated.targetSnapshot.fat, "vi", 0)} g
              </p>
            </div>
            <div className="generated-meal-plan__save">
              <Field label="Tên thực đơn">
                <input value={planName} disabled={busy} onChange={(event) => setPlanName(event.target.value)} />
              </Field>
              <Button disabled={busy || !planName.trim()} onClick={() => void saveGeneratedMealPlan(planName)}>
                <Save size={16} />
                Lưu trên thiết bị
              </Button>
            </div>
          </div>

          {generated.warnings.length ? (
            <Notice tone="warning">
              <ul className="meal-plan-warning-list">
                {generated.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${warning.dayIndex ?? "all"}-${warning.meal ?? "all"}-${index}`}>
                    {warningLabels[warning.code]}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : <Notice tone="success">Kế hoạch đã đạt các điều kiện bắt buộc và dải mục tiêu ưu tiên.</Notice>}

          <div className="meal-plan-day-grid">
            {generated.days.map((day) => (
              <MealPlanDayCard key={day.dayIndex} day={day} busy={busy} onSwap={swapMeal} />
            ))}
          </div>
          <MealPlanShoppingList items={generated.shoppingListSnapshot} />
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays size={24} />}
          title="Chưa tạo thực đơn tuần"
          body="Chọn nền ẩm thực, chế độ ăn và dị ứng. Ứng dụng sẽ tính pantry trên cả tuần nhưng không tự trừ nguyên liệu."
        />
      )}

      <SavedMealPlans
        plans={savedPlans}
        busy={busy}
        onLogDays={logSavedMealPlanDays}
        onDelete={removeSavedMealPlan}
      />
    </section>
  );
}
