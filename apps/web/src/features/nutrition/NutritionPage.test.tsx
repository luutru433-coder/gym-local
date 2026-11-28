import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodItem, NutritionPackManifest, Profile } from "@gym/contracts";
import { createMealEntry, createRecipe } from "@gym/nutrition";
import { defaultSettings } from "@gym/storage";
import { useGymStore } from "../../store/useGymStore";
import { NutritionPage } from "./NutritionPage";

const scanner = vi.hoisted(() => ({ decodeFromStream: vi.fn(), loadError: false }));

vi.mock("@zxing/browser", () => ({
  get BrowserMultiFormatReader() {
    if (scanner.loadError) throw new Error("Scanner module unavailable");
    return class {
      decodeFromStream = scanner.decodeFromStream;
    };
  }
}));

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

describe("food barcode camera", () => {
  const getUserMedia = vi.fn();
  const stopTrack = vi.fn();
  const stopDecoder = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] };

  beforeEach(() => {
    getUserMedia.mockReset().mockResolvedValue(stream);
    scanner.decodeFromStream.mockReset();
    scanner.loadError = false;
    stopTrack.mockClear();
    stopDecoder.mockClear();
    vi.stubGlobal("navigator", Object.create(navigator, { mediaDevices: { value: { getUserMedia } } }));
  });

  afterEach(() => vi.unstubAllGlobals());

  async function openScanner() {
    const user = userEvent.setup();
    render(<NutritionPage />);
    await user.click(screen.getByRole("button", { name: "Quét mã vạch" }));
    return { user, dialog: screen.getByRole("dialog", { name: "Quét mã vạch" }) };
  }

  it("shows the frame before permission resolves and stops scanning when closed", async () => {
    let grantCamera!: (value: typeof stream) => void;
    getUserMedia.mockReturnValue(new Promise<typeof stream>((resolve) => { grantCamera = resolve; }));
    scanner.decodeFromStream.mockImplementation(async (_stream: unknown, video: HTMLVideoElement) => {
      Object.defineProperty(video, "paused", { value: false });
      return { stop: stopDecoder };
    });

    const { user, dialog } = await openScanner();
    const video = dialog.querySelector("video");
    expect(video?.parentElement).not.toHaveClass("scanner__viewport--active");
    expect(getUserMedia).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Tiếp tục & xin quyền" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" } }));
    expect(video?.parentElement).toHaveClass("scanner__viewport--active");
    expect(screen.getByRole("status")).toHaveTextContent("Đang mở camera");
    expect(scanner.decodeFromStream).not.toHaveBeenCalled();

    await act(async () => { grantCamera(stream); });
    expect(scanner.decodeFromStream).toHaveBeenCalledWith(stream, video, expect.any(Function));
    expect(screen.getByText("Đưa mã vạch vào giữa khung hình.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(stopDecoder).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Quét mã" })).toBeVisible();
  });

  it("releases the stream if permission resolves after the scanner closes", async () => {
    let grantCamera!: (value: typeof stream) => void;
    getUserMedia.mockReturnValue(new Promise<typeof stream>((resolve) => { grantCamera = resolve; }));
    const { user } = await openScanner();
    await user.click(screen.getByRole("button", { name: "Tiếp tục & xin quyền" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Close" }));

    await act(async () => { grantCamera(stream); });
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(scanner.decodeFromStream).not.toHaveBeenCalled();
  });

  it.each([
    ["NotAllowedError", /Cài đặt → Safari .* → Camera/],
    ["SecurityError", /đóng hẳn ứng dụng trên màn hình chính/],
    ["NotFoundError", /Không tìm thấy camera phù hợp/],
    ["OverconstrainedError", /Không tìm thấy camera phù hợp/],
    ["NotReadableError", /Nếu ứng dụng hoặc tab khác đang dùng camera/],
    ["AbortError", /Không thể kết nối với camera/]
  ])("explains a %s camera request failure", async (name, message) => {
    getUserMedia.mockRejectedValue(new DOMException("", name));
    const { user } = await openScanner();
    await user.click(screen.getByRole("button", { name: "Tiếp tục & xin quyền" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(scanner.decodeFromStream).not.toHaveBeenCalled();
  });

  it("explains when the browser has no camera API", async () => {
    vi.stubGlobal("navigator", Object.create(navigator, { mediaDevices: { value: undefined } }));
    const { user } = await openScanner();
    await user.click(screen.getByRole("button", { name: "Tiếp tục & xin quyền" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("trình duyệt không hỗ trợ camera");
  });

  it("reports a scanner load failure before requesting the camera", async () => {
    scanner.loadError = true;
    const { user } = await openScanner();
    await user.click(screen.getByRole("button", { name: "Tiếp tục & xin quyền" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được trình quét mã vạch");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("reports a preview rejection after access is granted and releases the stream", async () => {
    scanner.decodeFromStream.mockRejectedValue(false);
    const { user } = await openScanner();
    await user.click(screen.getByRole("button", { name: "Tiếp tục & xin quyền" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Đã cấp quyền camera nhưng không hiển thị được hình ảnh xem trước");
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("reports a preview that stays paused even when the decoder resolves", async () => {
    scanner.decodeFromStream.mockResolvedValue({ stop: stopDecoder });
    const { user } = await openScanner();
    await user.click(screen.getByRole("button", { name: "Tiếp tục & xin quyền" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Đã cấp quyền camera nhưng không hiển thị được hình ảnh xem trước");
    expect(stopDecoder).toHaveBeenCalledOnce();
  });
});

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

  it("retries only the entries that were not saved and logs the latest amount last", async () => {
    const user = userEvent.setup();
    const source = dayOffset(-1);
    const meals = [
      { ...createMealEntry(rice, 200, source, "dinner"), createdAt: `${source}T12:00:00.000Z` },
      { ...createMealEntry(rice, 120, source, "lunch"), createdAt: `${source}T05:00:00.000Z` }
    ];
    const addMeal = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Lưu thất bại")).mockResolvedValue(undefined);
    useGymStore.setState({ foods: [food, rice], meals, addMeal });
    render(<NutritionPage />);

    await user.click(screen.getByRole("button", { name: "Sao chép ngày trước" }));
    await user.click(screen.getByRole("button", { name: /Sao chép 2 món/ }));
    expect(await screen.findByText("Lưu thất bại")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Sao chép 2 món/ }));

    await waitFor(() => expect(addMeal).toHaveBeenCalledTimes(3));
    const saved = addMeal.mock.calls.map((call) => call[0]);
    expect(saved.map((entry) => entry.grams)).toEqual([120, 200, 200]);
    expect(saved[1].id).toBe(saved[2].id);
    await waitFor(() => expect(screen.queryByLabelText("Sao chép từ ngày")).toBeNull());
  });
});
