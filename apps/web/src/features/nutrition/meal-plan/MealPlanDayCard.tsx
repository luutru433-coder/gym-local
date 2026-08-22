import type { MealEntry, MealPlanDay } from "@gym/contracts";
import { Card } from "@gym/ui";
import { formatNumber } from "../../../lib/i18n";
import { MealSwapControl } from "./MealSwapControl";

interface MealPlanDayCardProps {
  day: MealPlanDay;
  busy?: boolean;
  onSwap: (dayIndex: number, plannedMealId: string) => void;
}

const mealLabels: Record<MealEntry["meal"], string> = {
  breakfast: "Bữa sáng",
  lunch: "Bữa trưa",
  dinner: "Bữa tối",
  snack: "Bữa phụ"
};

function dayTitle(day: MealPlanDay): string {
  if (!day.date) return `Ngày ${day.dayIndex + 1}`;
  const parsed = new Date(`${day.date}T00:00:00`);
  return `${new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }).format(parsed)}`;
}

export function MealPlanDayCard({ day, busy, onSwap }: MealPlanDayCardProps) {
  return (
    <Card className="meal-plan-day-card">
      <header>
        <div>
          <span className="eyebrow">Ngày {day.dayIndex + 1}</span>
          <h3>{dayTitle(day)}</h3>
        </div>
        <div className="meal-plan-day-card__totals" aria-label="Tổng dinh dưỡng trong ngày">
          <strong>{formatNumber(day.totalsSnapshot.calories, "vi", 0)} kcal</strong>
          <span>Đạm {formatNumber(day.totalsSnapshot.protein, "vi", 1)} g</span>
          <span>Bột đường {formatNumber(day.totalsSnapshot.carbs, "vi", 1)} g</span>
          <span>Béo {formatNumber(day.totalsSnapshot.fat, "vi", 1)} g</span>
        </div>
      </header>

      <div className="meal-plan-day-card__meals">
        {day.meals.map((meal) => {
          const missing = meal.ingredientSnapshots.filter((ingredient) => ingredient.missingGrams > 0);
          return (
            <article className="planned-meal" key={meal.id}>
              <div className="planned-meal__heading">
                <div>
                  <small>{mealLabels[meal.meal]}</small>
                  <h4>{meal.recipeNameSnapshot.vi}</h4>
                </div>
                <MealSwapControl disabled={busy} onSwap={() => onSwap(day.dayIndex, meal.id)} />
              </div>
              <p>
                {formatNumber(meal.nutrientsSnapshot.calories, "vi", 0)} kcal · Chất đạm {formatNumber(meal.nutrientsSnapshot.protein, "vi", 1)} g · Chất bột đường {formatNumber(meal.nutrientsSnapshot.carbs, "vi", 1)} g · Chất béo {formatNumber(meal.nutrientsSnapshot.fat, "vi", 1)} g
              </p>
              <details>
                <summary>{meal.ingredientSnapshots.length} nguyên liệu{missing.length ? ` · thiếu ${missing.length}` : " · đã có đủ"}</summary>
                <ul>
                  {meal.ingredientSnapshots.map((ingredient) => (
                    <li key={`${meal.id}-${ingredient.foodId}`}>
                      <span>{ingredient.nameSnapshot.vi}</span>
                      <span>
                        {formatNumber(ingredient.grams, "vi", 0)} g
                        {ingredient.missingGrams > 0 ? ` · cần mua ${formatNumber(ingredient.missingGrams, "vi", 0)} g` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
