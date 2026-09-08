/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

// @ts-expect-error three 0.185.1 intentionally ships JavaScript without declarations.
import * as THREE from "three";
// @ts-expect-error The pinned three addons share the package's JavaScript-only boundary.
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AnimationPlayerRenderer, AnimationPlayerRendererMount, AnimationPlayerRendererSession } from "./animation-player";

const MAX_BLOB_BYTES = 4 * 1024 * 1024;

interface RendererFacade {
  readonly domElement: HTMLCanvasElement;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: unknown, camera: unknown): void;
  dispose(): void;
  forceContextLoss?(): void;
}

interface GltfClip { name: string; duration: number }
interface GltfScene { scale: { x: number }; traverse(callback: (object: unknown) => void): void }
interface LoadedGltf { scene: GltfScene; animations: GltfClip[] }
interface DisposableResource { dispose(): void }
interface DisposableMaterial extends DisposableResource { [key: string]: unknown }
interface DisposableMesh { geometry: { dispose(): void }; material: DisposableMaterial | DisposableMaterial[] }

export interface GltfRendererDiagnostics {
  mounts: number;
  staticFrames: number;
  activeRaf: number;
  activeObservers: number;
  activeListeners: number;
  activeCanvases: number;
  activeScenes: number;
  activeMixers: number;
  activeGpuResources: number;
  activeWebglContexts: number;
  disposals: number;
}

export interface GltfRendererOptions {
  loadGltf?: (blob: Blob) => Promise<LoadedGltf>;
  createRenderer?: () => RendererFacade;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
  createResizeObserver?: (callback: ResizeObserverCallback) => Pick<ResizeObserver, "observe" | "disconnect">;
  diagnostics?: GltfRendererDiagnostics;
}

export function createGltfRendererDiagnostics(): GltfRendererDiagnostics {
  return { mounts: 0, staticFrames: 0, activeRaf: 0, activeObservers: 0, activeListeners: 0, activeCanvases: 0, activeScenes: 0, activeMixers: 0, activeGpuResources: 0, activeWebglContexts: 0, disposals: 0 };
}

function defaultLoadGltf(blob: Blob): Promise<LoadedGltf> {
  if (blob.size <= 0 || blob.size > MAX_BLOB_BYTES) return Promise.reject(new Error("GLB Blob is outside the pilot byte budget."));
  return blob.arrayBuffer().then((bytes) => new Promise((resolve, reject) => {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(() => { throw new Error("External glTF resources are forbidden."); });
    new GLTFLoader(manager).parse(bytes, "", (loaded: LoadedGltf) => resolve(loaded), (error: unknown) => reject(error));
  }));
}

function cameraPosition(preset: string, fallback: readonly number[]): readonly number[] {
  if (preset === "front") return [0, 1, 3];
  if (preset === "side") return [3, 1, 0];
  if (preset === "three_quarter") return [2.3, 1.4, 2.3];
  return fallback;
}

export function createGltfAnimationRenderer(options: GltfRendererOptions = {}): AnimationPlayerRenderer {
  const loadGltf = options.loadGltf ?? defaultLoadGltf;
  const createRenderer = options.createRenderer ?? (() => new THREE.WebGLRenderer({ antialias: true, alpha: true }));
  const raf = options.requestAnimationFrame ?? globalThis.requestAnimationFrame.bind(globalThis);
  const cancelRaf = options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame.bind(globalThis);
  const diagnostics = options.diagnostics ?? createGltfRendererDiagnostics();

  return {
    async mount(input: AnimationPlayerRendererMount): Promise<AnimationPlayerRendererSession> {
      if (input.blob.size !== input.asset.byteSize || input.blob.size > MAX_BLOB_BYTES) throw new Error("Verified Blob size does not match the renderer boundary.");
      const gltf = await loadGltf(input.blob);
      const clip = gltf.animations.find((candidate: GltfClip) => candidate.name === input.entry.clipName);
      if (!clip || !Number.isFinite(clip.duration) || Math.abs(clip.duration - input.entry.durationSeconds) > 0.001) throw new Error("Exact animation clip is unavailable.");

      const scene = new THREE.Scene();
      scene.add(gltf.scene);
      gltf.scene.scale.x = input.request.mirrorMode === "horizontal" ? -1 : 1;
      const camera = new THREE.PerspectiveCamera(input.entry.defaultCamera.fovDegrees, 1, 0.01, 100);
      const position = cameraPosition(input.request.cameraPreset, input.entry.defaultCamera.position);
      camera.position.set(position[0], position[1], position[2]);
      camera.lookAt(...input.entry.defaultCamera.target);
      const renderer = createRenderer();
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      input.viewport.replaceChildren(renderer.domElement);
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
      action.clampWhenFinished = false;
      action.enabled = true;
      action.setEffectiveTimeScale(input.request.playbackSpeed);
      action.play();
      action.paused = true;

      const geometries = new Set<DisposableResource>();
      const materials = new Set<DisposableMaterial>();
      const textures = new Set<DisposableResource>();
      gltf.scene.traverse((object: unknown) => {
        if (!(object instanceof THREE.Mesh)) return;
        const mesh = object as DisposableMesh;
        geometries.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value as DisposableResource);
        }
      });

      diagnostics.mounts += 1;
      diagnostics.activeCanvases += 1;
      diagnostics.activeScenes += 1;
      diagnostics.activeMixers += 1;
      diagnostics.activeGpuResources += geometries.size + materials.size + textures.size;
      diagnostics.activeWebglContexts += 1;
      let disposed = false;
      let playing = false;
      let frameHandle: number | undefined;
      let lastTimestamp: number | undefined;

      const resize = () => {
        if (disposed) return;
        const width = Math.max(1, input.viewport.clientWidth || 320);
        const height = Math.max(1, input.viewport.clientHeight || Math.round(width * 0.625));
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        renderer.render(scene, camera);
      };
      const renderStatic = () => {
        resize();
        diagnostics.staticFrames += 1;
      };
      const stopFrame = () => {
        if (frameHandle !== undefined) {
          cancelRaf(frameHandle);
          frameHandle = undefined;
          diagnostics.activeRaf -= 1;
        }
        lastTimestamp = undefined;
      };
      const schedule = () => {
        if (disposed || !playing || input.request.reducedMotion || document.hidden || frameHandle !== undefined) return;
        diagnostics.activeRaf += 1;
        frameHandle = raf(tick);
      };
      const tick = (timestamp: number) => {
        if (frameHandle !== undefined) diagnostics.activeRaf -= 1;
        frameHandle = undefined;
        if (disposed || !playing || input.request.reducedMotion || document.hidden) return;
        const elapsed = lastTimestamp === undefined ? 0 : Math.max(0, Math.min((timestamp - lastTimestamp) / 1000, 0.1));
        lastTimestamp = timestamp;
        mixer.update(elapsed);
        const start = input.entry.loop.startSeconds;
        const end = input.entry.loop.endSeconds;
        if (action.time >= end || action.time < start) action.time = start + ((Math.max(0, action.time - start)) % (end - start));
        renderer.render(scene, camera);
        input.events.frame(action.time);
        schedule();
      };
      const onVisibility = () => {
        if (document.hidden) stopFrame();
        else schedule();
      };
      const onContextLost = (event: Event) => {
        event.preventDefault();
        playing = false;
        stopFrame();
        input.events.failed(new Error("WebGL context lost"));
      };
      const observer = options.createResizeObserver?.(() => resize())
        ?? (typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => resize()));
      observer?.observe(input.viewport);
      if (observer) diagnostics.activeObservers += 1;
      document.addEventListener("visibilitychange", onVisibility);
      renderer.domElement.addEventListener("webglcontextlost", onContextLost);
      diagnostics.activeListeners += 2;
      renderStatic();

      return {
        play() {
          if (disposed || input.request.reducedMotion) return;
          playing = true;
          action.paused = false;
          schedule();
        },
        pause() {
          if (disposed) return;
          playing = false;
          action.paused = true;
          stopFrame();
        },
        seek(positionSeconds: number) {
          if (disposed || !Number.isFinite(positionSeconds)) return;
          action.time = Math.max(0, Math.min(positionSeconds, input.entry.durationSeconds));
          mixer.setTime(action.time / input.request.playbackSpeed);
          renderer.render(scene, camera);
          input.events.frame(action.time);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          playing = false;
          stopFrame();
          observer?.disconnect();
          if (observer) diagnostics.activeObservers -= 1;
          document.removeEventListener("visibilitychange", onVisibility);
          renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
          diagnostics.activeListeners -= 2;
          action.stop();
          mixer.stopAllAction();
          mixer.uncacheRoot(gltf.scene);
          for (const texture of textures) texture.dispose();
          for (const material of materials) material.dispose();
          for (const geometry of geometries) geometry.dispose();
          diagnostics.activeGpuResources -= geometries.size + materials.size + textures.size;
          scene.clear();
          renderer.dispose();
          renderer.forceContextLoss?.();
          renderer.domElement.remove();
          diagnostics.activeCanvases -= 1;
          diagnostics.activeScenes -= 1;
          diagnostics.activeMixers -= 1;
          diagnostics.activeWebglContexts -= 1;
          diagnostics.disposals += 1;
        }
      };
    }
  };
}
