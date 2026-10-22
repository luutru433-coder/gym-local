/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it, vi } from "vitest";
import {
  parseAnimationPlayerState,
  type AnimationAssetDescriptor,
  type AnimationPackEntry,
  type AnimationPackError,
  type AnimationPlayerRequest,
  type AnimationPlayerState
} from "@gym/contracts";
import {
  createAnimationPlayerController,
  type AnimationPlayerAssetLoader,
  type AnimationPlayerController,
  type AnimationPlayerReleaseSource,
  type AnimationPlayerSource
} from "./animation-player";
import { createTestAnimationRenderer, type TestAnimationRenderer } from "./animation-player.test-renderer";

const REQUEST: AnimationPlayerRequest = {
  exerciseVariantId: "squat__barbell",
  animationId: "animation.squat-barbell",
  playbackSpeed: 1.25,
  cameraPreset: "three_quarter",
  mirrorMode: "horizontal",
  reducedMotion: false
};

const ASSET: AnimationAssetDescriptor = {
  id: "asset.squat-barbell",
  path: "assets/squat-barbell.glb",
  mediaType: "model/gltf-binary",
  byteSize: 4,
  sha256: "a".repeat(64),
  compression: "none",
  rigId: "rig.humanoid-v1",
  sourceId: "source.squat",
  licenseId: "license.cc-by-4.0",
  durationSeconds: 4
};

const ENTRY: AnimationPackEntry = {
  animationId: REQUEST.animationId,
  exerciseVariantId: REQUEST.exerciseVariantId,
  animationCatalogVersion: 1,
  primary: true,
  assetId: ASSET.id,
  assetPath: ASSET.path,
  clipName: "Squat",
  durationSeconds: ASSET.durationSeconds,
  loop: { startSeconds: 0.5, endSeconds: 3.5 },
  defaultCamera: {
    preset: "three_quarter",
    position: [2, 1.5, 3],
    target: [0, 1, 0],
    fovDegrees: 45
  },
  equipmentProps: ["barbell", "rack"],
  accessibilityFallbackKey: "exercise.squat-barbell.instructions",
  sourceId: ASSET.sourceId,
  licenseId: ASSET.licenseId
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

interface LoaderCall {
  request: Readonly<AnimationPlayerRequest>;
  signal: AbortSignal;
  deferred: Deferred<AnimationPlayerSource>;
}

interface TestLoader {
  loader: AnimationPlayerAssetLoader;
  calls: LoaderCall[];
  resolve(source?: AnimationPlayerSource, index?: number): void;
  reject(error: unknown, index?: number): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function sourceFor(request: AnimationPlayerRequest = REQUEST): AnimationPlayerReleaseSource {
  const asset = structuredClone(ASSET);
  const entry = structuredClone(ENTRY);
  entry.exerciseVariantId = request.exerciseVariantId;
  entry.animationId = request.animationId;
  return {
    entry,
    asset,
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: asset.mediaType })
  };
}

function createTestLoader(): TestLoader {
  const calls: LoaderCall[] = [];
  return {
    calls,
    loader: {
      load(request, signal) {
        const pending = deferred<AnimationPlayerSource>();
        calls.push({ request, signal, deferred: pending });
        return pending.promise;
      }
    },
    resolve(source = sourceFor(), index = 0) {
      const call = calls[index];
      if (call === undefined) throw new Error(`No loader call at index ${index}.`);
      call.deferred.resolve(source);
    },
    reject(error, index = 0) {
      const call = calls[index];
      if (call === undefined) throw new Error(`No loader call at index ${index}.`);
      call.deferred.reject(error);
    }
  };
}

function createHarness() {
  const loader = createTestLoader();
  const testRenderer = createTestAnimationRenderer();
  const controller = createAnimationPlayerController({ loader: loader.loader, renderer: testRenderer.renderer });
  return { controller, loader, testRenderer };
}

async function makeReady(
  controller: AnimationPlayerController,
  loader: TestLoader,
  renderer: TestAnimationRenderer,
  request: AnimationPlayerRequest = REQUEST
): Promise<void> {
  controller.attach(document.createElement("div"));
  controller.load(request);
  loader.resolve(sourceFor(request));
  await vi.waitFor(() => expect(renderer.mountCount()).toBe(1));
  renderer.resolveMount();
  await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("ready"));
}

function expectFailed(controller: AnimationPlayerController, error: AnimationPackError, recoverable?: boolean): void {
  const state = controller.getSnapshot();
  expect(state.status).toBe("failed");
  if (state.status !== "failed") return;
  expect(state.error).toEqual(error);
  expect(state.offlineFallback).toBe("text");
  if (recoverable !== undefined) expect(state.recoverable).toBe(recoverable);
  expect(parseAnimationPlayerState(state).success).toBe(true);
}

describe("animation player controller", () => {
  it("starts with the exact immutable idle contract and publishes tear-free snapshots", () => {
    const { controller } = createHarness();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    expect(controller.getSnapshot()).toEqual({ status: "idle", offlineFallback: "none" });
    expect(Object.isFrozen(controller.getSnapshot())).toBe(true);
    controller.attach(document.createElement("div"));
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("loads one exact source into ready without autoplay and preserves every request field", async () => {
    const { controller, loader, testRenderer } = createHarness();
    const viewport = document.createElement("div");
    controller.attach(viewport);
    controller.load(REQUEST);

    expect(controller.getSnapshot()).toEqual({ status: "loading", request: REQUEST, offlineFallback: "none" });
    expect(loader.calls).toHaveLength(1);
    expect(loader.calls[0]?.request).toEqual(REQUEST);
    expect(Object.isFrozen(loader.calls[0]?.request)).toBe(true);
    loader.resolve();
    await vi.waitFor(() => expect(testRenderer.mountCount()).toBe(1));

    const mount = testRenderer.mountInput();
    expect(mount.viewport).toBe(viewport);
    expect(mount.blob).toBeInstanceOf(Blob);
    expect(mount.entry).toEqual(ENTRY);
    expect(mount.asset).toEqual(ASSET);
    expect(mount.request).toEqual(REQUEST);
    expect(Object.isFrozen(mount.request)).toBe(true);
    testRenderer.resolveMount();
    await vi.waitFor(() => expect(controller.getSnapshot()).toEqual({
      status: "ready",
      request: REQUEST,
      durationSeconds: 4,
      offlineFallback: "none"
    }));
    expect(testRenderer.sessionCalls().play).toBe(0);
  });

  it("rejects malformed requests and attach omissions synchronously before source loading", () => {
    const malformed = createHarness();
    malformed.controller.attach(document.createElement("div"));
    malformed.controller.load({ ...REQUEST, exerciseVariantId: "Squat__Barbell" });
    expectFailed(malformed.controller, { code: "activation_failed" }, false);
    expect(malformed.loader.calls).toHaveLength(0);
    expect(malformed.testRenderer.mountCount()).toBe(0);

    const unattached = createHarness();
    unattached.controller.load(REQUEST);
    expectFailed(unattached.controller, { code: "activation_failed" }, false);
    expect(unattached.loader.calls).toHaveLength(0);
  });

  it.each([
    ["variant", (source: AnimationPlayerReleaseSource) => { source.entry.exerciseVariantId = "squat__smith"; }, "missing_variant"],
    ["animation", (source: AnimationPlayerReleaseSource) => { source.entry.animationId = "animation.squat-smith"; }, "missing_asset"],
    ["asset ID", (source: AnimationPlayerReleaseSource) => { source.entry.assetId = "asset.other"; }, "missing_asset"],
    ["asset path", (source: AnimationPlayerReleaseSource) => { source.entry.assetPath = "assets/other.glb"; }, "missing_asset"],
    ["duration", (source: AnimationPlayerReleaseSource) => { source.asset.durationSeconds = 5; }, "missing_asset"],
    ["media type", (source: AnimationPlayerReleaseSource) => { source.asset.mediaType = "model/gltf+json"; }, "missing_asset"],
    ["blob bytes", (source: AnimationPlayerReleaseSource) => { source.asset.byteSize = 5; }, "missing_asset"],
    ["malformed descriptor", (source: AnimationPlayerReleaseSource) => { source.asset.id = "Asset.Invalid"; }, "missing_asset"]
  ] as const)("rejects an exact-source %s mismatch before renderer mount", async (_name, mutate, errorCode) => {
    const { controller, loader, testRenderer } = createHarness();
    controller.attach(document.createElement("div"));
    controller.load(REQUEST);
    const source = sourceFor();
    mutate(source);
    loader.resolve(source);

    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("failed"));
    expectFailed(controller, { code: errorCode }, true);
    expect(testRenderer.mountCount()).toBe(0);
  });

  it("preserves public loader errors, maps unknown loader failures, and retries only the exact recoverable request", async () => {
    const { controller, loader, testRenderer } = createHarness();
    controller.attach(document.createElement("div"));
    controller.load(REQUEST);
    loader.reject({ code: "asset_checksum_mismatch", message: "Verified bytes changed." });
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("failed"));
    expectFailed(controller, { code: "asset_checksum_mismatch", message: "Verified bytes changed." }, true);

    controller.retry();
    expect(loader.calls).toHaveLength(2);
    expect(loader.calls[1]?.request).toEqual(REQUEST);
    loader.resolve(sourceFor(), 1);
    await vi.waitFor(() => expect(testRenderer.mountCount()).toBe(1));
    testRenderer.resolveMount();
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("ready"));

    controller.load(REQUEST);
    loader.reject(new Error("C:\\private\\animation.glb"), 2);
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("failed"));
    expectFailed(controller, { code: "missing_asset" }, true);

    controller.retry();
    loader.reject({ code: "incompatible_player_protocol" }, 3);
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("failed"));
    expectFailed(controller, { code: "incompatible_player_protocol" }, false);
    controller.retry();
    expect(loader.calls).toHaveLength(4);
  });

  it("publishes contract-valid play, pause, seek, frame, ended, and explicit replay states", async () => {
    const { controller, loader, testRenderer } = createHarness();
    const history: Readonly<AnimationPlayerState>[] = [controller.getSnapshot()];
    controller.subscribe(() => history.push(controller.getSnapshot()));
    await makeReady(controller, loader, testRenderer);

    controller.play();
    expect(testRenderer.sessionCalls().play).toBe(1);
    expect(controller.getSnapshot().status).toBe("playing");
    testRenderer.frame(1.5);
    testRenderer.frame(Number.NaN);
    testRenderer.frame(1);
    expect(controller.getSnapshot()).toMatchObject({ status: "playing", positionSeconds: 1.5 });
    controller.pause();
    expect(testRenderer.sessionCalls().pause).toBe(1);
    controller.seek(99);
    expect(testRenderer.sessionCalls().seek).toEqual([4]);
    expect(controller.getSnapshot()).toMatchObject({ status: "paused", positionSeconds: 4 });

    controller.seek(0);
    controller.play();
    testRenderer.frame(2.25);
    testRenderer.frame(99);
    expect(controller.getSnapshot()).toMatchObject({ status: "playing", positionSeconds: 4 });
    testRenderer.ended();
    expect(controller.getSnapshot()).toMatchObject({ status: "paused", positionSeconds: 4, durationSeconds: 4 });
    controller.seek(0);
    controller.play();
    expect(testRenderer.sessionCalls()).toEqual({ play: 3, pause: 1, seek: [4, 0, 0], dispose: 0 });
    expect(controller.getSnapshot()).toMatchObject({ status: "playing", positionSeconds: 0 });

    for (const snapshot of history) expect(parseAnimationPlayerState(snapshot).success).toBe(true);
  });

  it("keeps reduced-motion playback static with text fallback and no renderer play call", async () => {
    const request = { ...REQUEST, reducedMotion: true };
    const { controller, loader, testRenderer } = createHarness();
    await makeReady(controller, loader, testRenderer, request);

    expect(controller.getSnapshot()).toMatchObject({ status: "ready", offlineFallback: "text" });
    controller.play();
    expect(controller.getSnapshot().status).toBe("ready");
    expect(testRenderer.sessionCalls().play).toBe(0);
  });

  it("maps mount, renderer-event, and session-method failures to stable activation errors", async () => {
    const mountFailure = createHarness();
    mountFailure.controller.attach(document.createElement("div"));
    mountFailure.controller.load(REQUEST);
    mountFailure.loader.resolve();
    await vi.waitFor(() => expect(mountFailure.testRenderer.mountCount()).toBe(1));
    mountFailure.testRenderer.rejectMount(new Error("renderer internals"));
    await vi.waitFor(() => expect(mountFailure.controller.getSnapshot().status).toBe("failed"));
    expectFailed(mountFailure.controller, { code: "activation_failed" }, true);

    const pendingEventFailure = createHarness();
    pendingEventFailure.controller.attach(document.createElement("div"));
    pendingEventFailure.controller.load(REQUEST);
    pendingEventFailure.loader.resolve();
    await vi.waitFor(() => expect(pendingEventFailure.testRenderer.mountCount()).toBe(1));
    pendingEventFailure.testRenderer.fail(new Error("failed during mount"));
    expectFailed(pendingEventFailure.controller, { code: "activation_failed" }, true);
    pendingEventFailure.testRenderer.resolveMount();
    await vi.waitFor(() => expect(pendingEventFailure.testRenderer.sessionCalls().dispose).toBe(1));

    const eventFailure = createHarness();
    await makeReady(eventFailure.controller, eventFailure.loader, eventFailure.testRenderer);
    eventFailure.testRenderer.fail(new Error("renderer internals"));
    expectFailed(eventFailure.controller, { code: "activation_failed" }, true);
    expect(eventFailure.testRenderer.sessionCalls().dispose).toBe(1);

    const methodFailure = createHarness();
    await makeReady(methodFailure.controller, methodFailure.loader, methodFailure.testRenderer);
    methodFailure.testRenderer.throwOnNext("play");
    methodFailure.controller.play();
    expectFailed(methodFailure.controller, { code: "activation_failed" }, true);
    expect(methodFailure.testRenderer.sessionCalls()).toMatchObject({ play: 1, dispose: 1 });
  });

  it("generation-gates overlapping source loads without mounting or publishing the stale identity", async () => {
    const { controller, loader, testRenderer } = createHarness();
    const secondRequest: AnimationPlayerRequest = {
      ...REQUEST,
      exerciseVariantId: "squat__smith",
      animationId: "animation.squat-smith"
    };
    controller.attach(document.createElement("div"));
    controller.load(REQUEST);
    controller.load(secondRequest);
    expect(loader.calls[0]?.signal.aborted).toBe(true);

    loader.resolve(sourceFor(REQUEST), 0);
    await Promise.resolve();
    expect(testRenderer.mountCount()).toBe(0);
    loader.resolve(sourceFor(secondRequest), 1);
    await vi.waitFor(() => expect(testRenderer.mountCount()).toBe(1));
    expect(testRenderer.mountInput().request).toEqual(secondRequest);
    testRenderer.resolveMount();
    await vi.waitFor(() => expect(controller.getSnapshot()).toMatchObject({ status: "ready", request: secondRequest }));
  });

  it("disposes stale deferred mounts and ignores every obsolete renderer callback", async () => {
    const { controller, loader, testRenderer } = createHarness();
    const secondRequest: AnimationPlayerRequest = {
      ...REQUEST,
      exerciseVariantId: "deadlift__barbell",
      animationId: "animation.deadlift-barbell"
    };
    controller.attach(document.createElement("div"));
    controller.load(REQUEST);
    loader.resolve(sourceFor(REQUEST), 0);
    await vi.waitFor(() => expect(testRenderer.mountCount()).toBe(1));

    controller.load(secondRequest);
    testRenderer.resolveMount(0);
    loader.resolve(sourceFor(secondRequest), 1);
    await vi.waitFor(() => expect(testRenderer.mountCount()).toBe(2));
    await vi.waitFor(() => expect(testRenderer.sessionCalls(0).dispose).toBe(1));
    testRenderer.resolveMount(1);
    await vi.waitFor(() => expect(controller.getSnapshot()).toMatchObject({ status: "ready", request: secondRequest }));

    testRenderer.frame(3, 0);
    testRenderer.ended(0);
    testRenderer.fail(new Error("stale"), 0);
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", request: secondRequest });
    expect(testRenderer.sessionCalls(0).dispose).toBe(1);
  });

  it("cancels on detach and reattach, then disposes the live session exactly once", async () => {
    const { controller, loader, testRenderer } = createHarness();
    await makeReady(controller, loader, testRenderer);
    const focused = document.createElement("button");
    document.body.append(focused);
    focused.focus();

    controller.detach();
    expect(controller.getSnapshot()).toEqual({ status: "idle", offlineFallback: "none" });
    expect(testRenderer.sessionCalls().dispose).toBe(1);
    testRenderer.frame(2);
    expect(controller.getSnapshot()).toEqual({ status: "idle", offlineFallback: "none" });
    expect(document.activeElement).toBe(focused);

    controller.attach(document.createElement("div"));
    controller.load(REQUEST);
    loader.resolve(sourceFor(), 1);
    await vi.waitFor(() => expect(testRenderer.mountCount()).toBe(2));
    testRenderer.resolveMount(1);
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("ready"));
    controller.dispose();
    controller.dispose();
    expect(controller.getSnapshot()).toEqual({ status: "idle", offlineFallback: "none" });
    expect(testRenderer.sessionCalls(1).dispose).toBe(1);
    testRenderer.frame(3, 1);
    testRenderer.ended(1);
    testRenderer.fail(new Error("disposed"), 1);
    expect(controller.getSnapshot()).toEqual({ status: "idle", offlineFallback: "none" });
    controller.load(REQUEST);
    expect(loader.calls).toHaveLength(2);
    focused.remove();
  });
});
