import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@gym/contracts";
import { estimateNutritionTarget } from "@gym/nutrition";
import { defaultSettings } from "@gym/storage";
import { getThemePreference, setThemePreference } from "@gym/storage/device";
import { useGymStore } from "../../store/useGymStore";
import { SettingsPage } from "./SettingsPage";

const timestamp = "2026-08-13T10:00:00.000Z";

function profile(): Profile {
  const input = {
    biologicalSex: "male" as const,
    age: 30,
    heightCm: 175,
    weightKg: 75,
    activityFactor: 1.55 as const,
    goal: "hypertrophy" as const
  };
  return {
    id: "profile",
    displayName: "Minh",
    locale: "vi",
    units: "metric",
    experience: "intermediate",
    daysPerWeek: 4,
    locations: [],
    onboardingComplete: true,
    ...input,
    nutritionTarget: { ...estimateNutritionTarget(input), confirmedAt: timestamp },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

afterEach(() => {
  cleanup();
  setThemePreference("system");
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe("nutrition target confirmation", () => {
  it("does not replace a target after body details change until the estimate is confirmed", async () => {
    const user = userEvent.setup();
    const storedProfile = profile();
    const updateProfile = vi.fn(async (updated: Profile) => {
      useGymStore.setState({ profile: updated });
    });
    useGymStore.setState({
      profile: storedProfile,
      settings: defaultSettings,
      activeSession: undefined,
      recoveryAvailable: false,
      updateProfile
    });
    render(<SettingsPage />);

    const weight = screen.getByRole("spinbutton", { name: "Cân nặng (kg)" });
    await user.clear(weight);
    await user.type(weight, "80");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Xác nhận mục tiêu dinh dưỡng" })).toBeInTheDocument();
    expect(screen.getByText(/80 kg/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Xác nhận & lưu" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0]?.[0].nutritionTarget).toMatchObject({
      confirmedAt: expect.any(String),
      basis: { weightKg: 80 }
    });
  });
});

describe("appearance", () => {
  it("follows the system by default and keeps a manual choice on the device", async () => {
    const user = userEvent.setup();
    useGymStore.setState({ profile: profile(), settings: defaultSettings, activeSession: undefined, recoveryAvailable: false });
    render(<SettingsPage />);

    expect(screen.getByRole("button", { name: "Theo máy" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Tối" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(getThemePreference()).toBe("dark");
    expect(screen.getByRole("button", { name: "Tối" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Sáng" }));
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.click(screen.getByRole("button", { name: "Theo máy" }));
    expect(getThemePreference()).toBe("system");
  });
});
