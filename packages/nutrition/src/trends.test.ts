import { describe, expect, it } from "vitest";
import type { MealEntry } from "@gym/contracts";
import { nutritionWeekStart, weeklyNutritionTrends } from "./trends";

function entry(date: string, calories: number, protein = 0, carbs = 0, fat = 0): MealEntry {
  return {
    id: `${date}-${calories}-${protein}`,
    date,
    meal: "lunch",
    foodId: "food",
    foodNameSnapshot: { vi: "Cơm", en: "Rice" },
    grams: 100,
    nutrientsSnapshot: { calories, protein, carbs, fat },
    createdAt: `${date}T05:00:00.000Z`
  };
}

describe("weekly nutrition trends", () => {
  it("starts weeks on Monday, including across a year boundary", () => {
    expect(nutritionWeekStart("2026-11-18")).toBe("2026-11-16");
    expect(nutritionWeekStart("2026-11-16")).toBe("2026-11-16");
    expect(nutritionWeekStart("2026-11-22")).toBe("2026-11-16");
    expect(nutritionWeekStart("2027-01-01")).toBe("2026-12-28");
    expect(nutritionWeekStart("not-a-date")).toBeUndefined();
  });

  it("averages only the days that have diary entries", () => {
    const weeks = weeklyNutritionTrends([
      entry("2026-11-16", 1200, 60, 150, 40),
      entry("2026-11-16", 800, 40.5, 50, 20),
      entry("2026-11-18", 1500, 80, 160, 50),
      entry("2026-11-22", 2500, 120, 300, 70.4)
    ], "2026-11-19", 2);

    expect(weeks.map((week) => [week.weekStart, week.weekEnd])).toEqual([
      ["2026-11-09", "2026-11-15"],
      ["2026-11-16", "2026-11-22"]
    ]);
    expect(weeks[0]).toMatchObject({ loggedDays: 0, average: undefined });
    expect(weeks[1]!.loggedDays).toBe(3);
    expect(weeks[1]!.average).toEqual({ calories: 2000, protein: 100.2, carbs: 220, fat: 60.1 });
    expect(weeks[1]!.days.map((day) => day.calories)).toEqual([2000, 0, 1500, 0, 0, 0, 2500]);
    expect(weeks[1]!.days.filter((day) => day.logged).map((day) => day.date)).toEqual(["2026-11-16", "2026-11-18", "2026-11-22"]);
  });

  it("ignores entries outside the window and keeps weeks oldest first", () => {
    const weeks = weeklyNutritionTrends([
      entry("2026-10-11", 9999),
      entry("2026-10-12", 1800),
      entry("2026-11-23", 9999)
    ], "2026-11-22");

    expect(weeks).toHaveLength(6);
    expect(weeks[0]!.weekStart).toBe("2026-10-12");
    expect(weeks[0]!.average?.calories).toBe(1800);
    expect(weeks.slice(1).every((week) => week.loggedDays === 0)).toBe(true);
  });

  it("returns nothing for an invalid anchor date", () => {
    expect(weeklyNutritionTrends([entry("2026-11-16", 500)], "")).toEqual([]);
  });
});
