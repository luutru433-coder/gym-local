import { describe, expect, it } from "vitest";
import type { MealEntry, NutritionTarget } from "@gym/contracts";
import { nutritionTargetNeedsConfirmation, confirmNutritionTarget, suggestCalorieTarget } from "./index";

const target: NutritionTarget = { calories: 2500, protein: 120, carbs: 349, fat: 69, waterMl: 2625, formulaVersion: 1, source: "estimated", confirmedAt: "2026-08-01T00:00:00.000Z" };

function day(offset: number): string {
  return new Date(Date.UTC(2026, 7, 1 + offset)).toISOString().slice(0, 10);
}

function meals(days: number[], calories: number): MealEntry[] {
  return days.map((offset) => ({
    id: `meal_${offset}`, date: day(offset), meal: "lunch", foodId: "food", foodNameSnapshot: { vi: "Cơm", en: "Rice" }, grams: 100,
    nutrientsSnapshot: { calories, protein: 0, carbs: 0, fat: 0 }, createdAt: `${day(offset)}T05:00:00.000Z`
  } as MealEntry));
}

const everyDay = Array.from({ length: 21 }, (_, index) => index);
const flat = [0, 7, 14, 20].map((offset) => ({ date: day(offset), trend: 75 }));

describe("suggestCalorieTarget", () => {
  it("keeps the target when intake at target holds weight for a maintenance goal", () => {
    const result = suggestCalorieTarget({ trend: flat, meals: meals(everyDay, 2500), target, goal: "general", today: day(21) });
    expect(result).toMatchObject({ status: "on_track", averageIntake: 2500, estimatedExpenditure: 2500, suggestedCalories: 2500, weighIns: 4, spanDays: 20, loggedDays: 21 });
  });

  it("estimates expenditure from intake and trend change and applies the goal factor", () => {
    // Losing 1 kg in 20 days on 2200 kcal: 2200 + 7700 / 20 = 2585 kcal spent.
    const trend = [0, 10, 20].map((offset) => ({ date: day(offset), trend: 75 - offset / 20 }));
    const result = suggestCalorieTarget({ trend, meals: meals(everyDay, 2200), target, goal: "fat_loss", today: day(21) });
    expect(result).toMatchObject({ status: "adjust", estimatedExpenditure: 2585, trendChangeKg: -1, weeklyChangeKg: -0.35, suggestedCalories: 2330, limited: false });
    if (result.status !== "adjust") throw new Error("expected a suggestion");
    expect(result.suggestedTarget).toEqual({ calories: 2330, protein: 120, carbs: 316, fat: 65, waterMl: 2625, formulaVersion: 1, source: "manual" });
    expect(nutritionTargetNeedsConfirmation(confirmNutritionTarget(result.suggestedTarget))).toBe(false);
  });

  it("keeps protein and fat within the suggested calories for a high-protein target", () => {
    const result = suggestCalorieTarget({ trend: flat, meals: meals(everyDay, 1100), target: { ...target, calories: 1500, protein: 250 }, goal: "fat_loss", today: day(21) });
    expect(result).toMatchObject({ suggestedCalories: 1200, suggestedTarget: { protein: 250, fat: 22, carbs: 1 } });
    const extreme = suggestCalorieTarget({ trend: flat, meals: meals(everyDay, 1100), target: { ...target, calories: 1500, protein: 320 }, goal: "fat_loss", today: day(21) });
    expect(extreme).toMatchObject({ suggestedTarget: { protein: 300, fat: 0, carbs: 0 } });
  });

  it("limits one suggestion to 300 kcal", () => {
    const result = suggestCalorieTarget({ trend: flat, meals: meals(everyDay, 1800), target, goal: "general", today: day(21) });
    expect(result).toMatchObject({ status: "adjust", suggestedCalories: 2200, limited: true });
  });

  it("never suggests going below 1200 kcal and never raises a lower target to it", () => {
    const low = suggestCalorieTarget({ trend: flat, meals: meals(everyDay, 1050), target: { ...target, calories: 1300 }, goal: "fat_loss", today: day(21) });
    expect(low).toMatchObject({ status: "adjust", suggestedCalories: 1200 });
    const lower = suggestCalorieTarget({ trend: flat, meals: meals(everyDay, 1050), target: { ...target, calories: 1100 }, goal: "fat_loss", today: day(21) });
    expect(lower).toMatchObject({ status: "on_track", suggestedCalories: 1100 });
  });

  it("ignores today's open diary and days outside the weigh-in span", () => {
    const result = suggestCalorieTarget({ trend: flat, meals: [...meals(everyDay, 2500), ...meals([21, 22], 9000)], target, goal: "general", today: day(21) });
    expect(result).toMatchObject({ status: "on_track", averageIntake: 2500 });
  });

  it("asks for more data instead of guessing", () => {
    const base = { trend: flat, meals: meals(everyDay, 2500), target, goal: "general" as const, today: day(21) };
    expect(suggestCalorieTarget({ ...base, target: undefined })).toMatchObject({ status: "insufficient", reason: "no_target" });
    expect(suggestCalorieTarget({ ...base, trend: flat.slice(0, 2) })).toMatchObject({ status: "insufficient", reason: "weigh_ins", weighIns: 2 });
    expect(suggestCalorieTarget({ ...base, trend: [0, 5, 10].map((offset) => ({ date: day(offset), trend: 75 })) })).toMatchObject({ status: "insufficient", reason: "weigh_ins", spanDays: 10 });
    expect(suggestCalorieTarget({ ...base, meals: meals([1, 2, 3, 4, 5, 6, 7, 8, 9], 2500), trend: flat })).toMatchObject({ status: "insufficient", reason: "intake", loggedDays: 9 });
    expect(suggestCalorieTarget({ ...base, meals: meals(everyDay, 400), trend: flat })).toMatchObject({ status: "insufficient", reason: "implausible" });
    // Weigh-ins older than three weeks do not count.
    expect(suggestCalorieTarget({ ...base, trend: flat, today: day(40) })).toMatchObject({ status: "insufficient", reason: "weigh_ins" });
  });
});
