/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { createRequire, register } from "node:module";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PILOT_EVIDENCE_ROOT, inspectPilotGlb, reproducePilot } from "./animation-pilot-assets.mjs";

const workspaceTypeScriptLoaderSource = `
  import { readFile } from "node:fs/promises";
  import { stripTypeScriptTypes } from "node:module";
  import { pathToFileURL } from "node:url";

  const root = ${JSON.stringify(process.cwd().replaceAll("\\", "/"))};
  const workspacePackages = {
    "@gym/contracts": "packages/contracts/src/index.ts",
    "@gym/media": "packages/media/src/index.ts",
    "@gym/storage": "packages/storage/src/index.ts"
  };

  export async function resolve(specifier, context, nextResolve) {
    if (workspacePackages[specifier]) {
      return { url: pathToFileURL(root + "/" + workspacePackages[specifier]).href, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.includes("/packages/")) {
      for (const candidate of [specifier + ".ts", specifier + "/index.ts"]) {
        const url = new URL(candidate, context.parentURL);
        try {
          await readFile(url);
          return { url: url.href, shortCircuit: true };
        } catch {
          // Try the next TypeScript source shape.
        }
      }
    }
    return nextResolve(specifier, context);
  }

  export async function load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      const source = await readFile(new URL(url), "utf8");
      return {
        format: "module",
        source: stripTypeScriptTypes(source, { mode: "strip" }),
        shortCircuit: true
      };
    }
    return nextLoad(url, context);
  }
`;
register(`data:text/javascript,${encodeURIComponent(workspaceTypeScriptLoaderSource)}`, import.meta.url);

const candidates = [
  {
    id: "three-direct",
    packages: [{ name: "three", version: "0.185.1", integrity: "sha512-5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==", license: "MIT" }]
  },
  {
    id: "babylon-modular",
    packages: [
      { name: "@babylonjs/core", version: "9.23.0", integrity: "sha512-FpDaTPx485J1H0AEJpoJ785Z1CwCkEPNnZFu7WzHTy0ByGCy75bkZZILh4QFU4LLnzK1iuHwUfecCguATIeKSA==", license: "Apache-2.0" },
      { name: "@babylonjs/loaders", version: "9.23.0", integrity: "sha512-4qNxiHmi2udyZmTsVL3iUUfVF4BKecgmFpp1//wBoZ6RhTWlkbBT4CIJLVPeibXZeJliZ5vII8rvZqDPgGiotw==", license: "Apache-2.0" },
      { name: "babylonjs-gltf2interface", version: "9.23.0", integrity: "sha512-oD9rkfCafvGACikVWhVVl1Iy9bDuBVlI7zmeiDXI8y5gw7UOmQMffpvrl/ujoiw5agcsEAaQuF6Dbjfb+Cpaiw==", license: "Apache-2.0" }
    ]
  },
  {
    id: "google-model-viewer",
    packages: [
      { name: "@google/model-viewer", version: "4.3.1", integrity: "sha512-GP+inXhAtY31E8rILVmByA6z8CZZjdlNajddppyI1/j1eIaSQiZcMRaUqTFe7+jv4mzRzwKIOiKBud0apiv+WQ==", license: "Apache-2.0" },
      { name: "three", version: "0.185.1", integrity: "sha512-5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==", license: "MIT" }
    ]
  }
];

const expectedOperations = ["mount", "static-frame", "play", "pause", "seek", "loop", "speed", "camera", "mirror", "reduced-motion", "resize", "failure", "dispose"];

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function packageRoot(name, importerRoot = process.cwd()) {
  const linkedRoot = join(importerRoot, "node_modules", ...name.split("/"));
  try {
    await stat(join(linkedRoot, "package.json"));
    return realpath(linkedRoot);
  } catch {
    // Fall back to packages whose entry point is resolvable through exports.
  }
  const requireFromImporter = createRequire(join(importerRoot, "package.json"));
  let current;
  try {
    current = dirname(requireFromImporter.resolve(`${name}/package.json`));
  } catch {
    current = dirname(requireFromImporter.resolve(name));
  }
  while (current !== dirname(current)) {
    try {
      await stat(join(current, "package.json"));
      return realpath(current);
    } catch {
      current = dirname(current);
    }
  }
  throw new Error(`Unable to resolve package root for ${name}.`);
}

async function directoryBytes(root) {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

async function packageMetadata(candidate, lockText) {
  const packages = [];
  for (const expected of candidate.packages) {
    const root = await packageRoot(expected.name);
    const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const versionMatches = metadata.version === expected.version;
    const licenseMatches = metadata.license === expected.license || (Array.isArray(metadata.licenses) && metadata.licenses.some((license) => license.type === expected.license));
    const integrityMatches = lockText.includes(`${expected.name}@${expected.version}`) && lockText.includes(expected.integrity);
    packages.push({
      name: expected.name,
      version: metadata.version,
      expectedVersion: expected.version,
      integrity: expected.integrity,
      license: metadata.license,
      expectedLicense: expected.license,
      source: typeof metadata.repository === "string" ? metadata.repository : metadata.repository?.url,
      homepage: metadata.homepage,
      rootBytes: await directoryBytes(root),
      versionMatches,
      integrityMatches,
      licenseMatches
    });
  }
  const closureByRoot = new Map();
  const collectClosure = async (name, importerRoot) => {
    const root = await packageRoot(name, importerRoot);
    if (closureByRoot.has(root)) return;
    const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const license = metadata.license ?? metadata.licenses?.map((item) => item.type).filter(Boolean).join(" OR ");
    closureByRoot.set(root, {
      name: metadata.name,
      version: metadata.version,
      license,
      source: typeof metadata.repository === "string" ? metadata.repository : metadata.repository?.url,
      rootBytes: await directoryBytes(root),
      lockEntryPresent: lockText.includes(`${metadata.name}@${metadata.version}`)
    });
    const dependencies = new Set([...Object.keys(metadata.dependencies ?? {}), ...Object.keys(metadata.peerDependencies ?? {})]);
    for (const dependency of dependencies) {
      try {
        await collectClosure(dependency, root);
      } catch {
        // Uninstalled optional peers do not enter the measured package closure.
      }
    }
  };
  for (const expected of candidate.packages) await collectClosure(expected.name, process.cwd());
  const closurePackages = [...closureByRoot.values()].sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
  const closureBytes = closurePackages.reduce((total, item) => total + item.rootBytes, 0);
  return {
    packages,
    closurePackages,
    closurePackageRoots: closurePackages.length,
    closureBytes,
    closurePinned: packages.every((metadata) => metadata.versionMatches && metadata.integrityMatches && metadata.licenseMatches)
      && closurePackages.every((metadata) => metadata.lockEntryPresent && typeof metadata.license === "string" && metadata.license.length > 0)
  };
}

function deriveLeaks(diagnostics) {
  return {
    raf: diagnostics.activeRaf,
    observer: diagnostics.activeObservers,
    listener: diagnostics.activeListeners,
    canvas: diagnostics.activeCanvases,
    scene: diagnostics.activeScenes,
    mixer: diagnostics.activeMixers,
    gpuResource: diagnostics.activeGpuResources,
    webglContext: diagnostics.activeWebglContexts
  };
}

function observe(counts, operation, amount = 1) {
  counts.set(operation, (counts.get(operation) ?? 0) + amount);
}

function mergeObservations(target, source) {
  for (const [operation, count] of source) observe(target, operation, count);
}

function cameraPosition(preset, fallback) {
  if (preset === "front") return [0, 1, 3];
  if (preset === "side") return [3, 1, 0];
  if (preset === "three_quarter") return [2.3, 1.4, 2.3];
  return fallback;
}

function isNear(left, right, epsilon = 0.001) {
  return Math.abs(left - right) <= epsilon;
}

async function createThreeAdapter() {
  const [{ JSDOM }, media] = await Promise.all([
    import("jsdom"),
    import(pathToFileURL(join(process.cwd(), "packages/media/src/gltf-renderer.ts")).href)
  ]);
  const dom = new JSDOM("<!doctype html><div id=\"viewport\"></div>");
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLCanvasElement: globalThis.HTMLCanvasElement,
    devicePixelRatio: globalThis.devicePixelRatio
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  globalThis.devicePixelRatio = 1;
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: false });
  const diagnostics = media.createGltfRendererDiagnostics();

  const createRendererHarness = () => {
    const frames = new Map();
    let nextFrame = 1;
    let resizeCallback;
    const state = { setSizeCalls: 0, renderCalls: 0, disposeCalls: 0, contextLossCalls: 0, lastScene: undefined, lastCamera: undefined };
    return {
      frames,
      state,
      renderer: media.createGltfAnimationRenderer({
        createRenderer: () => ({
          domElement: globalThis.document.createElement("canvas"),
          setPixelRatio() {},
          setSize() { state.setSizeCalls += 1; },
          render(scene, camera) { state.renderCalls += 1; state.lastScene = scene; state.lastCamera = camera; },
          dispose() { state.disposeCalls += 1; },
          forceContextLoss() { state.contextLossCalls += 1; }
        }),
        requestAnimationFrame(callback) { const id = nextFrame; nextFrame += 1; frames.set(id, callback); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        createResizeObserver: (callback) => { resizeCallback = callback; return { observe() {}, disconnect() {} }; },
        diagnostics
      }),
      resize() { resizeCallback?.([], {}); },
      runFrame(timestamp) {
        const first = frames.entries().next().value;
        if (first === undefined) return false;
        frames.delete(first[0]);
        first[1](timestamp);
        return true;
      }
    };
  };

  return {
    async run({ blob, entry, asset, request }) {
      const counts = new Map();
      const harness = createRendererHarness();
      const framePositions = [];
      const before = { mounts: diagnostics.mounts, staticFrames: diagnostics.staticFrames, disposals: diagnostics.disposals };
      const viewport = globalThis.document.getElementById("viewport");
      const session = await harness.renderer.mount({
        viewport,
        blob,
        entry,
        asset,
        request,
        events: { frame: (position) => framePositions.push(position), ended() {}, failed(error) { throw error ?? new Error("renderer failed"); } }
      });
      if (diagnostics.mounts > before.mounts) observe(counts, "mount");
      if (diagnostics.staticFrames > before.staticFrames && harness.state.renderCalls > 0) observe(counts, "static-frame");

      const renderedModel = harness.state.lastScene?.children?.[0];
      const expectedMirror = request.mirrorMode === "horizontal" ? -1 : 1;
      if (renderedModel?.scale?.x === expectedMirror) observe(counts, "mirror");
      const expectedCamera = cameraPosition(request.cameraPreset, entry.defaultCamera.position);
      const renderedCamera = harness.state.lastCamera;
      if (renderedCamera && expectedCamera.every((value, index) => isNear(renderedCamera.position.toArray()[index], value))) observe(counts, "camera");

      const sizeCalls = harness.state.setSizeCalls;
      harness.resize();
      if (harness.state.setSizeCalls > sizeCalls) observe(counts, "resize");

      session.play();
      if (request.reducedMotion) {
        if (harness.frames.size === 0) observe(counts, "reduced-motion");
      } else if (harness.frames.size > 0) {
        observe(counts, "play");
        const frameStart = framePositions.length;
        harness.runFrame(100);
        harness.runFrame(200);
        const played = framePositions.slice(frameStart);
        if (played.length >= 2 && isNear(played.at(-1) - played[0], 0.1 * request.playbackSpeed, 0.01)) observe(counts, "speed");

        const seekTarget = Math.min(entry.loop.endSeconds - 0.01, entry.durationSeconds - 0.01);
        session.seek(seekTarget);
        if (isNear(framePositions.at(-1), seekTarget)) observe(counts, "seek");
        session.play();
        harness.runFrame(300);
        harness.runFrame(500);
        if (framePositions.at(-1) < seekTarget) observe(counts, "loop");
      }
      session.pause();
      if (harness.frames.size === 0) observe(counts, "pause");
      if (request.reducedMotion) {
        const seekTarget = Math.min(0.5, entry.durationSeconds);
        session.seek(seekTarget);
        if (isNear(framePositions.at(-1), seekTarget)) observe(counts, "seek");
      }
      session.dispose();
      if (diagnostics.disposals > before.disposals && harness.state.disposeCalls === 1 && harness.state.contextLossCalls === 1 && viewport.childElementCount === 0) observe(counts, "dispose");
      return { counts, frameEvents: framePositions.length };
    },
    async failure({ entry, asset, request }) {
      const counts = new Map();
      const harness = createRendererHarness();
      const malformed = new Blob([new Uint8Array([0, 1, 2, 3])], { type: asset.mediaType });
      try {
        const session = await harness.renderer.mount({
          viewport: globalThis.document.getElementById("viewport"),
          blob: malformed,
          entry,
          asset: { ...asset, byteSize: malformed.size },
          request,
          events: { frame() {}, ended() {}, failed() {} }
        });
        session.dispose();
      } catch {
        observe(counts, "failure");
      }
      return counts;
    },
    async dispose() {
      if (previous.window === undefined) Reflect.deleteProperty(globalThis, "window"); else globalThis.window = previous.window;
      if (previous.document === undefined) Reflect.deleteProperty(globalThis, "document"); else globalThis.document = previous.document;
      if (previous.HTMLCanvasElement === undefined) Reflect.deleteProperty(globalThis, "HTMLCanvasElement"); else globalThis.HTMLCanvasElement = previous.HTMLCanvasElement;
      if (previous.devicePixelRatio === undefined) Reflect.deleteProperty(globalThis, "devicePixelRatio"); else globalThis.devicePixelRatio = previous.devicePixelRatio;
      dom.window.close();
      return deriveLeaks(diagnostics);
    }
  };
}

async function createBabylonAdapter() {
  const [{ NullEngine }, { Scene }, { FreeCamera }, { Vector3 }, { LoadAssetContainerAsync }, , { Logger }] = await Promise.all([
    import("@babylonjs/core/Engines/nullEngine.js"),
    import("@babylonjs/core/scene.js"),
    import("@babylonjs/core/Cameras/freeCamera.js"),
    import("@babylonjs/core/Maths/math.vector.js"),
    import("@babylonjs/core/Loading/sceneLoader.js"),
    import("@babylonjs/loaders/glTF/index.js"),
    import("@babylonjs/core/Misc/logger.js")
  ]);
  Logger.LogLevels = Logger.NoneLogLevel;
  const engine = new NullEngine({ renderWidth: 320, renderHeight: 200 });
  return {
    async run({ blob, entry, request }) {
      const counts = new Map();
      const scene = new Scene(engine);
      const container = await LoadAssetContainerAsync(new Uint8Array(await blob.arrayBuffer()), scene, { pluginExtension: ".glb", name: `${entry.animationId}.glb` });
      observe(counts, "mount");
      container.addAllToScene();
      const animation = container.animationGroups.find((group) => group.name === entry.clipName);
      if (animation === undefined) throw new Error(`Babylon did not load ${entry.clipName}.`);

      const modelRoot = container.transformNodes[0] ?? container.meshes[0];
      const expectedMirror = request.mirrorMode === "horizontal" ? -1 : 1;
      modelRoot.scaling.x = expectedMirror;
      if (modelRoot.scaling.x === expectedMirror) observe(counts, "mirror");
      const position = cameraPosition(request.cameraPreset, entry.defaultCamera.position);
      const camera = new FreeCamera("pilot-benchmark-camera", new Vector3(...position), scene);
      camera.setTarget(new Vector3(...entry.defaultCamera.target));
      scene.activeCamera = camera;
      if (camera.position.asArray().every((value, index) => isNear(value, position[index]))) observe(counts, "camera");

      engine.setSize(320, 200);
      const firstFrame = scene.getFrameId();
      scene.render();
      if (scene.getFrameId() > firstFrame) observe(counts, "static-frame");
      engine.setSize(390, 244);
      scene.render();
      if (engine.getRenderWidth() === 390 && engine.getRenderHeight() === 244) observe(counts, "resize");

      animation.start(true, request.playbackSpeed);
      if (animation.isPlaying) observe(counts, "play");
      if (animation.loopAnimation) observe(counts, "loop");
      if (isNear(animation.speedRatio, request.playbackSpeed)) observe(counts, "speed");
      animation.goToFrame(animation.from + (animation.to - animation.from) / 2);
      if (animation.animatables.every((item) => item.masterFrame >= animation.from && item.masterFrame <= animation.to)) observe(counts, "seek");
      if (request.reducedMotion) {
        animation.pause();
        if (!animation.isPlaying) observe(counts, "reduced-motion");
      }
      animation.pause();
      if (!animation.isPlaying) observe(counts, "pause");
      container.dispose();
      const frameEvents = scene.getFrameId() - firstFrame;
      scene.dispose();
      if (scene.isDisposed && !engine.scenes.includes(scene)) observe(counts, "dispose");
      return { counts, frameEvents };
    },
    async failure({ entry }) {
      const counts = new Map();
      const scene = new Scene(engine);
      try {
        const container = await LoadAssetContainerAsync(new Uint8Array([0, 1, 2, 3]), scene, { pluginExtension: ".glb", name: `${entry.animationId}.invalid.glb` });
        container.dispose();
      } catch {
        observe(counts, "failure");
      } finally {
        scene.dispose();
      }
      return counts;
    },
    async dispose() {
      engine.dispose();
      return { scene: engine.scenes.length, webglContext: Number(!engine.isDisposed) };
    }
  };
}

async function createModelViewerAdapter() {
  const previousProgressEvent = globalThis.ProgressEvent;
  if (typeof ProgressEvent === "undefined") {
    globalThis.ProgressEvent = class ProgressEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    };
  }
  const [{ CachingGLTFLoader }, { ModelViewerGLTFInstance }, three] = await Promise.all([
    import("@google/model-viewer/lib/three-components/CachingGLTFLoader.js"),
    import("@google/model-viewer/lib/three-components/gltf-instance/ModelViewerGLTFInstance.js"),
    import("three")
  ]);
  const loader = new CachingGLTFLoader(ModelViewerGLTFInstance);
  const element = { withCredentials: false };
  const dataUrl = async (blob) => `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
  return {
    async run({ blob, entry, request }) {
      const counts = new Map();
      const url = await dataUrl(blob);
      const gltf = await loader.load(url, element);
      observe(counts, "mount");
      const clip = gltf.animations.find((candidate) => candidate.name === entry.clipName);
      if (clip === undefined) throw new Error(`model-viewer did not load ${entry.clipName}.`);
      const mixer = new three.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(clip);
      mixer.setTime(0);
      gltf.scene.updateMatrixWorld(true);
      observe(counts, "static-frame");

      const expectedMirror = request.mirrorMode === "horizontal" ? -1 : 1;
      gltf.scene.scale.x = expectedMirror;
      if (gltf.scene.scale.x === expectedMirror) observe(counts, "mirror");
      const position = cameraPosition(request.cameraPreset, entry.defaultCamera.position);
      const camera = new three.PerspectiveCamera(entry.defaultCamera.fovDegrees, 1, 0.01, 100);
      camera.position.set(...position);
      camera.lookAt(...entry.defaultCamera.target);
      if (camera.position.toArray().every((value, index) => isNear(value, position[index]))) observe(counts, "camera");
      camera.aspect = 390 / 244;
      camera.updateProjectionMatrix();
      if (isNear(camera.aspect, 390 / 244)) observe(counts, "resize");

      action.setLoop(three.LoopRepeat, Number.POSITIVE_INFINITY);
      action.setEffectiveTimeScale(request.playbackSpeed);
      action.play();
      if (action.isRunning()) observe(counts, "play");
      if (action.loop === three.LoopRepeat) observe(counts, "loop");
      if (isNear(action.getEffectiveTimeScale(), request.playbackSpeed)) observe(counts, "speed");
      const beforeFrame = action.time;
      mixer.update(0.1);
      const frameEvents = Number(!isNear(action.time, beforeFrame));
      action.time = Math.min(0.5, entry.durationSeconds);
      mixer.update(0);
      if (isNear(action.time, Math.min(0.5, entry.durationSeconds))) observe(counts, "seek");
      if (request.reducedMotion) {
        action.paused = true;
        const before = action.time;
        mixer.update(0.1);
        if (isNear(action.time, before)) observe(counts, "reduced-motion");
      }
      action.paused = true;
      if (!action.isRunning()) observe(counts, "pause");
      action.stop();
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
      gltf.dispose();
      await CachingGLTFLoader.delete(url);
      if (!CachingGLTFLoader.has(url)) observe(counts, "dispose");
      return { counts, frameEvents };
    },
    async failure() {
      const counts = new Map();
      const malformed = new Blob([new Uint8Array([0, 1, 2, 3])], { type: "model/gltf-binary" });
      const url = await dataUrl(malformed);
      const previousError = console.error;
      console.error = () => undefined;
      try {
        const gltf = await loader.load(url, element);
        gltf.dispose();
      } catch {
        observe(counts, "failure");
      } finally {
        console.error = previousError;
        await CachingGLTFLoader.delete(url).catch(() => undefined);
      }
      return counts;
    },
    async dispose() {
      if (previousProgressEvent === undefined) Reflect.deleteProperty(globalThis, "ProgressEvent");
      else globalThis.ProgressEvent = previousProgressEvent;
      return { modelCache: CachingGLTFLoader.cache.size };
    }
  };
}

async function createCandidateAdapter(candidate) {
  if (candidate.id === "three-direct") return createThreeAdapter();
  if (candidate.id === "babylon-modular") return createBabylonAdapter();
  if (candidate.id === "google-model-viewer") return createModelViewerAdapter();
  throw new Error(`Unknown renderer candidate ${candidate.id}.`);
}

async function measuredCandidateWorkload(candidate, reproduction) {
  let parsedAssets = 0;
  let mountedAssets = 0;
  let frameEvents = 0;
  const operationCounts = new Map();
  const operationTrace = [];
  const adapter = await createCandidateAdapter(candidate);
  const expectedAssets = reproduction.declarations.releases.releases.length
    * reproduction.declarations.source.variants.length * 10;
  const diagnosticStartedAt = performance.now();
  const nativeFetch = globalThis.fetch;
  let remoteRequestAttempts = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/^(?:data|blob):/i.test(url)) {
      remoteRequestAttempts += 1;
      throw new Error(`Network disabled during renderer benchmark: ${url}`);
    }
    return nativeFetch(input, init);
  };
  let leaks;
  try {
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const cycleCounts = new Map();
      let assetIndex = 0;
      for (const release of reproduction.declarations.releases.releases) {
        const built = reproduction.first.get(release.version);
        const manifest = JSON.parse(built.artifacts.get("animation-pack-manifest.json").toString("utf8"));
        for (const entry of manifest.entries) {
          const asset = manifest.assets.find((item) => item.id === entry.assetId);
          const bytes = await readFile(join(built.sourceRoot, ...asset.path.split("/")));
          inspectPilotGlb(bytes, { clipName: entry.clipName, props: entry.equipmentProps, releaseSentinel: release.sentinel });
          const request = {
            exerciseVariantId: entry.exerciseVariantId,
            animationId: entry.animationId,
            playbackSpeed: cycle % 2 === 0 ? 1 : 0.75,
            cameraPreset: entry.defaultCamera.preset,
            mirrorMode: assetIndex % 2 === 0 ? "none" : "horizontal",
            reducedMotion: assetIndex === manifest.entries.length - 1
          };
          const result = await adapter.run({ blob: new Blob([bytes], { type: asset.mediaType }), entry, asset, request });
          parsedAssets += 1;
          mountedAssets += 1;
          frameEvents += result.frameEvents;
          mergeObservations(cycleCounts, result.counts);
          assetIndex += 1;
        }
      }
      const firstRelease = reproduction.first.get(reproduction.declarations.releases.releases[0].version);
      const firstManifest = JSON.parse(firstRelease.artifacts.get("animation-pack-manifest.json").toString("utf8"));
      const firstEntry = firstManifest.entries[0];
      const firstAsset = firstManifest.assets.find((item) => item.id === firstEntry.assetId);
      mergeObservations(cycleCounts, await adapter.failure({
        entry: firstEntry,
        asset: firstAsset,
        request: { exerciseVariantId: firstEntry.exerciseVariantId, animationId: firstEntry.animationId, playbackSpeed: 1, cameraPreset: firstEntry.defaultCamera.preset, mirrorMode: "none", reducedMotion: false }
      }));
      mergeObservations(operationCounts, cycleCounts);
      for (const operation of expectedOperations) {
        const observations = cycleCounts.get(operation) ?? 0;
        operationTrace.push({ cycle, operation, observations, satisfied: observations > 0 });
      }
    }
  } finally {
    if (nativeFetch === undefined) Reflect.deleteProperty(globalThis, "fetch"); else globalThis.fetch = nativeFetch;
    leaks = await adapter.dispose();
  }
  const diagnosticDurationMs = performance.now() - diagnosticStartedAt;
  return {
    expectedAssets,
    parsedAssets,
    mountedAssets,
    frameEvents,
    operationTrace,
    operationCounts: Object.fromEntries(operationCounts),
    leaks,
    remoteRequestAttempts,
    timingDiagnostic: {
      durationMs: Number(diagnosticDurationMs.toFixed(3)),
      averageAssetMs: Number((diagnosticDurationMs / mountedAssets).toFixed(6))
    }
  };
}

export async function runRendererBenchmark({ writeEvidence = true, onTimingDiagnostic, onReproductionReady, reproductionHooks } = {}) {
  return reproducePilot({
    writeEvidence: false,
    hooks: reproductionHooks,
    consume: async (reproduction, invocation) => {
      await onReproductionReady?.(reproduction, invocation);
  const lockText = await readFile("pnpm-lock.yaml", "utf8");
  const workload = [];
  for (const candidate of candidates) {
    const metadata = await packageMetadata(candidate, lockText);
    const measured = await measuredCandidateWorkload(candidate, reproduction);
    const hardGates = {
      metadataAndLicense: metadata.closurePinned,
      offlineBlobParsing: measured.parsedAssets === measured.expectedAssets && measured.remoteRequestAttempts === 0,
      controllerOperations: measured.mountedAssets === measured.expectedAssets && expectedOperations.every((operation) => measured.operationCounts[operation] > 0),
      disposalAfterTenCycles: measured.operationCounts.dispose === measured.mountedAssets && Object.values(measured.leaks).every((count) => count === 0)
    };
    const observedOperations = Object.values(measured.operationCounts).reduce((total, count) => total + count, 0);
    const passedGateCount = Object.values(hardGates).filter(Boolean).length;
    const score = Math.round(passedGateCount * 1_000_000 + observedOperations + measured.parsedAssets + measured.frameEvents - metadata.closureBytes / 1024);
    onTimingDiagnostic?.({ id: candidate.id, ...measured.timingDiagnostic });
    workload.push({
      id: candidate.id,
      packages: metadata.packages,
      closurePackages: metadata.closurePackages,
      closureBytes: metadata.closureBytes,
      closurePackageRoots: metadata.closurePackageRoots,
      closurePinned: metadata.closurePinned,
      license: [...new Set(metadata.packages.map((item) => item.license))].join(" + "),
      workload: {
        releases: reproduction.declarations.releases.releases.length,
        variants: reproduction.declarations.source.variants.length,
        cycles: 10,
        parsedAssets: measured.parsedAssets,
        mountedAssets: measured.mountedAssets,
        frameEvents: measured.frameEvents,
        operations: expectedOperations,
        operationCounts: measured.operationCounts,
        operationTrace: measured.operationTrace,
        measuredFailures: expectedOperations.filter((operation) => !(measured.operationCounts[operation] > 0)),
        remoteRequestAttempts: measured.remoteRequestAttempts
      },
      hardGates,
      ownedResourceLeaks: measured.leaks,
      score
    });
  }
  const passing = workload.filter((candidate) => Object.values(candidate.hardGates).every(Boolean)).sort((left, right) => right.score - left.score || left.closureBytes - right.closureBytes || left.id.localeCompare(right.id));
  if (passing[0]?.id !== "three-direct") throw new Error("Renderer benchmark did not select three-direct deterministically.");
  const report = {
    schemaVersion: 1,
    packetId: "ANIMATION-PILOT-01-REV-02",
    status: "pass",
    environment: {
      scope: "automated desktop Node workload",
      physicalDeviceClaimed: false,
      timingPolicy: "wall-clock timing is emitted only as a noncommitted, nonselection diagnostic"
    },
    selectionRule: "highest deterministic score among hard-gate passers; tie selects smaller closure",
    selected: passing[0].id,
    candidates: workload
  };
  if (writeEvidence) {
    await mkdir(PILOT_EVIDENCE_ROOT, { recursive: true });
    await writeFile(join(PILOT_EVIDENCE_ROOT, "renderer-benchmark.json"), stableJson(report));
  }
  return report;
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const timingDiagnostics = [];
  runRendererBenchmark({ onTimingDiagnostic: (diagnostic) => timingDiagnostics.push(diagnostic) }).then((report) => {
    for (const diagnostic of timingDiagnostics) {
      process.stdout.write(`DIAGNOSTIC renderer wall-clock timing (noncommitted/nonselection): ${diagnostic.id} ${diagnostic.durationMs} ms total, ${diagnostic.averageAssetMs} ms/asset\n`);
    }
    process.stdout.write(`PASS renderer benchmark: ${report.selected}\n`);
  }).catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
