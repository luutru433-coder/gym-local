import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultSettings, getProfile, gymDb, listRoutines } from "@gym/storage";
import { App } from "./App";
import { useGymStore } from "./store/useGymStore";

beforeEach(async () => {
  gymDb.close();
  await gymDb.delete();
  await gymDb.open();
  useGymStore.setState({
    ready: false,
    busy: false,
    error: undefined,
    notice: undefined,
    profile: undefined,
    routines: [],
    sessions: [],
    activeSession: undefined,
    foods: [],
    meals: [],
    bodyMetrics: [],
    settings: defaultSettings
  });
});

afterEach(async () => {
  cleanup();
  gymDb.close();
  await gymDb.delete();
});

describe("application onboarding", () => {
  it("hydrates an empty database and persists the starter profile and routines", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Tập thông minh hơn. Dữ liệu vẫn là của bạn." })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Tên hiển thị"), "Minh");
    await user.click(screen.getByRole("button", { name: /Tiếp tục/ }));
    await user.click(screen.getByRole("button", { name: /Tiếp tục/ }));
    await user.click(screen.getByRole("button", { name: /Bắt đầu/ }));

    await waitFor(() => expect(useGymStore.getState().profile?.onboardingComplete).toBe(true));
    expect((await getProfile())?.displayName).toBe("Minh");
    expect(await listRoutines()).toHaveLength(2);
  });
});
