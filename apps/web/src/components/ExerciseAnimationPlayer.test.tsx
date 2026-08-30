/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseAnimationPlayerState,
  type AnimationPlayerRequest,
  type AnimationPlayerState
} from "@gym/contracts";
import type { AnimationPlayerController } from "@gym/media";
import { ExerciseAnimationPlayer } from "./ExerciseAnimationPlayer";

const animationCss = readFileSync(resolve(process.cwd(), "apps/web/src/components/ExerciseAnimationPlayer.css"), "utf8");
const componentSource = readFileSync(resolve(process.cwd(), "apps/web/src/components/ExerciseAnimationPlayer.tsx"), "utf8");

const REQUEST: AnimationPlayerRequest = {
  exerciseVariantId: "squat__barbell",
  animationId: "animation.squat-barbell",
  playbackSpeed: 1,
  cameraPreset: "three_quarter",
  mirrorMode: "none",
  reducedMotion: false
};

const NAMES = { vi: "Ngồi xổm với đòn tạ", en: "Barbell squat" };
const FALLBACK = {
  vi: "Giữ ngực cao, hạ hông có kiểm soát và giữ đầu gối cùng hướng với bàn chân.",
  en: "Keep the chest tall, lower with control, and track the knees over the feet."
};

interface ControlledController {
  controller: AnimationPlayerController;
  setState(nextState: AnimationPlayerState): void;
}

interface MatchMediaControl {
  query: MediaQueryList;
  setMatches(matches: boolean): void;
}

function controlledController(initialState: AnimationPlayerState = { status: "idle", offlineFallback: "none" }): ControlledController {
  let state: Readonly<AnimationPlayerState> = initialState;
  const listeners = new Set<() => void>();
  const controller: AnimationPlayerController = {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attach: vi.fn(),
    detach: vi.fn(),
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    retry: vi.fn(),
    dispose: vi.fn()
  };
  return {
    controller,
    setState(nextState) {
      expect(parseAnimationPlayerState(nextState).success).toBe(true);
      state = nextState;
      for (const listener of [...listeners]) listener();
    }
  };
}

function installMatchMedia(initialMatches = false): MatchMediaControl {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener as (event: MediaQueryListEvent) => void);
    }),
    removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener as (event: MediaQueryListEvent) => void);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return {
    query,
    setMatches(nextMatches) {
      matches = nextMatches;
      const event = { matches, media: query.media } as MediaQueryListEvent;
      for (const listener of [...listeners]) listener(event);
    }
  };
}

function renderPlayer(controlled: ControlledController, locale: "vi" | "en" = "en", request = REQUEST) {
  return render(
    <ExerciseAnimationPlayer
      controller={controlled.controller}
      request={request}
      locale={locale}
      exerciseName={NAMES}
      writtenFallback={FALLBACK}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ExerciseAnimationPlayer", () => {
  it("attaches one labeled viewport, loads without autoplay, and keeps written guidance in the idle DOM", async () => {
    installMatchMedia();
    const controlled = controlledController();
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    const view = renderPlayer(controlled);

    const group = screen.getByRole("group", { name: /Ngồi xổm với đòn tạ.*exercise animation.*Barbell squat/i });
    const viewport = screen.getByRole("img", { name: "Animation viewport for Barbell squat" });
    expect(group).toContainElement(viewport);
    expect(screen.getByRole("status")).toHaveTextContent("Ready to load animation");
    expect(screen.getByText(FALLBACK.en)).toBeVisible();
    expect(screen.getByRole("slider", { name: "Animation position" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    await waitFor(() => expect(controlled.controller.attach).toHaveBeenCalledWith(viewport));
    await waitFor(() => expect(controlled.controller.load).toHaveBeenCalledWith(REQUEST));
    expect(controlled.controller.play).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(outside);

    view.unmount();
    expect(controlled.controller.detach).toHaveBeenCalledTimes(1);
    outside.remove();
  });

  it("uses native play, pause, replay, retry, and seek controls with localized names", async () => {
    installMatchMedia();
    const user = userEvent.setup();
    const controlled = controlledController({
      status: "ready",
      request: REQUEST,
      durationSeconds: 4,
      offlineFallback: "none"
    });
    renderPlayer(controlled);

    const play = screen.getByRole("button", { name: "Play" });
    expect(play.tagName).toBe("BUTTON");
    play.focus();
    await user.keyboard(" ");
    expect(controlled.controller.play).toHaveBeenCalledTimes(1);

    const slider = screen.getByRole("slider", { name: "Animation position" });
    expect(slider).toHaveAttribute("aria-valuetext", "0:00 of 0:04");
    fireEvent.change(slider, { target: { value: "2.5" } });
    expect(controlled.controller.seek).toHaveBeenCalledWith(2.5);

    act(() => controlled.setState({
      status: "playing",
      request: REQUEST,
      positionSeconds: 2.5,
      durationSeconds: 4,
      offlineFallback: "none"
    }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(controlled.controller.pause).toHaveBeenCalledTimes(1);

    act(() => controlled.setState({
      status: "paused",
      request: REQUEST,
      positionSeconds: 4,
      durationSeconds: 4,
      offlineFallback: "none"
    }));
    await user.click(screen.getByRole("button", { name: "Replay" }));
    expect(controlled.controller.seek).toHaveBeenLastCalledWith(0);
    expect(controlled.controller.play).toHaveBeenCalledTimes(2);

    act(() => controlled.setState({
      status: "failed",
      request: REQUEST,
      error: { code: "missing_asset" },
      recoverable: true,
      offlineFallback: "text"
    }));
    await user.click(screen.getByRole("button", { name: "Retry animation" }));
    expect(controlled.controller.retry).toHaveBeenCalledTimes(1);
  });

  it("renders loading, ready, playing, paused, ended, and reduced-motion status without live frame announcements", () => {
    installMatchMedia();
    const controlled = controlledController({ status: "loading", request: REQUEST, offlineFallback: "none" });
    renderPlayer(controlled);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading offline animation");
    expect(status).not.toHaveTextContent("0:00");

    const states: Array<[AnimationPlayerState, string]> = [
      [{ status: "ready", request: REQUEST, durationSeconds: 4, offlineFallback: "none" }, "Animation ready"],
      [{ status: "playing", request: REQUEST, positionSeconds: 1, durationSeconds: 4, offlineFallback: "none" }, "Animation playing"],
      [{ status: "paused", request: REQUEST, positionSeconds: 1, durationSeconds: 4, offlineFallback: "none" }, "Animation paused"],
      [{ status: "paused", request: REQUEST, positionSeconds: 4, durationSeconds: 4, offlineFallback: "none" }, "Animation complete"],
      [{ status: "ready", request: { ...REQUEST, reducedMotion: true }, durationSeconds: 4, offlineFallback: "text" }, "Static-reference mode"]
    ];
    for (const [state, label] of states) {
      act(() => controlled.setState(state));
      expect(status).toHaveTextContent(label);
      expect(screen.getByText(FALLBACK.en)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Animation position" })).toBeDisabled();
  });

  it("sanitizes recoverable and terminal failures and never exposes arbitrary exception text", () => {
    installMatchMedia();
    const controlled = controlledController({
      status: "failed",
      request: REQUEST,
      error: { code: "missing_asset", message: "C:\\Users\\private\\animation.glb?token=secret" },
      recoverable: true,
      offlineFallback: "text"
    });
    renderPlayer(controlled);

    expect(screen.getByRole("status")).toHaveTextContent("Animation unavailable. You can retry.");
    expect(screen.queryByText(/private|token=secret/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry animation" })).toBeEnabled();
    expect(screen.getByText(FALLBACK.en).parentElement).toHaveClass("exercise-animation__fallback--emphasized");

    act(() => controlled.setState({
      status: "failed",
      request: REQUEST,
      error: { code: "incompatible_player_protocol", message: "internal renderer detail" },
      recoverable: false,
      offlineFallback: "text"
    }));
    expect(screen.getByRole("status")).toHaveTextContent("Animation is unavailable.");
    expect(screen.getByRole("button", { name: "Retry animation" })).toBeDisabled();
    expect(screen.queryByText(/internal renderer detail/i)).not.toBeInTheDocument();
  });

  it("renders Vietnamese visible and accessible text while retaining a bilingual group name", () => {
    installMatchMedia();
    const controlled = controlledController({
      status: "paused",
      request: REQUEST,
      positionSeconds: 1,
      durationSeconds: 4,
      offlineFallback: "none"
    });
    renderPlayer(controlled, "vi");

    expect(screen.getByRole("group", { name: /hoạt ảnh bài tập \/ exercise animation/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Khung hoạt ảnh cho Ngồi xổm với đòn tạ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phát" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Vị trí hoạt ảnh" })).toHaveAttribute("aria-valuetext", "0:01 trên 0:04");
    expect(screen.getByText("Hướng dẫn bằng chữ")).toBeVisible();
    expect(screen.getByText(FALLBACK.vi)).toBeVisible();
  });

  it("strengthens motion preference only when the OS value changes effectively", async () => {
    const media = installMatchMedia(false);
    const controlled = controlledController();
    renderPlayer(controlled);
    await waitFor(() => expect(controlled.controller.load).toHaveBeenCalledTimes(1));
    expect(controlled.controller.load).toHaveBeenLastCalledWith({ ...REQUEST, reducedMotion: false });

    act(() => media.setMatches(true));
    await waitFor(() => expect(controlled.controller.load).toHaveBeenCalledTimes(2));
    expect(controlled.controller.load).toHaveBeenLastCalledWith({ ...REQUEST, reducedMotion: true });
    act(() => media.setMatches(true));
    expect(controlled.controller.load).toHaveBeenCalledTimes(2);
    act(() => media.setMatches(false));
    await waitFor(() => expect(controlled.controller.load).toHaveBeenCalledTimes(3));
    expect(controlled.controller.load).toHaveBeenLastCalledWith({ ...REQUEST, reducedMotion: false });
    expect(media.query.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("never weakens an explicit reduced-motion request when the OS preference turns off", async () => {
    const media = installMatchMedia(true);
    const controlled = controlledController();
    renderPlayer(controlled, "en", { ...REQUEST, reducedMotion: true });
    await waitFor(() => expect(controlled.controller.load).toHaveBeenCalledTimes(1));
    expect(controlled.controller.load).toHaveBeenLastCalledWith({ ...REQUEST, reducedMotion: true });

    act(() => media.setMatches(false));
    expect(controlled.controller.load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Ready to load animation");
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("preserves focus across external state changes and installs no global keyboard handler", () => {
    installMatchMedia();
    const controlled = controlledController();
    renderPlayer(controlled);
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();

    act(() => controlled.setState({
      status: "ready",
      request: REQUEST,
      durationSeconds: 4,
      offlineFallback: "none"
    }));
    expect(document.activeElement).toBe(outside);
    expect(componentSource).not.toMatch(/addEventListener\(["']key/);
    expect(componentSource).not.toMatch(/onKeyDown|onKeyUp/);
    outside.remove();
  });

  it("keeps responsive, touch, focus, overflow, and reduced-motion rules source-verifiable", () => {
    expect(animationCss).toMatch(/\.exercise-animation\s*\{[^}]*width:\s*100%/s);
    expect(animationCss).toMatch(/\.exercise-animation\s*\{[^}]*min-width:\s*0/s);
    expect(animationCss).toMatch(/\.exercise-animation\s*\{[^}]*overflow:\s*hidden/s);
    expect(animationCss).toMatch(/\.exercise-animation__controls\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(animationCss).toMatch(/min-width:\s*44px/);
    expect(animationCss).toMatch(/min-height:\s*44px/);
    expect(animationCss).toMatch(/:focus-visible/);
    expect(animationCss).toMatch(/@media \(max-width:\s*390px\)/);
    expect(animationCss).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
    expect(animationCss).toMatch(/animation:\s*none\s*!important/);
    expect(animationCss).not.toMatch(/^\s*(?:min-)?width:\s*(?:32[1-9]|3[3-9]\d|[4-9]\d\d|\d{4,})px/gm);
    expect(componentSource).not.toMatch(/style=\{\{[^}]*width/);
  });
});
