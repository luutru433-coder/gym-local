/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationPilotApp } from "./AnimationPilotApp";

const storage = vi.hoisted(() => ({
  getAnimationPackStatus: vi.fn(),
  installAnimationPack: vi.fn(),
  readExactAnimationSource: vi.fn(),
  removeAnimationPack: vi.fn(),
  rollbackAnimationPack: vi.fn()
}));

vi.mock("@gym/storage", () => storage);

describe("AnimationPilotApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getAnimationPackStatus.mockResolvedValue({ state: "unavailable", warnings: [] });
    storage.installAnimationPack.mockResolvedValue({ state: "unavailable", warnings: [] });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("exposes local-only inputs, exact status and all 12 mappings", async () => {
    render(<AnimationPilotApp />);
    expect(screen.getByTestId("animation-pilot-app")).toBeInTheDocument();
    expect(screen.getByText(/Không có tải mạng tự động/)).toBeInTheDocument();
    const selector = screen.getByLabelText("Exercise variant");
    expect(within(selector).getAllByRole("option")).toHaveLength(12);
    expect(within(selector).getByRole("option", { name: "push_up__bodyweight" })).toBeInTheDocument();
    await waitFor(() => expect(storage.getAnimationPackStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Rollback" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("installs only the two explicitly selected local files", async () => {
    const user = userEvent.setup();
    render(<AnimationPilotApp />);
    const descriptor = new File(["{}"], "animation-pack-release.json", { type: "application/json" });
    const archive = new File([new Uint8Array([1, 2, 3])], "animation-pack.zip", { type: "application/zip" });
    const inputs = screen.getAllByLabelText(/Release descriptor JSON|Animation pack ZIP/);
    await user.upload(inputs[0], descriptor);
    await user.upload(inputs[1], archive);
    await user.click(screen.getByRole("button", { name: "Install / Update" }));
    await waitFor(() => expect(storage.installAnimationPack).toHaveBeenCalledTimes(1));
    expect(storage.installAnimationPack).toHaveBeenCalledWith("{}", archive);
  });

  it.each([320, 390] as const)("keeps keyboard controls, status, reduced motion, and written fallback at %ipx without network use", async (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true)
    })));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<AnimationPilotApp />);
    const group = screen.getByRole("group", { name: /exercise animation/ });
    expect(group).toBeInTheDocument();
    expect(screen.getByText("Hướng dẫn bằng chữ")).toBeInTheDocument();
    const play = screen.getByRole("button", { name: "Phát" });
    expect(play.tagName).toBe("BUTTON");
    const selector = screen.getByLabelText("Exercise variant");
    selector.focus();
    expect(document.activeElement).toBe(selector);
    expect(play).toBeDisabled();
    expect(play).toHaveAttribute("title", expect.stringMatching(/giảm chuyển động/));
    const status = within(group).getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    await waitFor(() => expect(status).toHaveTextContent(/Không mở được hoạt ảnh/));
    expect(group.querySelector(".exercise-animation__fallback--emphasized")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
