import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnlineExerciseGif from "./OnlineExerciseGif";

type Find = (...args: unknown[]) => Promise<{ name: string; gifUrl: string } | undefined>;
const state = vi.hoisted(() => ({ enabled: true, find: undefined as unknown as import("vitest").Mock<Find> }));

vi.mock("@gym/storage/device", () => ({ isOnlineExerciseGifsEnabled: () => state.enabled }));
vi.mock("@gym/media/online-gifs", () => ({
  ONLINE_GIF_CREDIT: { name: "ExerciseDB by AscendAPI", url: "https://ascendapi.com" },
  findOnlineExerciseGif: (...args: unknown[]) => state.find(...args)
}));

const variant = { id: "chest_press__barbell", movementId: "chest_press", equipment: ["barbell"] };
const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

describe("OnlineExerciseGif", () => {
  beforeEach(() => {
    state.enabled = true;
    state.find = vi.fn<Find>(async () => ({ name: "barbell bench press", gifUrl: "https://static.exercisedb.dev/media/a.gif" }));
    setOnline(true);
  });

  it("shows the live GIF with the AscendAPI credit when online and turned on", async () => {
    render(<OnlineExerciseGif variant={variant} exerciseName="Chest Press" locale="en" />);
    expect(await screen.findByRole("img", { name: "Chest Press: barbell bench press" })).toHaveAttribute("src", "https://static.exercisedb.dev/media/a.gif");
    expect(screen.getByRole("link", { name: "ExerciseDB by AscendAPI" })).toHaveAttribute("href", "https://ascendapi.com");
    expect(screen.getByText(/not stored on this device/)).toBeInTheDocument();
  });

  it("makes no request and shows nothing when the option is off", async () => {
    state.enabled = false;
    const { container } = render(<OnlineExerciseGif variant={variant} exerciseName="Chest Press" locale="en" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(state.find).not.toHaveBeenCalled();
  });

  it("makes no request offline, then looks the exercise up when the device comes back online", async () => {
    setOnline(false);
    const { container } = render(<OnlineExerciseGif variant={variant} exerciseName="Đẩy ngực ngang" locale="vi" />);
    expect(container).toBeEmptyDOMElement();
    expect(state.find).not.toHaveBeenCalled();
    setOnline(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(await screen.findByText("Hình trực tuyến")).toBeInTheDocument();
    setOnline(false);
    act(() => { window.dispatchEvent(new Event("offline")); });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows nothing when no GIF fits or the lookup fails", async () => {
    state.find = vi.fn<Find>(async () => undefined);
    const first = render(<OnlineExerciseGif variant={variant} exerciseName="Chest Press" locale="en" />);
    await waitFor(() => expect(state.find).toHaveBeenCalled());
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    state.find = vi.fn<Find>(async () => { throw new Error("down"); });
    const second = render(<OnlineExerciseGif variant={variant} exerciseName="Chest Press" locale="en" />);
    await waitFor(() => expect(state.find).toHaveBeenCalled());
    expect(second.container).toBeEmptyDOMElement();
  });
});
