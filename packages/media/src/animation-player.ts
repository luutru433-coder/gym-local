/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import {
  parseAnimationAssetDescriptor,
  parseAnimationPackEntry,
  parseAnimationPackError,
  parseAnimationPlayerRequest,
  parseAnimationPlayerState,
  type AnimationAssetDescriptor,
  type AnimationPackEntry,
  type AnimationPackError,
  type AnimationPackErrorCode,
  type AnimationPlayerRequest,
  type AnimationPlayerState
} from "@gym/contracts";

export interface AnimationPlayerSource {
  entry: AnimationPackEntry;
  asset: AnimationAssetDescriptor;
  blob: Blob;
}

export interface AnimationPlayerAssetLoader {
  load(request: Readonly<AnimationPlayerRequest>, signal: AbortSignal): Promise<AnimationPlayerSource>;
}

export interface AnimationPlayerRendererEvents {
  frame(positionSeconds: number): void;
  ended(): void;
  failed(error?: unknown): void;
}

export interface AnimationPlayerRendererMount {
  viewport: HTMLElement;
  blob: Blob;
  entry: AnimationPackEntry;
  asset: AnimationAssetDescriptor;
  request: Readonly<AnimationPlayerRequest>;
  events: AnimationPlayerRendererEvents;
}

export interface AnimationPlayerRendererSession {
  play(): void;
  pause(): void;
  seek(positionSeconds: number): void;
  dispose(): void;
}

export interface AnimationPlayerRenderer {
  mount(input: AnimationPlayerRendererMount): Promise<AnimationPlayerRendererSession>;
}

export interface AnimationPlayerController {
  getSnapshot(): Readonly<AnimationPlayerState>;
  subscribe(listener: () => void): () => void;
  attach(viewport: HTMLElement): void;
  detach(): void;
  load(request: unknown): void;
  play(): void;
  pause(): void;
  seek(positionSeconds: number): void;
  retry(): void;
  dispose(): void;
}

export interface AnimationPlayerControllerOptions {
  loader: AnimationPlayerAssetLoader;
  renderer: AnimationPlayerRenderer;
}

interface ActiveSession {
  generation: number;
  session: AnimationPlayerRendererSession;
  request: Readonly<AnimationPlayerRequest>;
  durationSeconds: number;
  lastRendererPosition: number;
  positionEventsEnabled: boolean;
}

const NON_RECOVERABLE_LOAD_ERRORS = new Set<AnimationPackErrorCode>([
  "incompatible_schema",
  "incompatible_player_protocol",
  "incompatible_animation_catalog",
  "incompatible_minimum_app",
  "descriptor_manifest_identity_mismatch",
  "corrupt_archive",
  "missing_source",
  "missing_license"
]);

function freezeRequest(request: AnimationPlayerRequest): Readonly<AnimationPlayerRequest> {
  return Object.freeze({ ...request });
}

function freezeError(error: AnimationPackError): Readonly<AnimationPackError> {
  return Object.freeze(error.message === undefined ? { code: error.code } : { code: error.code, message: error.message });
}

function freezeState(state: AnimationPlayerState): Readonly<AnimationPlayerState> {
  if (state.status === "idle") return Object.freeze({ ...state });
  if (state.status === "failed") {
    const error = freezeError(state.error);
    return Object.freeze(state.request === undefined
      ? { ...state, error }
      : { ...state, request: freezeRequest(state.request), error });
  }
  return Object.freeze({ ...state, request: freezeRequest(state.request) });
}

function exactRequest(left: Readonly<AnimationPlayerRequest>, right: Readonly<AnimationPlayerRequest>): boolean {
  return left.exerciseVariantId === right.exerciseVariantId
    && left.animationId === right.animationId
    && left.playbackSpeed === right.playbackSpeed
    && left.cameraPreset === right.cameraPreset
    && left.mirrorMode === right.mirrorMode
    && left.reducedMotion === right.reducedMotion;
}

function isRendererSession(value: unknown): value is AnimationPlayerRendererSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Partial<AnimationPlayerRendererSession>;
  return typeof session.play === "function"
    && typeof session.pause === "function"
    && typeof session.seek === "function"
    && typeof session.dispose === "function";
}

function publicPackError(value: unknown): AnimationPackError | undefined {
  const direct = parseAnimationPackError(value);
  if (direct.success) return direct.data;
  if (typeof value !== "object" || value === null) return undefined;

  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  const nested = parseAnimationPackError(candidate.error);
  if (nested.success) return nested.data;

  const projected = parseAnimationPackError(
    candidate.message === undefined
      ? { code: candidate.code }
      : { code: candidate.code, message: candidate.message }
  );
  return projected.success ? projected.data : undefined;
}

type SourceValidation =
  | { success: true; source: AnimationPlayerSource }
  | { success: false; error: AnimationPackError };

function validateSource(source: unknown, request: Readonly<AnimationPlayerRequest>): SourceValidation {
  if (typeof source !== "object" || source === null) return { success: false, error: { code: "missing_asset" } };
  const candidate = source as { entry?: unknown; asset?: unknown; blob?: unknown };
  const entryResult = parseAnimationPackEntry(candidate.entry);
  const assetResult = parseAnimationAssetDescriptor(candidate.asset);
  if (!entryResult.success || !assetResult.success || !(candidate.blob instanceof Blob)) {
    return { success: false, error: { code: "missing_asset" } };
  }

  const entry = entryResult.data;
  const asset = assetResult.data;
  if (entry.exerciseVariantId !== request.exerciseVariantId) return { success: false, error: { code: "missing_variant" } };
  if (entry.animationId !== request.animationId) return { success: false, error: { code: "missing_asset" } };
  if (entry.assetId !== asset.id || entry.assetPath !== asset.path) return { success: false, error: { code: "missing_asset" } };
  if (entry.durationSeconds !== asset.durationSeconds) return { success: false, error: { code: "missing_asset" } };
  if (entry.sourceId !== asset.sourceId || entry.licenseId !== asset.licenseId) return { success: false, error: { code: "missing_asset" } };
  if (candidate.blob.size !== asset.byteSize) return { success: false, error: { code: "missing_asset" } };
  if (candidate.blob.type !== "" && candidate.blob.type !== asset.mediaType) {
    return { success: false, error: { code: "missing_asset" } };
  }
  return { success: true, source: { entry, asset, blob: candidate.blob } };
}

export function createAnimationPlayerController({ loader, renderer }: AnimationPlayerControllerOptions): AnimationPlayerController {
  const listeners = new Set<() => void>();
  const disposedSessions = new WeakSet<AnimationPlayerRendererSession>();
  let state: Readonly<AnimationPlayerState> = freezeState({ status: "idle", offlineFallback: "none" });
  let viewport: HTMLElement | undefined;
  let generation = 0;
  let abortController: AbortController | undefined;
  let activeSession: ActiveSession | undefined;
  let lastRequest: Readonly<AnimationPlayerRequest> | undefined;
  let disposed = false;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const publish = (candidate: unknown) => {
    const parsed = parseAnimationPlayerState(candidate);
    state = parsed.success
      ? freezeState(parsed.data)
      : freezeState({
          status: "failed",
          error: { code: "activation_failed" },
          recoverable: false,
          offlineFallback: "text"
        });
    notify();
  };

  const disposeSession = (session: AnimationPlayerRendererSession) => {
    if (disposedSessions.has(session)) return;
    disposedSessions.add(session);
    try {
      session.dispose();
    } catch {
      // Disposal is terminal for this session. Its exception cannot be exposed or retried.
    }
  };

  const cancelObsoleteWork = () => {
    generation += 1;
    abortController?.abort();
    abortController = undefined;
    if (activeSession !== undefined) disposeSession(activeSession.session);
    activeSession = undefined;
  };

  const fail = (
    error: AnimationPackError,
    request: Readonly<AnimationPlayerRequest> | undefined,
    recoverable: boolean
  ) => {
    publish(request === undefined
      ? { status: "failed", error, recoverable, offlineFallback: "text" }
      : { status: "failed", request, error, recoverable, offlineFallback: "text" });
  };

  const isCurrent = (token: number, expectedViewport: HTMLElement): boolean => (
    !disposed && generation === token && viewport === expectedViewport
  );

  const currentSession = (session: ActiveSession): boolean => (
    !disposed && activeSession === session && generation === session.generation
  );

  const failRenderer = (session: ActiveSession) => {
    if (!currentSession(session)) return;
    generation += 1;
    activeSession = undefined;
    disposeSession(session.session);
    fail({ code: "activation_failed" }, session.request, true);
  };

  const failPendingRenderer = (
    token: number,
    expectedViewport: HTMLElement,
    request: Readonly<AnimationPlayerRequest>
  ) => {
    if (!isCurrent(token, expectedViewport)) return;
    generation += 1;
    abortController?.abort();
    abortController = undefined;
    fail({ code: "activation_failed" }, request, true);
  };

  const startLoad = async (
    request: Readonly<AnimationPlayerRequest>,
    token: number,
    expectedViewport: HTMLElement,
    signal: AbortSignal
  ) => {
    let source: AnimationPlayerSource;
    try {
      source = await loader.load(request, signal);
    } catch (error) {
      if (!isCurrent(token, expectedViewport) || signal.aborted) return;
      abortController = undefined;
      const packError = publicPackError(error) ?? { code: "missing_asset" as const };
      fail(packError, request, !NON_RECOVERABLE_LOAD_ERRORS.has(packError.code));
      return;
    }

    if (!isCurrent(token, expectedViewport) || signal.aborted) return;
    const sourceValidation = validateSource(source, request);
    if (!sourceValidation.success) {
      abortController = undefined;
      fail(sourceValidation.error, request, true);
      return;
    }

    const exactSource = sourceValidation.source;
    let mountedSession: AnimationPlayerRendererSession;
    const events: AnimationPlayerRendererEvents = {
      frame(positionSeconds) {
        const session = activeSession;
        if (session === undefined || session.generation !== token || !currentSession(session)) return;
        if (!session.positionEventsEnabled) return;
        if (state.status !== "playing" && state.status !== "paused") return;
        if (!Number.isFinite(positionSeconds)) return;
        const position = Math.min(session.durationSeconds, Math.max(0, positionSeconds));
        if (position < session.lastRendererPosition) return;
        session.lastRendererPosition = position;
        publish({
          status: state.status,
          request: session.request,
          positionSeconds: position,
          durationSeconds: session.durationSeconds,
          offlineFallback: session.request.reducedMotion ? "text" : "none"
        });
      },
      ended() {
        const session = activeSession;
        if (session === undefined || session.generation !== token || !currentSession(session)) return;
        if (!session.positionEventsEnabled) return;
        if (state.status !== "playing" && state.status !== "paused") return;
        session.lastRendererPosition = session.durationSeconds;
        publish({
          status: "paused",
          request: session.request,
          positionSeconds: session.durationSeconds,
          durationSeconds: session.durationSeconds,
          offlineFallback: session.request.reducedMotion ? "text" : "none"
        });
      },
      failed() {
        const session = activeSession;
        if (session !== undefined && session.generation === token) {
          failRenderer(session);
          return;
        }
        failPendingRenderer(token, expectedViewport, request);
      }
    };

    try {
      mountedSession = await renderer.mount({
        viewport: expectedViewport,
        blob: exactSource.blob,
        entry: exactSource.entry,
        asset: exactSource.asset,
        request,
        events
      });
    } catch {
      if (!isCurrent(token, expectedViewport) || signal.aborted) return;
      failPendingRenderer(token, expectedViewport, request);
      return;
    }

    if (!isRendererSession(mountedSession)) {
      failPendingRenderer(token, expectedViewport, request);
      return;
    }
    if (!isCurrent(token, expectedViewport) || signal.aborted) {
      disposeSession(mountedSession);
      return;
    }

    abortController = undefined;
    activeSession = {
      generation: token,
      session: mountedSession,
      request,
      durationSeconds: exactSource.entry.durationSeconds,
      lastRendererPosition: 0,
      positionEventsEnabled: true
    };
    publish({
      status: "ready",
      request,
      durationSeconds: exactSource.entry.durationSeconds,
      offlineFallback: request.reducedMotion ? "text" : "none"
    });
  };

  const controller: AnimationPlayerController = {
    getSnapshot() {
      return state;
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attach(nextViewport) {
      if (disposed || viewport === nextViewport) return;
      if (viewport !== undefined || state.status !== "idle") {
        cancelObsoleteWork();
        publish({ status: "idle", offlineFallback: "none" });
      }
      viewport = nextViewport;
    },
    detach() {
      if (disposed) return;
      viewport = undefined;
      cancelObsoleteWork();
      publish({ status: "idle", offlineFallback: "none" });
    },
    load(input) {
      if (disposed) return;
      const parsed = parseAnimationPlayerRequest(input);
      if (!parsed.success) {
        cancelObsoleteWork();
        lastRequest = undefined;
        fail({ code: "activation_failed" }, undefined, false);
        return;
      }

      const request = freezeRequest(parsed.data);
      lastRequest = request;
      cancelObsoleteWork();
      if (viewport === undefined) {
        fail({ code: "activation_failed" }, request, false);
        return;
      }

      const expectedViewport = viewport;
      const token = generation;
      abortController = new AbortController();
      publish({
        status: "loading",
        request,
        offlineFallback: request.reducedMotion ? "text" : "none"
      });
      void startLoad(request, token, expectedViewport, abortController.signal);
    },
    play() {
      if (state.status !== "ready" && state.status !== "paused") return;
      const session = activeSession;
      if (session === undefined || !currentSession(session) || session.request.reducedMotion) return;
      const position = state.status === "ready" ? 0 : state.positionSeconds;
      session.positionEventsEnabled = false;
      try {
        session.session.play();
      } catch {
        session.positionEventsEnabled = true;
        failRenderer(session);
        return;
      }
      session.positionEventsEnabled = true;
      if (!currentSession(session)) return;
      session.lastRendererPosition = position;
      publish({
        status: "playing",
        request: session.request,
        positionSeconds: position,
        durationSeconds: session.durationSeconds,
        offlineFallback: "none"
      });
    },
    pause() {
      if (state.status !== "playing") return;
      const session = activeSession;
      if (session === undefined || !currentSession(session)) return;
      const position = state.positionSeconds;
      session.positionEventsEnabled = false;
      try {
        session.session.pause();
      } catch {
        session.positionEventsEnabled = true;
        failRenderer(session);
        return;
      }
      session.positionEventsEnabled = true;
      if (!currentSession(session)) return;
      publish({
        status: "paused",
        request: session.request,
        positionSeconds: position,
        durationSeconds: session.durationSeconds,
        offlineFallback: session.request.reducedMotion ? "text" : "none"
      });
    },
    seek(positionSeconds) {
      if (state.status !== "ready" && state.status !== "playing" && state.status !== "paused") return;
      if (!Number.isFinite(positionSeconds)) return;
      const session = activeSession;
      if (session === undefined || !currentSession(session)) return;
      const position = Math.min(session.durationSeconds, Math.max(0, positionSeconds));
      const nextStatus = state.status === "playing" ? "playing" : "paused";
      session.positionEventsEnabled = false;
      try {
        session.session.seek(position);
      } catch {
        session.positionEventsEnabled = true;
        failRenderer(session);
        return;
      }
      session.positionEventsEnabled = true;
      if (!currentSession(session)) return;
      session.lastRendererPosition = position;
      publish({
        status: nextStatus,
        request: session.request,
        positionSeconds: position,
        durationSeconds: session.durationSeconds,
        offlineFallback: session.request.reducedMotion ? "text" : "none"
      });
    },
    retry() {
      if (state.status !== "failed" || !state.recoverable || state.request === undefined || lastRequest === undefined) return;
      if (!exactRequest(state.request, lastRequest)) return;
      controller.load(lastRequest);
    },
    dispose() {
      if (disposed) return;
      cancelObsoleteWork();
      viewport = undefined;
      lastRequest = undefined;
      disposed = true;
      publish({ status: "idle", offlineFallback: "none" });
      listeners.clear();
    }
  };

  return controller;
}
