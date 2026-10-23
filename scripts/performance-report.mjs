/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const KIB = 1024;
const MIB = KIB * KIB;
const distRoot = resolve(process.argv[2] ?? "dist");
const reportPath = join(distRoot, "reports", "performance-report.json");
const budgets = {
  entryChunkBytes: 220 * KIB,
  routeChunkBytes: 80 * KIB,
  vendorChunkBytes: 500 * KIB,
  workerChunkBytes: 250 * KIB,
  initialGraphBytes: 650 * KIB,
  precacheBytes: 3.5 * MIB
};

const manifest = JSON.parse(await readFile(join(distRoot, ".vite", "manifest.json"), "utf8"));
const serviceWorker = await readFile(join(distRoot, "sw.js"), "utf8");
const assetEntries = await readdir(join(distRoot, "assets"));
const bytes = async (path) => (await stat(join(distRoot, path))).size;
const manifestEntry = manifest["index.html"];
if (!manifestEntry?.isEntry) throw new Error("Vite entry is missing from dist/.vite/manifest.json");

async function importedGraph(entryKey) {
  const seen = new Set();
  const visit = async (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const dependency of manifest[key]?.imports ?? []) await visit(dependency);
  };
  await visit(entryKey);
  return Promise.all([...seen].map(async (key) => ({ key, file: manifest[key].file, bytes: await bytes(manifest[key].file) })));
}

const initialGraph = await importedGraph("index.html");
const routeChunks = await Promise.all(Object.entries(manifest)
  .filter(([, entry]) => entry.isDynamicEntry)
  .map(async ([key, entry]) => ({ key, file: entry.file, bytes: await bytes(entry.file) })));
const vendorChunks = await Promise.all(Object.entries(manifest)
  .filter(([key]) => key.startsWith("_vendor-"))
  .map(async ([key, entry]) => ({ key, file: entry.file, bytes: await bytes(entry.file) })));
const workerChunks = await Promise.all(assetEntries
  .filter((file) => /worker.*\.js$/i.test(file))
  .map(async (file) => ({ file: `assets/${file}`, bytes: await bytes(`assets/${file}`) })));
const precachePaths = [...new Set([...serviceWorker.matchAll(/\{url:"([^"]+)"/g)].map((match) => match[1]))];
const precacheAssets = await Promise.all(precachePaths.map(async (file) => ({ file, bytes: await bytes(file) })));
const precacheBytes = precacheAssets.reduce((total, asset) => total + asset.bytes, 0);
const initialGraphBytes = initialGraph.reduce((total, asset) => total + asset.bytes, 0);
const requiredOfflineFiles = [...new Set(Object.values(manifest)
  .filter((entry) => entry.isEntry || entry.isDynamicEntry)
  .flatMap((entry) => [entry.file, ...(entry.css ?? [])]))];
const missingOfflineFiles = requiredOfflineFiles.filter((file) => !precachePaths.includes(file));
const failures = [];
const defaultPilotModules = Object.keys(manifest).filter((key) => /(?:src[\\/]pilot|gltf-renderer)/i.test(key));
const defaultJavascript = await Promise.all(assetEntries.filter((file) => file.endsWith(".js")).map((file) => readFile(join(distRoot, "assets", file), "utf8")));
const defaultPilotIdentityPresent = defaultJavascript.some((source) => source.includes("gym-local.animation-pilot-01") || source.includes("ANIMATION-PILOT-01-REV-02"));

function enforce(label, actual, maximum) {
  if (actual > maximum) failures.push(`${label}: ${actual} bytes exceeds ${maximum}`);
}

enforce("Entry chunk", await bytes(manifestEntry.file), budgets.entryChunkBytes);
enforce("Initial JS graph", initialGraphBytes, budgets.initialGraphBytes);
enforce("PWA precache", precacheBytes, budgets.precacheBytes);
for (const chunk of routeChunks) enforce(`Route ${chunk.key}`, chunk.bytes, budgets.routeChunkBytes);
for (const chunk of vendorChunks) enforce(`Vendor ${chunk.key}`, chunk.bytes, budgets.vendorChunkBytes);
for (const chunk of workerChunks) enforce(`Worker ${chunk.file}`, chunk.bytes, budgets.workerChunkBytes);
if (assetEntries.some((file) => file.endsWith(".map"))) failures.push("Production source maps must not be emitted");
if (/gym-local-nutrition.*\.sqlite3/i.test(serviceWorker)) failures.push("Nutrition SQLite pack entered the PWA precache");
if (/youtube(?:-nocookie)?\.com|youtu\.be/i.test(serviceWorker)) failures.push("Remote video URL entered the PWA precache");
if (precachePaths.includes("og-gym-local.png")) failures.push("Social preview image entered the PWA precache");
if (defaultPilotModules.length || defaultPilotIdentityPresent) failures.push("Pilot or renderer code entered the default production build");
if (/\.glb|animation-pack\.zip|gym-local\.animation-pilot-01/.test(serviceWorker)) failures.push("Animation pack bytes entered the PWA precache");
for (const file of missingOfflineFiles) failures.push(`Core route asset is missing from the PWA precache: ${file}`);

const report = {
  generatedAt: new Date().toISOString(),
  status: failures.length ? "fail" : "pass",
  budgets,
  measurements: {
    entryChunk: { file: manifestEntry.file, bytes: await bytes(manifestEntry.file) },
    initialGraphBytes,
    precacheBytes,
    precacheEntries: precachePaths.length,
    routeChunks,
    vendorChunks,
    workerChunks
  },
  safeguards: {
    sourceMapsExcluded: !assetEntries.some((file) => file.endsWith(".map")),
    nutritionPackExcluded: !/gym-local-nutrition.*\.sqlite3/i.test(serviceWorker),
    remoteVideoExcluded: !/youtube(?:-nocookie)?\.com|youtu\.be/i.test(serviceWorker),
    socialPreviewExcluded: !precachePaths.includes("og-gym-local.png"),
    coreRoutesPrecached: missingOfflineFiles.length === 0
    , animationPilotExcludedFromDefaultBuild: defaultPilotModules.length === 0 && !defaultPilotIdentityPresent
    , animationPackExcludedFromPrecache: !/\.glb|animation-pack\.zip|gym-local\.animation-pilot-01/.test(serviceWorker)
  },
  failures
};

await mkdir(join(distRoot, "reports"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const pilotEvidencePath = resolve("docs/ai/evidence/ANIMATION-PILOT-01-REV-02/performance-report.json");
const pilotEvidence = await readFile(pilotEvidencePath, "utf8").then(JSON.parse).catch(() => undefined);
if (pilotEvidence?.packetId === "ANIMATION-PILOT-01-REV-02") {
  const archiveStates = pilotEvidence.resourceDerivation?.objectStates ?? [];
  const archiveSizes = archiveStates.flatMap((state) => state.archiveFiles?.map((file) => file.bytes) ?? []);
  const largestArchive = Math.max(...archiveSizes);
  const retainedArchiveMultiplier = Math.max(...archiveStates.map((state) => state.archiveBytes / largestArchive));
  const diagnostics = pilotEvidence.resourceDerivation?.rendererDiagnostics ?? {};
  const resourceLeaks = Object.entries(diagnostics)
    .filter(([key]) => key.startsWith("active"))
    .reduce((total, [, value]) => total + value, 0);
  if (
    !Number.isFinite(retainedArchiveMultiplier)
    || Math.abs(retainedArchiveMultiplier - pilotEvidence.measured?.retainedArchiveMultiplier) > Number.EPSILON
    || resourceLeaks !== pilotEvidence.measured?.resourceLeaks
    || diagnostics.mounts !== diagnostics.disposals
  ) {
    throw new Error("Pilot retained-archive or renderer-resource evidence is not operation-derived.");
  }
  const historicalDefaultPwa = pilotEvidence.defaultPwa;
  if (
    !Number.isFinite(historicalDefaultPwa?.entryChunkBytes)
    || historicalDefaultPwa.entryChunkBytes > budgets.entryChunkBytes
    || !Number.isFinite(historicalDefaultPwa.initialGraphBytes)
    || historicalDefaultPwa.initialGraphBytes > budgets.initialGraphBytes
    || !Number.isFinite(historicalDefaultPwa.precacheBytes)
    || historicalDefaultPwa.precacheBytes > budgets.precacheBytes
    || !Number.isInteger(historicalDefaultPwa.precacheEntries)
    || historicalDefaultPwa.precacheEntries < 1
    || historicalDefaultPwa.pilotModules !== 0
    || historicalDefaultPwa.pilotIdentityPresent !== false
    || historicalDefaultPwa.animationPackPrecachePresent !== false
  ) {
    throw new Error("Historical pilot default-PWA evidence is missing or violates the current build safeguards.");
  }
}
console.log(`${report.status.toUpperCase()} performance: entry ${(report.measurements.entryChunk.bytes / KIB).toFixed(1)} KiB, initial graph ${(initialGraphBytes / KIB).toFixed(1)} KiB, precache ${(precacheBytes / KIB).toFixed(1)} KiB`);
console.log(`Report: ${reportPath}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exit(1);
}
