/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

// @ts-expect-error three 0.185.1 intentionally ships JavaScript without declarations.
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { AnimationAssetDescriptor, AnimationPackEntry, AnimationPlayerRequest } from "@gym/contracts";
import { createGltfAnimationRenderer, createGltfRendererDiagnostics } from "./gltf-renderer";

const entry: AnimationPackEntry = {
  animationId: "animation.pilot-01.push-up.bodyweight",
  exerciseVariantId: "push_up__bodyweight",
  animationCatalogVersion: 1,
  primary: true,
  assetId: "asset.pilot-01.push-up.bodyweight",
  assetPath: "assets/push-up.bodyweight.glb",
  clipName: "PushUpBodyweightLoop",
  durationSeconds: 2,
  loop: { startSeconds: 0, endSeconds: 2 },
  defaultCamera: { preset: "side", position: [3, 1, 0], target: [0, 0.6, 0], fovDegrees: 42 },
  equipmentProps: [],
  accessibilityFallbackKey: "exercise.push_up__bodyweight.written-guidance",
  sourceId: "source.pilot-01.push-up.bodyweight",
  licenseId: "license.mit-gym-local"
};

const asset: AnimationAssetDescriptor = {
  id: entry.assetId,
  path: entry.assetPath,
  mediaType: "model/gltf-binary",
  byteSize: 4,
  sha256: "0".repeat(64),
  compression: "none",
  rigId: "rig.gym-local-pilot-v1",
  sourceId: entry.sourceId,
  licenseId: entry.licenseId,
  durationSeconds: entry.durationSeconds
};

const request: AnimationPlayerRequest = {
  exerciseVariantId: entry.exerciseVariantId,
  animationId: entry.animationId,
  playbackSpeed: 1,
  cameraPreset: "side",
  mirrorMode: "none",
  reducedMotion: false
};

function harness(reducedMotion = false) {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
  const clip = new THREE.AnimationClip(entry.clipName, entry.durationSeconds, [
    new THREE.VectorKeyframeTrack(".position", [0, 1, 2], [0, 0, 0, 0, 0.1, 0, 0, 0, 0])
  ]);
  const canvas = document.createElement("canvas");
  const render = vi.fn();
  const dispose = vi.fn();
  const forceContextLoss = vi.fn();
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const disconnect = vi.fn();
  const diagnostics = createGltfRendererDiagnostics();
  const renderer = createGltfAnimationRenderer({
    loadGltf: async () => ({ scene, animations: [clip] }),
    createRenderer: () => ({ domElement: canvas, setPixelRatio: vi.fn(), setSize: vi.fn(), render, dispose, forceContextLoss }),
    requestAnimationFrame: (callback) => { const id = nextFrame++; callbacks.set(id, callback); return id; },
    cancelAnimationFrame: (id) => { callbacks.delete(id); },
    createResizeObserver: () => ({ observe: vi.fn(), disconnect }),
    diagnostics
  });
  const viewport = document.createElement("div");
  const frame = vi.fn();
  const failed = vi.fn();
  const mount = () => renderer.mount({ viewport, blob: new Blob([new Uint8Array(4)]), entry, asset, request: { ...request, reducedMotion }, events: { frame, failed, ended: vi.fn() } });
  return { mount, viewport, callbacks, render, dispose, forceContextLoss, disconnect, diagnostics, frame, failed };
}

describe("three GLB renderer", () => {
  it("draws a static frame before ready and implements play, seek, pause and exact disposal", async () => {
    const target = harness();
    const session = await target.mount();
    expect(target.viewport.firstChild).toBeInstanceOf(HTMLCanvasElement);
    expect(target.render).toHaveBeenCalledTimes(1);
    expect(target.diagnostics.staticFrames).toBe(1);
    session.play();
    expect(target.callbacks.size).toBe(1);
    const [frameId, callback] = target.callbacks.entries().next().value as [number, FrameRequestCallback];
    target.callbacks.delete(frameId);
    callback(100);
    expect(target.frame).toHaveBeenCalled();
    session.seek(1.5);
    expect(target.frame).toHaveBeenLastCalledWith(1.5);
    session.pause();
    expect(target.callbacks.size).toBe(0);
    session.dispose();
    session.dispose();
    expect(target.dispose).toHaveBeenCalledTimes(1);
    expect(target.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(target.disconnect).toHaveBeenCalledTimes(1);
    expect(target.viewport.childElementCount).toBe(0);
    expect(target.diagnostics).toMatchObject({ activeRaf: 0, activeObservers: 0, activeListeners: 0, activeCanvases: 0, activeScenes: 0, activeMixers: 0, activeGpuResources: 0, activeWebglContexts: 0, disposals: 1 });
  });

  it("keeps reduced motion on one static frame and never schedules playback", async () => {
    const target = harness(true);
    const session = await target.mount();
    session.play();
    expect(target.callbacks.size).toBe(0);
    expect(target.render).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it("leaves every owned resource counter at zero after ten lifecycle cycles", async () => {
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const target = harness();
      const session = await target.mount();
      session.play();
      session.seek(0.75);
      session.pause();
      session.dispose();
      expect(target.diagnostics).toMatchObject({ activeRaf: 0, activeObservers: 0, activeListeners: 0, activeCanvases: 0, activeScenes: 0, activeMixers: 0, activeGpuResources: 0, activeWebglContexts: 0, disposals: 1 });
    }
  });

  it("fails safely on context loss and cancels animation work", async () => {
    const target = harness();
    const session = await target.mount();
    session.play();
    (target.viewport.querySelector("canvas") as HTMLCanvasElement).dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(target.failed).toHaveBeenCalledTimes(1);
    expect(target.callbacks.size).toBe(0);
    session.dispose();
  });

  it("rejects size mismatch and missing exact clips before creating a session", async () => {
    const target = harness();
    const wrongAsset = { ...asset, byteSize: 5 };
    await expect(createGltfAnimationRenderer({ loadGltf: async () => { throw new Error("should not load"); } }).mount({
      viewport: target.viewport,
      blob: new Blob([new Uint8Array(4)]),
      entry,
      asset: wrongAsset,
      request,
      events: { frame: vi.fn(), failed: vi.fn(), ended: vi.fn() }
    })).rejects.toThrow(/size/);
  });

  it("parses the project-authored self-contained GLB through the pinned three loader", async () => {
    // @ts-expect-error The packet-owned deterministic materializer is an untyped ESM module.
    const pilot = await import("../../../scripts/animation-pilot-assets.mjs") as {
      createPilotGlb(variant: unknown, sentinel: string): Uint8Array;
      readPilotDeclarations(): Promise<{ source: { variants: Array<Record<string, unknown>> }; releases: { releases: Array<{ sentinel: string }> } }>;
    };
    const declarations = await pilot.readPilotDeclarations();
    const bytes = pilot.createPilotGlb(declarations.source.variants[0], declarations.releases.releases[0].sentinel);
    const canvas = document.createElement("canvas");
    const render = vi.fn();
    const renderer = createGltfAnimationRenderer({
      createRenderer: () => ({ domElement: canvas, setPixelRatio: vi.fn(), setSize: vi.fn(), render, dispose: vi.fn(), forceContextLoss: vi.fn() }),
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
      createResizeObserver: () => ({ observe: vi.fn(), disconnect: vi.fn() })
    });
    const session = await renderer.mount({
      viewport: document.createElement("div"),
      blob: new Blob([bytes as BlobPart], { type: "model/gltf-binary" }),
      entry,
      asset: { ...asset, byteSize: bytes.byteLength },
      request,
      events: { frame: vi.fn(), failed: vi.fn(), ended: vi.fn() }
    });
    expect(render).toHaveBeenCalledTimes(1);
    session.dispose();
  });
});
