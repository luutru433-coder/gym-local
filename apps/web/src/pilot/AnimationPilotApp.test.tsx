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

  afterEach(cleanup);

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

  it("keeps native controls and written guidance at 320px without network use", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<AnimationPilotApp />);
    expect(screen.getByRole("group", { name: /exercise animation/ })).toBeInTheDocument();
    expect(screen.getByText("Hướng dẫn bằng chữ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phát" })).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
