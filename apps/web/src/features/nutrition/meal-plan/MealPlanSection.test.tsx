import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratedMealPlan, Profile, SavedMealPlan } from "@gym/contracts";
import { useGymStore } from "../../../store/useGymStore";
import { MealPlanSection } from "./MealPlanSection";

const timestamp = "2026-08-14T00:00:00.000Z";
const profile: Profile = {
  id: "profile",
  displayName: "Minh",
  locale: "en",
  units: "metric",
  goal: "general",
  experience: "beginner",
  daysPerWeek: 3,
  nutritionTarget: {
    calories: 2_000,
    protein: 140,
    carbs: 250,
    fat: 60,
    waterMl: 2_500,
    formulaVersion: 1,
    confirmedAt: timestamp,
    source: "manual"
  },
  locations: [],
  onboardingComplete: true,
  createdAt: timestamp,
  updatedAt: timestamp
};

const generated: GeneratedMealPlan = {
  durationDays: 1,
  startDate: "2026-08-14",
  targetSnapshot: {
    calories: 2_000,
    protein: 140,
    carbs: 250,
    fat: 60,
    formulaVersion: 1,
    confirmedAt: timestamp,
    source: "manual"
  },
  filtersSnapshot: {
    includeSnack: false,
    cuisines: ["vietnamese"],
    dietaryTags: [],
    excludedAllergens: [],
    seed: "ui-test"
  },
  days: [{
    dayIndex: 0,
    date: "2026-08-14",
    meals: [{
      id: "planned_meal_1",
      dayIndex: 0,
      meal: "lunch",
      recipeId: "recipe_com_ga",
      recipeNameSnapshot: { vi: "Cơm gà", en: "Chicken rice" },
      cuisine: "vietnamese",
      servingGrams: 420,
      nutrientsSnapshot: { calories: 650, protein: 45, carbs: 80, fat: 17 },
      ingredientSnapshots: [{
        foodId: "food_rice",
        nameSnapshot: { vi: "Gạo", en: "Rice" },
        grams: 100,
        groupId: "starch",
        required: true,
        missingGrams: 50
      }],
      sourcePackVersion: "2026.08.1"
    }],
    totalsSnapshot: { calories: 650, protein: 45, carbs: 80, fat: 17 }
  }],
  shoppingListSnapshot: [{
    foodId: "food_rice",
    nameSnapshot: { vi: "Gạo", en: "Rice" },
    groupId: "starch",
    missingGrams: 50
  }],
  warnings: [{
    code: "target_out_of_range",
    message: { vi: "Ngoài mục tiêu", en: "Outside target" },
    dayIndex: 0
  }],
  algorithmVersion: 1,
  sourcePackVersion: "2026.08.1"
};

beforeEach(() => {
  useGymStore.setState({
    profile,
    pantryItems: [],
    mealPlans: [],
    generatedMealPlan: undefined,
    mealPlanStatus: "idle",
    mealPlanError: undefined,
    nutritionPackRecord: {
      id: "nutrition-pack",
      status: "ready",
      version: "2026.08.1",
      schemaVersion: 3,
      bytesDownloaded: 1,
      activeRecipeCount: 800,
      recipeStepCount: 3_200
    },
    nutritionPackManifest: {
      id: "gym-local-nutrition",
      version: "2026.08.1",
      schemaVersion: 3,
      createdAt: "2026-08-14T00:00:00Z",
      minimumAppVersion: "0.7.0",
      fileName: "gym-local-nutrition-2026.08.1.sqlite3",
      downloadUrl: "./gym-local-nutrition-2026.08.1.sqlite3",
      sizeBytes: 41_443_328,
      sha256: "a".repeat(64),
      foodCount: 14_335,
      aliasCount: 53_255,
      vietnameseRecipeCount: 480,
      foodGroupCount: 10,
      recipeIngredientCount: 5_253,
      vietnameseDisplayFoodCount: 14_335,
      activeRecipeCount: 800,
      deprecatedRecipeCount: 300,
      recipeStepCount: 3_200,
      cuisineCounts: { vietnamese: 480 },
      sources: []
    },
    generateUserMealPlan: vi.fn().mockResolvedValue(generated),
    clearGeneratedMealPlan: vi.fn(),
    saveGeneratedMealPlan: vi.fn(),
    removeSavedMealPlan: vi.fn(),
    logSavedMealPlanDays: vi.fn().mockResolvedValue([])
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Vietnamese seven-day meal-plan UI", () => {
  it.each([320, 390])("renders the complete controller at %d px without switching to English", (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    fireEvent(window, new Event("resize"));
    render(<MealPlanSection />);

    expect(screen.getByRole("heading", { name: "Lập thực đơn Việt–Á" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ngày bắt đầu")).toBeInTheDocument();
    expect(screen.getByText("Loại trừ dị ứng")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo thực đơn 7 ngày" })).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/Meal plan|Breakfast|Lunch|Dinner|Shopping list/);
  });

  it("sends confirmed targets and hard filters to the offline generator", async () => {
    const user = userEvent.setup();
    render(<MealPlanSection />);

    await user.selectOptions(screen.getByLabelText("Chế độ ăn"), "vegan");
    await user.click(screen.getByRole("button", { name: "Đậu phộng" }));
    await user.click(screen.getByRole("button", { name: "Tạo thực đơn 7 ngày" }));

    await waitFor(() => expect(useGymStore.getState().generateUserMealPlan).toHaveBeenCalledWith(expect.objectContaining({
      durationDays: 7,
      dietaryTags: ["vegan"],
      excludedAllergens: ["peanut"],
      target: expect.objectContaining({ confirmedAt: timestamp, formulaVersion: 1 })
    })));
  });

  it("shows day cards, shopping snapshots, warnings, save, swap, and saved-plan controls", async () => {
    const saved: SavedMealPlan = {
      ...generated,
      id: "meal_plan_1",
      name: { vi: "Thực đơn của Minh", en: "Minh meal plan" },
      createdAt: timestamp,
      updatedAt: timestamp
    };
    useGymStore.setState({ generatedMealPlan: generated, mealPlans: [saved] });
    const user = userEvent.setup();
    render(<MealPlanSection />);

    expect(screen.getByRole("heading", { name: "Cơm gà" })).toBeInTheDocument();
    expect(screen.getByText("Danh sách cần mua")).toBeInTheDocument();
    expect(screen.getByText(/chưa đạt dải năng lượng/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu trên thiết bị" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Đổi món và cân đối lại cả tuần" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ghi ngày đầu" }));
    expect(useGymStore.getState().logSavedMealPlanDays).toHaveBeenCalledWith("meal_plan_1", [0]);
  });

  it("blocks generation when the nutrition target is not confirmed", () => {
    useGymStore.setState({
      profile: { ...profile, nutritionTarget: { ...profile.nutritionTarget!, confirmedAt: undefined } }
    });
    render(<MealPlanSection />);

    expect(screen.getByText(/Mục tiêu hiện tại chưa được xác nhận/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo thực đơn 7 ngày" })).toBeDisabled();
  });

  it("accepts a confirmed estimated target when its body inputs still match", () => {
    const basis = {
      biologicalSex: "male" as const,
      age: 30,
      heightCm: 175,
      weightKg: 75,
      activityFactor: 1.55 as const,
      goal: "hypertrophy" as const
    };
    useGymStore.setState({
      profile: {
        ...profile,
        ...basis,
        nutritionTarget: {
          ...profile.nutritionTarget!,
          source: "estimated",
          basis,
          calculatedAt: "2026-08-13T00:00:00.000Z",
          confirmedAt: timestamp
        }
      }
    });
    render(<MealPlanSection />);

    expect(screen.queryByText(/Mục tiêu hiện tại chưa được xác nhận/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo thực đơn 7 ngày" })).toBeEnabled();
  });
});
