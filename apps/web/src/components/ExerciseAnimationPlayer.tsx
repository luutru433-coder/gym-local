/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { useEffect, useId, useMemo, useRef, useSyncExternalStore, type ChangeEvent } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { AnimationPlayerRequest, AnimationPlayerState } from "@gym/contracts";
import type { AnimationPlayerController } from "@gym/media";
import "./ExerciseAnimationPlayer.css";

export interface ExerciseAnimationPlayerText {
  vi: string;
  en: string;
}

export interface ExerciseAnimationPlayerProps {
  controller: AnimationPlayerController;
  request: AnimationPlayerRequest;
  locale: "vi" | "en";
  exerciseName: ExerciseAnimationPlayerText;
  writtenFallback: ExerciseAnimationPlayerText;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function localized(text: ExerciseAnimationPlayerText, locale: "vi" | "en"): string {
  return text[locale];
}

function subscribeReducedMotion(listener: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function reducedMotionSnapshot(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

function useReducedMotionPreference(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
}

function durationFor(state: Readonly<AnimationPlayerState>): number {
  return state.status === "ready" || state.status === "playing" || state.status === "paused"
    ? state.durationSeconds
    : 0;
}

function positionFor(state: Readonly<AnimationPlayerState>): number {
  return state.status === "playing" || state.status === "paused" ? state.positionSeconds : 0;
}

function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function statusText(
  state: Readonly<AnimationPlayerState>,
  locale: "vi" | "en",
  staticReference: boolean
): string {
  if (state.status === "idle") return locale === "vi" ? "Sẵn sàng tải hoạt ảnh" : "Ready to load animation";
  if (state.status === "loading") {
    if (staticReference) return locale === "vi" ? "Đang chuẩn bị ảnh tham chiếu tĩnh" : "Preparing a static reference";
    return locale === "vi" ? "Đang tải hoạt ảnh offline" : "Loading offline animation";
  }
  if (state.status === "failed") {
    return state.recoverable
      ? (locale === "vi" ? "Không mở được hoạt ảnh. Bạn có thể thử lại." : "Animation unavailable. You can retry.")
      : (locale === "vi" ? "Hoạt ảnh không khả dụng." : "Animation is unavailable.");
  }
  if (staticReference) return locale === "vi" ? "Chế độ tham chiếu tĩnh" : "Static-reference mode";
  if (state.status === "ready") return locale === "vi" ? "Hoạt ảnh đã sẵn sàng" : "Animation ready";
  if (state.status === "playing") return locale === "vi" ? "Đang phát hoạt ảnh" : "Animation playing";
  if (state.positionSeconds >= state.durationSeconds) return locale === "vi" ? "Hoạt ảnh đã hoàn tất" : "Animation complete";
  return locale === "vi" ? "Hoạt ảnh đang tạm dừng" : "Animation paused";
}

export function ExerciseAnimationPlayer({
  controller,
  request,
  locale,
  exerciseName,
  writtenFallback
}: ExerciseAnimationPlayerProps) {
  const rangeId = useId();
  const fallbackId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const osReducedMotion = useReducedMotionPreference();
  const effectiveReducedMotion = request.reducedMotion || osReducedMotion;
  const effectiveRequest = useMemo<AnimationPlayerRequest>(() => ({
    exerciseVariantId: request.exerciseVariantId,
    animationId: request.animationId,
    playbackSpeed: request.playbackSpeed,
    cameraPreset: request.cameraPreset,
    mirrorMode: request.mirrorMode,
    reducedMotion: effectiveReducedMotion
  }), [
    request.exerciseVariantId,
    request.animationId,
    request.playbackSpeed,
    request.cameraPreset,
    request.mirrorMode,
    effectiveReducedMotion
  ]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return undefined;
    controller.attach(viewport);
    return () => controller.detach();
  }, [controller]);

  useEffect(() => {
    controller.load(effectiveRequest);
  }, [controller, effectiveRequest]);

  const duration = durationFor(state);
  const position = positionFor(state);
  const ended = state.status === "paused" && position >= duration;
  const staticReference = effectiveReducedMotion
    || (state.status !== "idle" && state.status !== "failed" && state.request.reducedMotion)
    || (state.status === "failed" && state.request?.reducedMotion === true);
  const canSeek = !staticReference && (state.status === "ready" || state.status === "playing" || state.status === "paused");
  const primaryAction = state.status === "playing" ? "pause" : ended ? "replay" : "play";
  const canUsePrimary = state.status === "playing"
    || (!staticReference && (state.status === "ready" || state.status === "paused"));
  const primaryLabel = primaryAction === "pause"
    ? (locale === "vi" ? "Tạm dừng" : "Pause")
    : primaryAction === "replay"
      ? (locale === "vi" ? "Phát lại" : "Replay")
      : (locale === "vi" ? "Phát" : "Play");
  const groupLabel = `${exerciseName.vi} — hoạt ảnh bài tập / exercise animation — ${exerciseName.en}`;
  const viewportLabel = locale === "vi"
    ? `Khung hoạt ảnh cho ${exerciseName.vi}`
    : `Animation viewport for ${exerciseName.en}`;
  const formattedPosition = formatTime(position);
  const formattedDuration = formatTime(duration);
  const rangeValueText = locale === "vi"
    ? `${formattedPosition} trên ${formattedDuration}`
    : `${formattedPosition} of ${formattedDuration}`;

  const handlePrimary = () => {
    if (primaryAction === "pause") {
      controller.pause();
      return;
    }
    if (primaryAction === "replay") controller.seek(0);
    controller.play();
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    controller.seek(Number(event.currentTarget.value));
  };

  return (
    <figure className={`exercise-animation${staticReference ? " exercise-animation--static" : ""}`} role="group" aria-label={groupLabel}>
      <div
        ref={viewportRef}
        className="exercise-animation__viewport"
        role="img"
        aria-label={viewportLabel}
        aria-describedby={fallbackId}
      />

      <div className="exercise-animation__status" role="status" aria-live="polite" aria-atomic="true">
        {statusText(state, locale, staticReference)}
      </div>

      <div className="exercise-animation__controls">
        <button
          type="button"
          className="exercise-animation__button"
          onClick={handlePrimary}
          disabled={!canUsePrimary}
          aria-label={primaryLabel}
          title={staticReference
            ? (locale === "vi" ? "Chuyển động đã tắt theo tùy chọn giảm chuyển động" : "Motion is disabled by the reduced-motion preference")
            : primaryLabel}
        >
          {primaryAction === "pause" ? <Pause aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />}
          <span>{primaryLabel}</span>
        </button>

        <div className="exercise-animation__seek">
          <label htmlFor={rangeId}>{locale === "vi" ? "Vị trí hoạt ảnh" : "Animation position"}</label>
          <input
            id={rangeId}
            type="range"
            min="0"
            max={duration > 0 ? duration : 1}
            step="0.01"
            value={position}
            disabled={!canSeek}
            onChange={handleSeek}
            aria-valuetext={rangeValueText}
            aria-describedby={`${rangeId}-time`}
          />
          <span id={`${rangeId}-time`} className="exercise-animation__time">{rangeValueText}</span>
        </div>

        {state.status === "failed" ? (
          <button
            type="button"
            className="exercise-animation__button"
            onClick={() => controller.retry()}
            disabled={!state.recoverable}
            aria-label={locale === "vi" ? "Thử tải lại hoạt ảnh" : "Retry animation"}
            title={locale === "vi" ? "Thử lại" : "Retry"}
          >
            <RotateCcw aria-hidden="true" size={18} />
            <span>{locale === "vi" ? "Thử lại" : "Retry"}</span>
          </button>
        ) : null}
      </div>

      <div
        id={fallbackId}
        className={`exercise-animation__fallback${state.status === "failed" || staticReference ? " exercise-animation__fallback--emphasized" : ""}`}
      >
        <strong>{locale === "vi" ? "Hướng dẫn bằng chữ" : "Written guidance"}</strong>
        <p>{localized(writtenFallback, locale)}</p>
      </div>

      <figcaption className="exercise-animation__metadata">
        <span>{localized(exerciseName, locale)}</span>
        <small>{locale === "vi" ? "Hoạt ảnh đã cài đặt dùng được offline" : "Installed animation works offline"}</small>
      </figcaption>
    </figure>
  );
}
