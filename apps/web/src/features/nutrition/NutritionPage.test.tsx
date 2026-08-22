import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodItem, NutritionPackManifest, Profile } from "@gym/contracts";
import { createRecipe } from "@gym/nutrition";
import { defaultSettings } from "@gym/storage";
import { useGymStore } from "../../store/useGymStore";
import { NutritionPage } from "./NutritionPage";

const food: FoodItem = {
  id: "food-oats",
  name: { vi: "Yến mạch", en: "Oats" },
  per100g: { calories: 380, protein: 13, carbs: 68, fat: 7, fiber: 10 },
  source: "custom",
  dataQuality: "partial",
  updatedAt: "2026-08-13T00:00:00.000Z"
};

const profile: Profile = {
  id: "profile",
  displayName: "Minh",
  locale: "vi",
  units: "metric",
  goal: "general",
  experience: "beginner",
  daysPerWeek: 3,
  locations: [],
  onboardingComplete: true,
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z"
};

beforeEach(() => {
  useGymStore.setState({
    profile,
    foods: [food],
    meals: [],
    recipes: [],
    waterEntries: [],
    foodPreferences: [],
    settings: defaultSettings,
    nutritionPackRecord: { id: "nutrition-pack", status: "not_installed", bytesDownloaded: 0 },
    nutritionPackManifest: undefined,
    nutritionPackError: undefined,
    refreshNutritionPack: vi.fn().mockResolvedValue(undefined),
    installOfflineNutritionPack: vi.fn().mockResolvedValue(undefined),
    saveUserRecipe: vi.fn().mockImplementation(async (recipe) => recipe),
    removeRecipe: vi.fn().mockResolvedValue(undefined),
    addMeal: vi.fn().mockResolvedValue(undefined),
    addWater: vi.fn().mockResolvedValue(undefined),
    removeWater: vi.fn().mockResolvedValue(undefined),
    saveUserFoodPreference: vi.fn().mockImplementation(async (preference) => preference)
  });
});

afterEach(cleanup);

describe("nutrition recipe flows", () => {
  it("creates a serving-based recipe from saved foods", async () => {
    const user = userEvent.setup();
    render(<NutritionPage />);

    await user.click(screen.getByRole("button", { name: "Tạo công thức" }));
    await user.type(screen.getByLabelText("Tên món"), "Cháo yến mạch");
    await user.clear(screen.getByLabelText("Khối lượng thành phẩm (g)"));
    await user.type(screen.getByLabelText("Khối lượng thành phẩm (g)"), "300");
    await user.click(screen.getByRole("button", { name: "Lưu công thức" }));

    await waitFor(() => expect(useGymStore.getState().saveUserRecipe).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(useGymStore.getState().saveUserRecipe).mock.calls[0]?.[0];
    expect(saved?.name.vi).toBe("Cháo yến mạch");
    expect(saved?.yieldGrams).toBe(300);
    expect(saved?.ingredients[0]?.foodId).toBe(food.id);
  });

  it("logs one recipe serving without changing its ingredient snapshots", async () => {
    const user = userEvent.setup();
    const recipe = createRecipe("Yến mạch", [{ food, grams: 100 }], { yieldGrams: 200, servings: 2 });
    useGymStore.setState({ recipes: [recipe] });
    render(<NutritionPage />);

    await user.click(screen.getByRole("button", { name: "+ 1 phần" }));

    await waitFor(() => expect(useGymStore.getState().addMeal).toHaveBeenCalledTimes(1));
    const entry = vi.mocked(useGymStore.getState().addMeal).mock.calls[0]?.[0];
    expect(entry?.grams).toBe(100);
    expect(entry?.foodNameSnapshot.vi).toBe("Yến mạch");
  });

  it("offers an atomic update when an older ready pack is installed", async () => {
    const user = userEvent.setup();
    const manifest: NutritionPackManifest = {
      id: "gym-local-nutrition",
      version: "2026.08.1",
      schemaVersion: 3,
      createdAt: "2026-08-14T00:00:00.000Z",
      minimumAppVersion: "0.7.0",
      fileName: "gym-local-nutrition-2026.08.1.sqlite3",
      downloadUrl: "./gym-local-nutrition-2026.08.1.sqlite3",
      sizeBytes: 37_552_128,
      sha256: "190d69434927b583ac231594bd3c2253a6375b654fe1047ae17cce67f919e881",
      foodCount: 14_335,
      aliasCount: 47_328,
      vietnameseRecipeCount: 480,
      activeRecipeCount: 800,
      sources: []
    };
    useGymStore.setState({
      nutritionPackManifest: manifest,
      nutritionPackRecord: {
        id: "nutrition-pack",
        status: "ready",
        version: "2026.08",
        schemaVersion: 2,
        checksum: "a".repeat(64),
        bytesDownloaded: 1
      }
    });
    render(<NutritionPage />);

    await user.click(screen.getByRole("button", { name: "Cập nhật kho 2026.08.1" }));

    await waitFor(() => expect(useGymStore.getState().installOfflineNutritionPack).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Xóa gói" })).toBeVisible();
  });
});
