import { describe, expect, it } from "vitest";
import { createCustomFood, createMealEntry, dailyNutrition, estimateNutritionTarget } from "./index";

describe("nutrition", () => {
  it("uses versioned editable Mifflin-St Jeor defaults", () => {
    const target = estimateNutritionTarget({ biologicalSex: "male", age: 30, heightCm: 175, weightKg: 70, activityFactor: 1.55, goal: "hypertrophy" });
    expect(target.formulaVersion).toBe(1);
    expect(target.calories).toBeGreaterThan(2000);
    expect(target.protein).toBe(112);
    expect(target.carbs).toBeGreaterThan(0);
  });

  it("stores nutrient snapshots instead of recomputing diary history", () => {
    const food = createCustomFood("Cơm", { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 });
    const entry = createMealEntry(food, 200, "2026-08-10", "lunch");
    food.per100g.calories = 999;
    expect(dailyNutrition([entry], "2026-08-10").calories).toBe(260);
  });
});
