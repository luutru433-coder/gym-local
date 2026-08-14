import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodItem, PantryItem, Profile } from "@gym/contracts";
import type { OfflineMenuSuggestion } from "@gym/nutrition";
import { useGymStore } from "../../store/useGymStore";
import { PantryMenuSection } from "./PantryMenuSection";

const timestamp = "2026-08-14T00:00:00.000Z";
const profile: Profile = {
  id: "profile",
  displayName: "Minh",
  locale: "vi",
  units: "metric",
  goal: "general",
  experience: "beginner",
  daysPerWeek: 3,
  nutritionTarget: { calories: 2100, protein: 120, carbs: 250, fat: 60, waterMl: 2500, formulaVersion: 1 },
  locations: [],
  onboardingComplete: true,
  createdAt: timestamp,
  updatedAt: timestamp
};
const chicken: FoodItem = {
  id: "pack_usda_171075",
  name: { vi: "Ức gà nướng", en: "Chicken breast, roasted" },
  per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  source: "usda_fdc",
  sourceFoodId: "171075",
  updatedAt: timestamp
};
const pantryGroup: PantryItem = {
  id: "pantry_starch",
  kind: "group",
  groupId: "starch",
  groupNameSnapshot: { vi: "Tinh bột", en: "Starch" },
  createdAt: timestamp,
  updatedAt: timestamp
};
const suggestion: OfflineMenuSuggestion = {
  recipeId: "vi_recipe_001",
  name: { vi: "Cơm ức gà rau cải", en: "Chicken rice with greens" },
  servingGrams: 345,
  nutrients: { calories: 510, protein: 44, carbs: 55, fat: 12 },
  estimationNote: "Estimated",
  mealSlots: ["lunch", "dinner"],
  tags: ["balanced_meal"],
  dietaryTags: [],
  allergenTags: [],
  completeRequired: false,
  requiredCoverage: 0.667,
  exactMatchCount: 1,
  groupMatchCount: 1,
  missingRequiredCount: 1,
  ingredients: [{
    position: 1,
    foodId: "usda_rice",
    name: { vi: "Cơm", en: "Rice" },
    grams: 150,
    role: "base",
    groupId: "starch",
    required: true,
    matchedBy: "group",
    availabilityRatio: 1,
    pantryItemId: "pantry_starch"
  }, {
    position: 2,
    foodId: "usda_chicken",
    name: { vi: "Ức gà", en: "Chicken breast" },
    grams: 110,
    role: "protein",
    groupId: "meat",
    required: true,
    matchedBy: "exact",
    availabilityRatio: 1,
    pantryItemId: "pantry_chicken"
  }, {
    position: 3,
    foodId: "usda_broccoli",
    name: { vi: "Bông cải", en: "Broccoli" },
    grams: 80,
    role: "vegetable",
    groupId: "vegetables",
    required: true,
    matchedBy: "missing",
    availabilityRatio: 0
  }]
};

beforeEach(() => {
  useGymStore.setState({
    profile,
    pantryItems: [pantryGroup],
    nutritionPackRecord: { id: "nutrition-pack", status: "ready", bytesDownloaded: 1, version: "2026.08" },
    nutritionPackManifest: {
      id: "gym-local-nutrition",
      version: "2026.08",
      schemaVersion: 2,
      createdAt: "2026-08-14T00:00:00Z",
      minimumAppVersion: "0.6.0",
      fileName: "nutrition.sqlite3",
      downloadUrl: "./nutrition.sqlite3",
      sizeBytes: 1,
      sha256: "a".repeat(64),
      foodCount: 13_835,
      aliasCount: 24_907,
      vietnameseRecipeCount: 300,
      foodGroupCount: 10,
      recipeIngredientCount: 1200,
      sources: []
    },
    menuSuggestions: [],
    menuSuggestionStatus: "idle",
    menuSuggestionError: undefined,
    searchOfflineNutritionFoods: vi.fn().mockResolvedValue([chicken]),
    saveUserPantryItem: vi.fn().mockImplementation(async (item) => item),
    removePantryItem: vi.fn().mockResolvedValue(undefined),
    refreshMenuSuggestions: vi.fn().mockResolvedValue([]),
    addMeal: vi.fn().mockResolvedValue(undefined)
  });
});

afterEach(cleanup);

describe("pantry menu UI", () => {
  it("adds an exact food with an optional amount from offline search", async () => {
    const user = userEvent.setup();
    render(<PantryMenuSection />);

    await user.type(screen.getByLabelText("Tìm thực phẩm cho kho"), "ức gà");
    await user.click(screen.getByRole("button", { name: "Tìm" }));
    await user.click(await screen.findByRole("button", { name: /Ức gà nướng/ }));
    await user.type(screen.getByLabelText("Đang có (g, tùy chọn)"), "300");
    await user.click(screen.getByRole("button", { name: "Thêm vào kho" }));

    await waitFor(() => expect(useGymStore.getState().saveUserPantryItem).toHaveBeenCalledWith(expect.objectContaining({
      kind: "food",
      foodId: chicken.id,
      foodNameSnapshot: chicken.name,
      availableGrams: 300
    })));
  });

  it("passes meal, calorie, dietary, and allergy filters to the ranking engine", async () => {
    const user = userEvent.setup();
    render(<PantryMenuSection />);

    await user.click(screen.getByRole("checkbox", { name: "Chỉ món chay" }));
    await user.click(screen.getByRole("checkbox", { name: "Đậu nành" }));
    await user.click(screen.getByRole("button", { name: "Gợi ý món phù hợp" }));

    await waitFor(() => expect(useGymStore.getState().refreshMenuSuggestions).toHaveBeenCalledWith(expect.objectContaining({
      mealSlot: "lunch",
      calorieTarget: 700,
      dietaryTags: ["vegetarian"],
      excludedAllergens: ["soy"],
      limit: 12
    })));
  });

  it("shows match explanations and logs an immutable serving snapshot", async () => {
    const user = userEvent.setup();
    useGymStore.setState({ menuSuggestions: [suggestion], menuSuggestionStatus: "ready" });
    render(<PantryMenuSection />);

    expect(screen.getByText("67% phù hợp")).toBeInTheDocument();
    expect(screen.getAllByText(/còn thiếu/)).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Ghi 1 khẩu phần" }));

    await waitFor(() => expect(useGymStore.getState().addMeal).toHaveBeenCalledWith(expect.objectContaining({
      foodId: "pack_vi_recipe_001",
      foodNameSnapshot: suggestion.name,
      grams: 345,
      nutrientsSnapshot: suggestion.nutrients
    })));
  });
});
