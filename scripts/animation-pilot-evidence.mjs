/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { register } from "node:module";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import "fake-indexeddb/auto";
import JSZip from "jszip";
import { PILOT_EVIDENCE_ROOT, readPilotDeclarations, reproducePilot } from "./animation-pilot-assets.mjs";
import { runRendererBenchmark } from "./animation-pilot-benchmark.mjs";

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
        source: stripTypeScriptTypes(source, { mode: "transform" }),
        shortCircuit: true
      };
    }
    return nextLoad(url, context);
  }
`;
register(`data:text/javascript,${encodeURIComponent(workspaceTypeScriptLoaderSource)}`, import.meta.url);

const reportNames = [
  "release-reproducibility.json",
  "license-audit.json",
  "renderer-benchmark.json",
  "offline-rollback.json",
  "personal-data-isolation.json",
  "accessibility-automation.json",
  "performance-report.json"
];

const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const personalTableNames = ["profile", "routines", "programs", "sessions", "foods", "meals", "recipes", "waterEntries", "foodPreferences", "pantryItems", "mealPlans", "bodyMetrics", "customVariants", "settings"];

async function sourceHasNetworkApi() {
  const files = [
    "packages/media/src/gltf-renderer.ts",
    "packages/storage/src/animation-pack/store.ts",
    "apps/web/src/pilot/AnimationPilotApp.tsx"
  ];
  const forbidden = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/;
  for (const file of files) if (forbidden.test(await readFile(file, "utf8"))) return true;
  return false;
}

async function responsiveAutomationEvidence() {
  const source = await readFile("apps/web/src/pilot/AnimationPilotApp.test.tsx", "utf8");
  const widthList = /it\.each\(\[([^\]]+)\]/.exec(source)?.[1] ?? "";
  const widthsCssPx = [...widthList.matchAll(/\d+/g)].map((match) => Number(match[0]));
  return {
    widthsCssPx,
    nativeKeyboardControls: /document\.activeElement/.test(source) && /tagName\)\.toBe\("BUTTON"\)/.test(source),
    politeAtomicStatus: /aria-live", "polite"/.test(source) && /aria-atomic", "true"/.test(source),
    writtenFallbackAlwaysPresent: /Hướng dẫn bằng chữ/.test(source) && /fallback--emphasized/.test(source),
    reducedMotionStaticFrame: /prefers-reduced-motion: reduce/.test(source) && /giảm chuyển động/.test(source),
    failureFallback: /Không mở được hoạt ảnh/.test(source)
  };
}

class FakeFile {
  blob = new Blob();
}

class FakeWritable {
  #file;
  #parts = [];
  closed = false;
  aborted = false;

  constructor(file) {
    this.#file = file;
  }

  async write(chunk) {
    if (this.closed || this.aborted) throw new Error("writer closed");
    this.#parts.push(chunk);
  }

  async close() {
    this.#file.blob = new Blob(this.#parts);
    this.closed = true;
  }

  async abort() {
    this.aborted = true;
  }
}

class FakeFileHandle {
  kind = "file";
  name;
  file;

  constructor(name, file) {
    this.name = name;
    this.file = file;
  }

  async getFile() {
    return new Blob([await this.file.blob.arrayBuffer()]);
  }

  async createWritable() {
    return new FakeWritable(this.file);
  }

  async isSameEntry(other) {
    return other instanceof FakeFileHandle && other.file === this.file;
  }
}

class FakeDirectory {
  kind = "directory";
  name;
  root;
  children = new Map();

  constructor(name, root) {
    this.name = name;
    this.root = root ?? this;
  }

  async getDirectoryHandle(name, options = {}) {
    const node = this.children.get(name);
    if (node instanceof FakeDirectory) return node;
    if (node !== undefined) throw new DOMException("type", "TypeMismatchError");
    if (!options.create) throw new DOMException("missing", "NotFoundError");
    const created = new FakeDirectory(name, this.root);
    this.children.set(name, created);
    return created;
  }

  async getFileHandle(name, options = {}) {
    const node = this.children.get(name);
    if (node instanceof FakeFile) return new FakeFileHandle(name, node);
    if (node !== undefined) throw new DOMException("type", "TypeMismatchError");
    if (!options.create) throw new DOMException("missing", "NotFoundError");
    const created = new FakeFile();
    this.children.set(name, created);
    return new FakeFileHandle(name, created);
  }

  async removeEntry(name, options = {}) {
    const node = this.children.get(name);
    if (node === undefined) throw new DOMException("missing", "NotFoundError");
    if (node instanceof FakeDirectory && node.children.size && !options.recursive) throw new DOMException("not empty", "InvalidModificationError");
    this.children.delete(name);
  }

  async resolve(possibleDescendant) {
    const search = (folder, path) => {
      if (folder === possibleDescendant) return path;
      for (const [name, child] of folder.children) {
        if (child instanceof FakeDirectory) {
          const found = search(child, [...path, name]);
          if (found !== undefined) return found;
        }
      }
      return undefined;
    };
    return search(this, []) ?? null;
  }

  async isSameEntry(other) {
    return other === this;
  }
}

function child(root, path) {
  let node = root;
  for (const part of path.split("/")) {
    if (!(node instanceof FakeDirectory)) return undefined;
    node = node.children.get(part);
    if (node === undefined) return undefined;
  }
  return node;
}

async function objectState(root) {
  const objects = child(root, "gym-local/animation-packs/v1/objects");
  const archiveFiles = [];
  async function walk(node, path = []) {
    if (node instanceof FakeDirectory) {
      for (const [name, value] of node.children) await walk(value, [...path, name]);
    } else if (path.at(-1) === "animation-pack.zip") {
      archiveFiles.push({ path: path.join("/"), bytes: node.blob.size });
    }
  }
  if (objects !== undefined) await walk(objects);
  return {
    archiveObjectCount: archiveFiles.length,
    archiveBytes: archiveFiles.reduce((total, file) => total + file.bytes, 0),
    archiveFiles
  };
}

function personalSnapshot() {
  return {
    profile: undefined,
    routines: [],
    programs: [],
    sessions: [{
      id: "session_existing_history",
      startedAt: "2026-09-05T00:00:00.000Z",
      exercises: [],
      notes: "existing personal history"
    }],
    foods: [],
    meals: [],
    recipes: [],
    waterEntries: [],
    foodPreferences: [],
    pantryItems: [],
    mealPlans: [],
    bodyMetrics: [],
    customVariants: [],
    settings: { id: "app", catalogVersion: 3, dbSchemaVersion: 5, routineTemplateVersion: 2, nutritionFormulaVersion: 1, backupVersion: 5 }
  };
}

function stablePersonal(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stablePersonal).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stablePersonal(value[key])}`).join(",")}}`;
}

function personalCounts(value) {
  return Object.fromEntries(personalTableNames.map((name) => {
    if (Array.isArray(value[name])) return [name, value[name].length];
    return [name, Number(value[name] !== undefined)];
  }));
}

function hashPersonal(value) {
  return createHash("sha256").update(stablePersonal(value)).digest("hex");
}

function hashBuffer(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function backupExclusion(backup, forbiddenStrings, forbiddenArtifacts) {
  const backupBytes = Buffer.from(await backup.arrayBuffer());
  const zip = await JSZip.loadAsync(backupBytes);
  const entries = {};
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    entries[name] = Buffer.from(await file.async("uint8array"));
  }
  const serialized = Object.values(entries).map((bytes) => bytes.toString("utf8")).join("\n");
  const forbiddenArtifactMatches = forbiddenArtifacts
    .filter(({ bytes }) => backupBytes.includes(bytes) || Object.values(entries).some((entry) => entry.includes(bytes)))
    .map(({ label }) => label);
  return {
    backupVersion: JSON.parse(entries["manifest.json"].toString("utf8")).backupVersion,
    entries: Object.keys(entries).sort(),
    forbiddenStringMatches: forbiddenStrings.filter((value) => serialized.includes(value)),
    forbiddenArtifactMatches,
    forbiddenByteMatches: forbiddenArtifactMatches.length,
    checkedArtifacts: forbiddenArtifacts.map(({ label, bytes }) => ({ label, byteSize: bytes.length, sha256: hashBuffer(bytes) }))
  };
}

async function renderSource(source, diagnostics) {
  const [{ JSDOM }, media] = await Promise.all([
    import("jsdom"),
    import(pathToFileURL(resolve("packages/media/src/gltf-renderer.ts")).href)
  ]);
  const dom = new JSDOM("<!doctype html><div id=\"viewport\"></div>");
  const previous = { window: globalThis.window, document: globalThis.document, HTMLCanvasElement: globalThis.HTMLCanvasElement, devicePixelRatio: globalThis.devicePixelRatio };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  globalThis.devicePixelRatio = 1;
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: false });
  try {
    let nextFrame = 1;
    const frames = new Map();
    const renderer = media.createGltfAnimationRenderer({
      createRenderer: () => ({
        domElement: globalThis.document.createElement("canvas"),
        setPixelRatio() {},
        setSize() {},
        render() {},
        dispose() {},
        forceContextLoss() {}
      }),
      requestAnimationFrame(callback) { const id = nextFrame; nextFrame += 1; frames.set(id, callback); return id; },
      cancelAnimationFrame(id) { frames.delete(id); },
      createResizeObserver: () => ({ observe() {}, disconnect() {} }),
      diagnostics
    });
    let frameEvents = 0;
    const session = await renderer.mount({
      viewport: globalThis.document.getElementById("viewport"),
      blob: source.blob,
      entry: source.entry,
      asset: source.asset,
      request: {
        exerciseVariantId: source.entry.exerciseVariantId,
        animationId: source.entry.animationId,
        playbackSpeed: 1,
        cameraPreset: source.entry.defaultCamera.preset,
        mirrorMode: "none",
        reducedMotion: false
      },
      events: { frame() { frameEvents += 1; }, ended() {}, failed(error) { throw error ?? new Error("renderer failed"); } }
    });
    session.play();
    const scheduled = frames.entries().next().value;
    if (scheduled !== undefined) {
      frames.delete(scheduled[0]);
      scheduled[1](100);
    }
    session.pause();
    session.dispose();
    return { frameEvents, disposed: diagnostics.mounts === diagnostics.disposals };
  } finally {
    if (previous.window === undefined) Reflect.deleteProperty(globalThis, "window"); else globalThis.window = previous.window;
    if (previous.document === undefined) Reflect.deleteProperty(globalThis, "document"); else globalThis.document = previous.document;
    if (previous.HTMLCanvasElement === undefined) Reflect.deleteProperty(globalThis, "HTMLCanvasElement"); else globalThis.HTMLCanvasElement = previous.HTMLCanvasElement;
    if (previous.devicePixelRatio === undefined) Reflect.deleteProperty(globalThis, "devicePixelRatio"); else globalThis.devicePixelRatio = previous.devicePixelRatio;
    dom.window.close();
  }
}

export async function runPilotLifecycleEvidence() {
  return reproducePilot({ writeEvidence: false, consume: async (reproduction) => {
  const [storage, animationStore, opfs, media, backupModule] = await Promise.all([
    import(pathToFileURL(resolve("packages/storage/src/index.ts")).href),
    import(pathToFileURL(resolve("packages/storage/src/animation-pack/store.ts")).href),
    import(pathToFileURL(resolve("packages/storage/src/animation-pack/opfs.ts")).href),
    import(pathToFileURL(resolve("packages/media/src/gltf-renderer.ts")).href),
    import(pathToFileURL(resolve("packages/backup/src/index.ts")).href)
  ]);
  const root = new FakeDirectory("");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { storage: { estimate: async () => ({ quota: 250 * 1024 * 1024, usage: 0 }) } }
  });
  const backend = new opfs.OpfsAnimationPackBackend(Promise.resolve(root));
  const store = new animationStore.AnimationPackStore({ backend, now: () => "2026-09-05T12:00:00.000Z" });
  const releases = [];
  for (const release of reproduction.declarations.releases.releases) {
    const built = reproduction.first.get(release.version);
    const manifestBytes = Buffer.from(built.artifacts.get("animation-pack-manifest.json"));
    const descriptorBytes = Buffer.from(built.artifacts.get("animation-pack-release.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    releases.push({
      version: release.version,
      descriptor: descriptorBytes.toString("utf8"),
      descriptorBytes,
      manifestBytes,
      archive: Buffer.from(built.artifacts.get("animation-pack.zip")),
      archiveSha256: JSON.parse(descriptorBytes.toString("utf8")).archiveSha256,
      manifest,
      exacts: manifest.entries.map(({ exerciseVariantId, animationId }) => ({ exerciseVariantId, animationId })),
      assetPayloads: await Promise.all(manifest.assets.map(async (asset) => ({
        label: `${release.version}:${asset.path}`,
        bytes: Buffer.from(await readFile(join(built.sourceRoot, ...asset.path.split("/"))))
      })))
    });
  }
  const database = new storage.GymDatabase(`gym-local-animation-evidence-${crypto.randomUUID()}`);
  await storage.initializeDatabase(database);
  await storage.replaceAllData(personalSnapshot(), database);
  const phaseRecords = [];
  const objectStates = [];
  const benchmarkDiagnostics = media.createGltfRendererDiagnostics();
  let rendererFrameEvents = 0;
  let networkRequestAttempts = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { networkRequestAttempts += 1; throw new Error("network disabled"); };

  const phase = async (name, action) => {
    const beforePersonal = await storage.exportAllData(database);
    const before = { hash: hashPersonal(beforePersonal), counts: personalCounts(beforePersonal), serialized: stablePersonal(beforePersonal) };
    const status = await action();
    const afterPersonal = await storage.exportAllData(database);
    const after = { hash: hashPersonal(afterPersonal), counts: personalCounts(afterPersonal), serialized: stablePersonal(afterPersonal) };
    const objects = await objectState(root);
    objectStates.push({
      phase: name,
      state: status.state,
      activeVersion: status.state === "available" ? status.active.version : null,
      previousVersion: status.state === "available" && status.previous ? status.previous.version : null,
      ...objects
    });
    phaseRecords.push({ name, before, after, personalDataMutated: before.serialized !== after.serialized, status });
    return status;
  };

  let verifiedBlobCount = 0;
  let playedBlobCount = 0;
  const exactVariantIds = [];
  let exportedPersonal;
  try {
    await phase("install", () => store.install(releases[0].descriptor, new Blob([releases[0].archive])));
    const relaunched = new animationStore.AnimationPackStore({ backend, now: () => "2026-09-05T12:05:00.000Z" });
    await phase("offline-relaunch", async () => {
      const status = await relaunched.status();
      for (const exact of releases[0].exacts) {
        const source = await relaunched.readExactSource({ packId: "gym-local.animation-pilot-01", version: "1.0.0", ...exact });
        const sourceBytes = Buffer.from(await source.blob.arrayBuffer());
        if (source.blob.size === source.asset.byteSize && hashBuffer(sourceBytes) === source.asset.sha256) verifiedBlobCount += 1;
        exactVariantIds.push(source.entry.exerciseVariantId);
        const rendered = await renderSource(source, benchmarkDiagnostics);
        rendererFrameEvents += rendered.frameEvents;
        if (rendered.frameEvents > 0 && rendered.disposed) playedBlobCount += 1;
      }
      return status;
    });
    await phase("failed-update", async () => {
      const corruptArchive = Buffer.from(releases[1].archive);
      corruptArchive[Math.floor(corruptArchive.length / 2)] ^= 0xff;
      let rejected = false;
      try {
        await relaunched.install(releases[1].descriptor, new Blob([corruptArchive]));
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Corrupt update was not rejected.");
      return relaunched.status();
    });
    await phase("update", () => relaunched.install(releases[1].descriptor, new Blob([releases[1].archive])));
    await phase("rollback", () => relaunched.rollback());
    await phase("remove", () => relaunched.remove());
    exportedPersonal = await storage.exportAllData(database);
  } finally {
    if (previousFetch === undefined) Reflect.deleteProperty(globalThis, "fetch"); else globalThis.fetch = previousFetch;
    if (previousNavigator === undefined) Reflect.deleteProperty(globalThis, "navigator"); else Object.defineProperty(globalThis, "navigator", previousNavigator);
  }
  const backup = await backupModule.createBackup(exportedPersonal);
  const forbiddenArtifacts = releases.flatMap((release) => [
    { label: `${release.version}:descriptor`, bytes: release.descriptorBytes },
    { label: `${release.version}:manifest`, bytes: release.manifestBytes },
    { label: `${release.version}:archive`, bytes: release.archive },
    ...release.assetPayloads
  ]);
  const backupAudit = await backupExclusion(
    backup,
    ["gym-local.animation-pilot-01", "animation-pack.zip", "animation-pack-manifest.json", ...releases.map((release) => release.archiveSha256)],
    forbiddenArtifacts
  );
  database.close();
  await database.delete();
  const maxArchiveBytes = Math.max(1, ...releases.map((release) => release.archive.byteLength));
  const retainedArchiveMultiplier = Math.max(...objectStates.map((state) => state.archiveBytes / maxArchiveBytes));
  const resourceLeaks = Object.entries(benchmarkDiagnostics)
    .filter(([key]) => key.startsWith("active"))
    .reduce((total, [, value]) => total + value, 0);
  return {
    lifecycle: {
      backendKind: backend.constructor.name,
      releases: releases.map((release) => release.version),
      phases: phaseRecords,
      exactVariantIds: [...new Set(exactVariantIds)].sort(),
      verifiedBlobCount,
      playedBlobCount,
      networkRequestAttempts,
      textFallbackPreserved: /writtenFallback=\{\{/.test(await readFile("apps/web/src/pilot/AnimationPilotApp.tsx", "utf8")),
      rendererFrameEvents,
      objectStates
    },
    personalBackup: {
      phases: phaseRecords.map(({ name, before, after, personalDataMutated }) => ({
        name,
        beforeHash: before.hash,
        afterHash: after.hash,
        beforeCounts: before.counts,
        afterCounts: after.counts,
        personalDataMutated
      })),
      personalTablesChanged: phaseRecords.filter((record) => record.personalDataMutated).length,
      personalRecordCountDelta: phaseRecords.reduce((total, record) => total + Object.keys(record.after.counts).reduce((delta, key) => delta + record.after.counts[key] - record.before.counts[key], 0), 0),
      backupVersion: backupAudit.backupVersion,
      packBytesInBackup: backupAudit.forbiddenStringMatches.length > 0 || backupAudit.forbiddenByteMatches > 0,
      backupAudit
    },
    resourceMetrics: {
      retainedArchiveMultiplier,
      resourceLeaks,
      rendererDiagnostics: benchmarkDiagnostics,
      objectStates
    }
  };
  } });
}

export async function generateEvidence() {
  const { source } = await readPilotDeclarations();
  await mkdir(PILOT_EVIDENCE_ROOT, { recursive: true });
  if (!(await readFile(join(PILOT_EVIDENCE_ROOT, "release-reproducibility.json"), "utf8").catch(() => ""))) {
    await reproducePilot({ consume: (result) => result.report });
  }
  const rendererBenchmark = await runRendererBenchmark();
  const lifecycleEvidence = await runPilotLifecycleEvidence();
  const responsiveEvidence = await responsiveAutomationEvidence();
  const common = { schemaVersion: 1, packetId: "ANIMATION-PILOT-01-REV-02", status: "pass", optionalManualEvidence: [] };
  const priorPerformance = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "performance-report.json"), "utf8").catch(() => "{}"));
  await writeJson(join(PILOT_EVIDENCE_ROOT, "offline-rollback.json"), {
    ...common,
    scope: "automated OPFS lifecycle with relaunch and all exact Blob sources rendered through the media boundary",
    backendKind: lifecycleEvidence.lifecycle.backendKind,
    releases: lifecycleEvidence.lifecycle.releases,
    phases: lifecycleEvidence.lifecycle.phases.map((phase) => phase.name),
    exactVariantIds: lifecycleEvidence.lifecycle.exactVariantIds,
    verifiedBlobCount: lifecycleEvidence.lifecycle.verifiedBlobCount,
    playedBlobCount: lifecycleEvidence.lifecycle.playedBlobCount,
    rendererFrameEvents: lifecycleEvidence.lifecycle.rendererFrameEvents,
    objectStates: lifecycleEvidence.lifecycle.objectStates,
    exactIdentityRequired: true,
    networkRequestAttempts: lifecycleEvidence.lifecycle.networkRequestAttempts,
    textFallbackPreserved: lifecycleEvidence.lifecycle.textFallbackPreserved
  });
  await writeJson(join(PILOT_EVIDENCE_ROOT, "personal-data-isolation.json"), {
    ...common,
    phases: lifecycleEvidence.personalBackup.phases,
    personalTablesChanged: lifecycleEvidence.personalBackup.personalTablesChanged,
    personalRecordCountDelta: lifecycleEvidence.personalBackup.personalRecordCountDelta,
    backupVersion: lifecycleEvidence.personalBackup.backupVersion,
    packBytesInBackup: lifecycleEvidence.personalBackup.packBytesInBackup,
    backupAudit: lifecycleEvidence.personalBackup.backupAudit
  });
  await writeJson(join(PILOT_EVIDENCE_ROOT, "accessibility-automation.json"), {
    ...common,
    ...responsiveEvidence,
    humanVoiceOverClaimed: false
  });
  await writeJson(join(PILOT_EVIDENCE_ROOT, "performance-report.json"), {
    ...common,
    environment: "automated desktop build and deterministic renderer counters",
    physicalDeviceClaimed: false,
    budgets: { assetBytesMaximum: 4 * 1024 * 1024, totalAssetBytesMaximum: 24 * 1024 * 1024, retainedArchiveMultiplierMaximum: 3, resourceLeaksMaximum: 0 },
    measured: {
      variants: source.variants.length,
      releaseCount: 2,
      retainedArchiveMultiplier: lifecycleEvidence.resourceMetrics.retainedArchiveMultiplier,
      resourceLeaks: lifecycleEvidence.resourceMetrics.resourceLeaks,
      rendererSelected: rendererBenchmark.selected
    },
    resourceDerivation: lifecycleEvidence.resourceMetrics,
    ...(priorPerformance.pilotPwa ? { pilotPwa: priorPerformance.pilotPwa } : {}),
    ...(priorPerformance.defaultPwa ? { defaultPwa: priorPerformance.defaultPwa } : {})
  });
}

export async function validateEvidence({ regenerate = true } = {}) {
  if (regenerate) await generateEvidence();
  if (await sourceHasNetworkApi()) throw new Error("Runtime pilot source contains a forbidden network API.");
  for (const name of reportNames) {
    const value = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, name), "utf8"));
    if (value.packetId !== "ANIMATION-PILOT-01-REV-02" || value.status !== "pass") throw new Error(`${name} is not a passing pilot report.`);
    const serialized = JSON.stringify(value);
    if (serialized.includes("NaN") || serialized.includes("Infinity")) throw new Error(`${name} contains a non-finite value.`);
  }
  const benchmark = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "renderer-benchmark.json"), "utf8"));
  if (benchmark.selected !== "three-direct" || benchmark.candidates.length !== 3 || benchmark.candidates.some((candidate) => (
    candidate.workload.parsedAssets !== 240
    || candidate.workload.mountedAssets !== 240
    || candidate.workload.operationTrace.length !== 130
    || candidate.workload.remoteRequestAttempts !== 0
    || "timing" in candidate.workload
    || !(candidate.closureBytes > 0)
    || candidate.packages.some((item) => !item.versionMatches || !item.integrityMatches || !item.licenseMatches)
  ))) {
    throw new Error("Renderer benchmark did not record the comparable measured workload.");
  }
  if (benchmark.environment.timingPolicy !== "wall-clock timing is emitted only as a noncommitted, nonselection diagnostic") {
    throw new Error("Renderer benchmark does not declare the noncommitted timing policy.");
  }
  const lifecycle = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "offline-rollback.json"), "utf8"));
  if (
    lifecycle.backendKind !== "OpfsAnimationPackBackend"
    || lifecycle.exactVariantIds.length !== 12
    || lifecycle.verifiedBlobCount !== 12
    || lifecycle.playedBlobCount !== 12
    || lifecycle.rendererFrameEvents < 12
    || lifecycle.networkRequestAttempts !== 0
    || lifecycle.objectStates.at(-1)?.archiveObjectCount !== 0
  ) {
    throw new Error("Offline lifecycle evidence is not OPFS all-12 zero-network playback.");
  }
  const personal = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "personal-data-isolation.json"), "utf8"));
  if (
    personal.phases.length !== 6
    || personal.phases.some((phase) => phase.beforeHash !== phase.afterHash || JSON.stringify(phase.beforeCounts) !== JSON.stringify(phase.afterCounts))
    || personal.personalTablesChanged !== 0
    || personal.packBytesInBackup !== false
    || personal.backupAudit.forbiddenStringMatches.length !== 0
    || personal.backupAudit.forbiddenArtifactMatches.length !== 0
    || personal.backupAudit.checkedArtifacts.length !== 30
  ) {
    throw new Error("Personal-data or backup isolation evidence is not lifecycle-derived.");
  }
  const accessibility = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "accessibility-automation.json"), "utf8"));
  if (JSON.stringify(accessibility.widthsCssPx) !== JSON.stringify([320, 390]) || !accessibility.nativeKeyboardControls || !accessibility.politeAtomicStatus || !accessibility.writtenFallbackAlwaysPresent || !accessibility.reducedMotionStaticFrame || !accessibility.failureFallback) {
    throw new Error("Responsive automation evidence does not cover both required widths and fallback states.");
  }
  const performance = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "performance-report.json"), "utf8"));
  const archiveStates = performance.resourceDerivation.objectStates;
  const largestArchive = Math.max(...archiveStates.flatMap((state) => state.archiveFiles.map((file) => file.bytes)));
  const derivedMultiplier = Math.max(...archiveStates.map((state) => state.archiveBytes / largestArchive));
  const diagnostics = performance.resourceDerivation.rendererDiagnostics;
  const activeResources = Object.entries(diagnostics).filter(([key]) => key.startsWith("active")).reduce((total, [, value]) => total + value, 0);
  if (
    !Number.isFinite(performance.measured.retainedArchiveMultiplier)
    || !Number.isFinite(derivedMultiplier)
    || Math.abs(performance.measured.retainedArchiveMultiplier - derivedMultiplier) > Number.EPSILON
    || performance.measured.retainedArchiveMultiplier > performance.budgets.retainedArchiveMultiplierMaximum
    || performance.measured.resourceLeaks !== activeResources
    || performance.measured.resourceLeaks !== 0
    || diagnostics.mounts !== 12
    || diagnostics.disposals !== diagnostics.mounts
    || archiveStates.length !== 6
  ) {
    throw new Error("Retained archive or resource leak metrics are not derived from lifecycle operations.");
  }
  process.stdout.write(`PASS evidence schema: ${reportNames.length} reports\n`);
}

async function walk(root, prefix = "") {
  const rows = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) rows.push(...await walk(join(root, entry.name), path));
    else rows.push({ path, bytes: (await stat(join(root, entry.name))).size });
  }
  return rows;
}

export async function auditPilotPwa() {
  const root = resolve("outputs/animation-pilot-pwa");
  const files = await walk(root);
  const forbidden = files.filter((file) => /\.(?:glb|gltf|zip)$/i.test(file.path) || /animation-pack-(?:manifest|release)\.json$/i.test(file.path));
  if (forbidden.length) throw new Error(`Release bytes entered pilot PWA: ${forbidden.map((file) => file.path).join(", ")}`);
  const sw = await readFile(join(root, "sw.js"), "utf8");
  if (/\.glb|animation-pack\.zip|gym-local\.animation-pilot-01/.test(sw)) throw new Error("Animation pack bytes or identity entered the service-worker precache.");
  const oversizedJavascript = files.filter((file) => file.path.endsWith(".js") && file.bytes > 700 * 1024);
  if (oversizedJavascript.length) throw new Error(`Pilot JavaScript budget exceeded: ${oversizedJavascript.map((file) => file.path).join(", ")}`);
  const precachePaths = [...new Set([...sw.matchAll(/\{url:"([^"]+)"/g)].map((match) => match[1]))];
  const precacheBytes = (await Promise.all(precachePaths.map(async (path) => (await stat(join(root, path))).size))).reduce((total, bytes) => total + bytes, 0);
  if (precacheBytes > 4.5 * 1024 * 1024) throw new Error(`Pilot precache budget exceeded: ${precacheBytes}`);
  const performancePath = join(PILOT_EVIDENCE_ROOT, "performance-report.json");
  const performance = JSON.parse(await readFile(performancePath, "utf8"));
  performance.pilotPwa = { files: files.length, precacheBytes, maximumJavascriptBytes: Math.max(...files.filter((file) => file.path.endsWith(".js")).map((file) => file.bytes)), releasePayloadFiles: forbidden.length };
  await writeJson(performancePath, performance);
  process.stdout.write(`PASS pilot PWA audit: ${files.length} files, ${precacheBytes} precache bytes, zero release/precache payload\n`);
}

async function main([command]) {
  if (command === "validate") return validateEvidence();
  if (command === "audit-pwa") return auditPilotPwa();
  throw new Error("usage: animation-pilot-evidence.mjs <validate|audit-pwa>");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
