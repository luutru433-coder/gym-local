import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MealEntry, Profile } from "@gym/contracts";
import { weightTrend } from "@gym/progress";
import { snoozeCalorieCheck } from "@gym/storage/device";
import { useGymStore } from "../../store/useGymStore";
import { CalorieTargetCard } from "./CalorieTargetCard";

function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function profile(locale: "vi" | "en"): Profile {
  return {
    id: "profile", displayName: "Minh", locale, units: "metric", experience: "intermediate", daysPerWeek: 4,
    locations: [], onboardingComplete: true, biologicalSex: "male", age: 30, heightCm: 175, weightKg: 75,
    activityFactor: 1.55, goal: "general", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    nutritionTarget: { calories: 2500, protein: 105, carbs: 364, fat: 69, waterMl: 2625, formulaVersion: 1, source: "estimated", confirmedAt: "2026-08-01T00:00:00.000Z" }
  } as Profile;
}

function meals(calories: number): MealEntry[] {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `meal_${index}`, date: day(-20 + index), meal: "lunch", foodId: "food", foodNameSnapshot: { vi: "Cơm", en: "Rice" }, grams: 100,
    nutrientsSnapshot: { calories, protein: 0, carbs: 0, fat: 0 }, createdAt: "2026-08-01T00:00:00.000Z"
  } as MealEntry));
}

const steady = weightTrend([-20, -13, -6, -1].map((offset) => ({ date: day(offset), value: 75 })));

function setup(locale: "vi" | "en", calories: number, trend = steady) {
  const updateProfile = vi.fn<(profile: Profile) => Promise<void>>(async (next) => useGymStore.setState({ profile: next }));
  useGymStore.setState({ profile: profile(locale), meals: meals(calories), updateProfile });
  render(<CalorieTargetCard trend={trend} />);
  return { user: userEvent.setup(), updateProfile };
}

afterEach(() => {
  cleanup();
  snoozeCalorieCheck("");
});

describe("CalorieTargetCard", () => {
  it("saves the suggested target only after the user accepts it", async () => {
    const { user, updateProfile } = setup("vi", 2300);

    expect(screen.getByText(/2\.500 → 2\.300 kcal/)).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Dùng mục tiêu mới" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0]![0].nutritionTarget).toMatchObject({ calories: 2300, protein: 105, fat: 64, source: "manual", confirmedAt: expect.any(String) });
    expect(await screen.findByText("Đã đổi mục tiêu thành 2.300 kcal/ngày.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dùng mục tiêu mới" })).toBeNull();
  });

  it("hides an ignored suggestion for a week without changing the target", async () => {
    const { user, updateProfile } = setup("en", 2300);

    await user.click(screen.getByRole("button", { name: "Ignore" }));
    expect(screen.getByText(/^Suggestion ignored\./)).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();

    cleanup();
    render(<CalorieTargetCard trend={steady} />);
    expect(screen.queryByRole("button", { name: "Use new target" })).toBeNull();
    expect(screen.getByText(/^Suggestion ignored\./)).toBeInTheDocument();
  });

  it("says the target still fits when intake and trend agree with it", () => {
    setup("en", 2500);
    expect(screen.getByText("Your current target of 2,500 kcal/day still fits your data.")).toBeInTheDocument();
  });

  it("explains what is missing instead of suggesting from too little data", () => {
    setup("en", 2300, steady.slice(0, 2));
    expect(screen.getByText(/Needs at least 3 weigh-ins across 14 days.*So far: 2 weigh-ins across 7 days/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use new target" })).toBeNull();
  });
});
