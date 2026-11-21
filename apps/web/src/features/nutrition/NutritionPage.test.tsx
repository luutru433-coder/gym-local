import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodItem, NutritionPackManifest, Profile } from "@gym/contracts";
import { createMealEntry, createRecipe } from "@gym/nutrition";
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

describe("fast meal logging", () => {
  const packFood: FoodItem = {
    id: "pack-pho",
    name: { vi: "Phở bò", en: "Beef pho" },
    per100g: { calories: 90, protein: 6, carbs: 12, fat: 2 },
    source: "vietnamese_recipe",
    dataQuality: "estimated_recipe",
    updatedAt: "2026-08-13T00:00:00.000Z"
  };
  const rice: FoodItem = { ...food, id: "food-rice", name: { vi: "Cơm trắng", en: "White rice" } };

  it("searches the offline pack while typing, without a search button", async () => {
    const user = userEvent.setup();
    const search = vi.fn().mockResolvedValue([packFood]);
    useGymStore.setState({
      nutritionPackRecord: { id: "nutrition-pack", status: "ready", version: "2026.08.1", bytesDownloaded: 1 },
      searchOfflineNutritionFoods: search
    });
    render(<NutritionPage />);

    await user.click(screen.getByRole("button", { name: "Add lunch" }));
    expect(screen.queryByRole("button", { name: "Tìm offline" })).toBeNull();
    await user.type(screen.getByRole("searchbox", { name: "Tìm thực phẩm" }), "pho");

    expect(await screen.findByText("Phở bò")).toBeVisible();
    expect(search).toHaveBeenLastCalledWith("pho");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("lists recently logged foods first and logs the last amount in one tap", async () => {
    const user = userEvent.setup();
    useGymStore.setState({
      foods: [food, rice],
      foodPreferences: [{ id: "preference-rice", foodId: rice.id, favorite: false, defaultServingGrams: 150, lastUsedAt: "2026-08-13T01:00:00.000Z", useCount: 3 }]
    });
    render(<NutritionPage />);

    await user.click(screen.getByRole("button", { name: "Add dinner" }));
    const names = Array.from(document.querySelectorAll(".food-result__select strong")).map((node) => node.textContent);
    expect(names).toEqual(["Cơm trắng", "Yến mạch"]);

    await user.click(screen.getByRole("button", { name: "Ghi nhanh 150g Cơm trắng" }));

    await waitFor(() => expect(useGymStore.getState().addMeal).toHaveBeenCalledTimes(1));
    const entry = vi.mocked(useGymStore.getState().addMeal).mock.calls[0]?.[0];
    expect(entry).toMatchObject({ foodId: rice.id, grams: 150, meal: "dinner" });
    await waitFor(() => expect(screen.queryByRole("searchbox", { name: "Tìm thực phẩm" })).toBeNull());
  });
});

describe("copying meals from a previous day", () => {
  const rice: FoodItem = { ...food, id: "food-rice", name: { vi: "Cơm trắng", en: "White rice" } };
  const pad = (value: number) => String(value).padStart(2, "0");
  const dayOffset = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  it("copies a whole earlier day into the selected day", async () => {
    const user = userEvent.setup();
    const source = dayOffset(-2);
    const meals = [createMealEntry(food, 60, source, "breakfast"), createMealEntry(rice, 150, source, "lunch")];
    useGymStore.setState({ foods: [food, rice], meals });
    render(<NutritionPage />);

    await user.click(screen.getByRole("button", { name: "Sao chép ngày trước" }));
    expect(screen.getByLabelText("Sao chép từ ngày")).toHaveValue(source);
    await user.click(screen.getByRole("button", { name: /Sao chép 2 món/ }));

    await waitFor(() => expect(useGymStore.getState().addMeal).toHaveBeenCalledTimes(2));
    const copies = vi.mocked(useGymStore.getState().addMeal).mock.calls.map((call) => call[0]);
    expect(copies.every((entry) => entry.date === dayOffset(0))).toBe(true);
    expect(copies.map((entry) => entry.meal).sort()).toEqual(["breakfast", "lunch"]);
    expect(copies.find((entry) => entry.meal === "lunch")).toMatchObject({ foodId: rice.id, grams: 150, nutrientsSnapshot: meals[1].nutrientsSnapshot });
    expect(copies.some((entry) => meals.some((original) => original.id === entry.id))).toBe(false);
  });

  it("copies a single meal from the last day it was logged", async () => {
    const user = userEvent.setup();
    const meals = [createMealEntry(food, 60, dayOffset(-1), "breakfast"), createMealEntry(rice, 150, dayOffset(-3), "lunch")];
    useGymStore.setState({ foods: [food, rice], meals });
    render(<NutritionPage />);

    expect(screen.queryByRole("button", { name: "Sao chép bữa tối từ ngày trước" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Sao chép bữa trưa từ ngày trước" }));
    expect(screen.getByLabelText("Sao chép từ ngày")).toHaveValue(dayOffset(-3));
    await user.click(screen.getByRole("button", { name: /Sao chép 1 món/ }));

    await waitFor(() => expect(useGymStore.getState().addMeal).toHaveBeenCalledTimes(1));
    expect(vi.mocked(useGymStore.getState().addMeal).mock.calls[0]?.[0]).toMatchObject({ meal: "lunch", foodId: rice.id, grams: 150, date: dayOffset(0) });
  });
});
