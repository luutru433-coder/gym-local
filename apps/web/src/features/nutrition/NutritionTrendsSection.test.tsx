import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { MealEntry, NutritionTarget } from "@gym/contracts";
import { NutritionTrendsSection } from "./NutritionTrendsSection";

function entry(date: string, calories: number, protein: number, carbs: number, fat: number): MealEntry {
  return {
    id: `${date}-${calories}`,
    date,
    meal: "lunch",
    foodId: "food",
    foodNameSnapshot: { vi: "Cơm gà", en: "Chicken rice" },
    grams: 100,
    nutrientsSnapshot: { calories, protein, carbs, fat },
    createdAt: `${date}T05:00:00.000Z`
  };
}

const target: NutritionTarget = { calories: 2000, protein: 120, carbs: 230, fat: 60, waterMl: 2500, formulaVersion: 1 };
const meals = [
  entry("2026-11-10", 2400, 100, 300, 80),
  entry("2026-11-16", 1800, 110, 200, 50),
  entry("2026-11-18", 1600, 90, 180, 40)
];

afterEach(cleanup);

describe("weekly nutrition trends section", () => {
  it("shows the selected week's averages against the target in Vietnamese", async () => {
    const user = userEvent.setup();
    render(<NutritionTrendsSection meals={meals} date="2026-11-19" target={target} locale="vi" />);

    expect(screen.getByRole("heading", { name: "Xu hướng theo tuần" })).toBeTruthy();
    expect(screen.getByText(/Tuần 16\/11–22\/11 · 2\/7 ngày có ghi/)).toBeTruthy();
    expect(screen.getByText("1.700")).toBeTruthy();
    expect(screen.getByText("−300")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Chất đạm" }).getAttribute("aria-valuetext")).toBe("100 / 120 g");

    await user.click(screen.getByRole("button", { name: "Tuần 09/11–15/11: trung bình 2.400 kcal mỗi ngày" }));
    expect(screen.getByText(/Tuần 09\/11–15\/11 · 1\/7 ngày có ghi/)).toBeTruthy();
    expect(screen.getByText("+400")).toBeTruthy();
  });

  it("renders in English and without a target", () => {
    render(<NutritionTrendsSection meals={meals} date="2026-11-19" locale="en" />);

    expect(screen.getByRole("heading", { name: "Weekly trends" })).toBeTruthy();
    expect(screen.getByText(/Week 16\/11–22\/11 · 2\/7 days logged/)).toBeTruthy();
    expect(screen.getByText("1,700")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText(/No confirmed target to compare against yet/)).toBeTruthy();
  });

  it("explains itself when nothing was logged in the window", () => {
    render(<NutritionTrendsSection meals={[]} date="2026-11-19" target={target} locale="en" />);
    expect(screen.getByText(/Log food for a few days/)).toBeTruthy();
  });
});
