/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  OUTPUT_FILES,
  publishAnimationPack,
  readOutputArtifacts,
  sha256Bytes,
  validateAnimationPackSource
} from "./animation-pack-v1.mjs";

export const PILOT_ROOT = resolve("content/animation-packs/animation-pilot-01");
export const PILOT_OUTPUT_ROOT = resolve("outputs/animation-pilot");
export const PILOT_EVIDENCE_ROOT = resolve("docs/ai/evidence/ANIMATION-PILOT-01-REV-02");
export const EXPECTED_VARIANT_COUNT = 12;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 24 * 1024 * 1024;

const PILOT_INVOCATION_OWNER_FILE = ".animation-pilot-invocation-owner";
const PILOT_INVOCATION_OWNER_BYTES = Buffer.from("Gym Local animation pilot invocation ownership\n", "utf8");

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const cameraByPreset = {
  front: { position: [0, 1, 3], target: [0, 0.6, 0], fovDegrees: 42 },
  side: { position: [3, 1, 0], target: [0, 0.6, 0], fovDegrees: 42 },
  three_quarter: { position: [2.3, 1.4, 2.3], target: [0, 0.6, 0], fovDegrees: 42 }
};

function fail(message) {
  throw new Error(`animation-pilot: ${message}`);
}

function normalizedPhysicalPath(path) {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function objectIdentity(info) {
  return [info.dev, info.ino, info.mode].join(":");
}

function isStrictChild(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function pilotOutputBoundary() {
  const boundary = resolve(PILOT_OUTPUT_ROOT);
  if (boundary !== resolve("outputs/animation-pilot")) fail("unsafe output boundary");
  await mkdir(boundary, { recursive: true });
  const info = await lstat(boundary, { bigint: true });
  if (!info.isDirectory() || info.isSymbolicLink()) fail("output boundary must be a real directory");
  const physical = await realpath(boundary);
  if (normalizedPhysicalPath(physical) !== normalizedPhysicalPath(boundary)) fail("output boundary alias is forbidden");
  return { path: boundary, physical, identity: objectIdentity(info) };
}

async function createPilotInvocation() {
  const boundary = await pilotOutputBoundary();
  const root = await mkdtemp(join(boundary.path, "invocation-"));
  const info = await lstat(root, { bigint: true });
  const physical = await realpath(root);
  if (!info.isDirectory() || info.isSymbolicLink() || !isStrictChild(boundary.physical, physical)) fail("unsafe invocation output root");
  await writeFile(join(root, PILOT_INVOCATION_OWNER_FILE), PILOT_INVOCATION_OWNER_BYTES, { flag: "wx" });
  return { root, physical, identity: objectIdentity(info), boundary };
}

async function assertOwnedPilotInvocation(invocation) {
  const boundaryInfo = await lstat(invocation.boundary.path, { bigint: true }).catch(() => fail("output boundary changed"));
  const boundaryPhysical = await realpath(invocation.boundary.path).catch(() => fail("output boundary changed"));
  if (
    !boundaryInfo.isDirectory()
    || boundaryInfo.isSymbolicLink()
    || objectIdentity(boundaryInfo) !== invocation.boundary.identity
    || normalizedPhysicalPath(boundaryPhysical) !== normalizedPhysicalPath(invocation.boundary.physical)
  ) fail("output boundary changed");
  const info = await lstat(invocation.root, { bigint: true }).catch(() => fail("invocation output ownership changed"));
  const physical = await realpath(invocation.root).catch(() => fail("invocation output ownership changed"));
  if (
    !info.isDirectory()
    || info.isSymbolicLink()
    || objectIdentity(info) !== invocation.identity
    || normalizedPhysicalPath(physical) !== normalizedPhysicalPath(invocation.physical)
    || !isStrictChild(boundaryPhysical, physical)
  ) fail("invocation output ownership changed");
  const owner = await readFile(join(invocation.root, PILOT_INVOCATION_OWNER_FILE)).catch(() => fail("invocation output owner marker changed"));
  if (!owner.equals(PILOT_INVOCATION_OWNER_BYTES)) fail("invocation output owner marker changed");
}

async function cleanupPilotInvocation(invocation) {
  await assertOwnedPilotInvocation(invocation);
  await rm(invocation.root, { recursive: true });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(canonical(value), null, 2)}\n`, "utf8");
}

function align4(value) {
  return (value + 3) & ~3;
}

function floatBytes(values) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes;
}

export function createPilotGlb(variant, releaseSentinel, rigId = "rig.gym-local-pilot-v1") {
  const positions = floatBytes([-0.32, 0, 0, 0.32, 0, 0, 0, 0.82, 0]);
  const times = floatBytes([0, variant.durationSeconds / 2, variant.durationSeconds]);
  const translations = floatBytes([0, 0, 0, ...variant.motion, 0, 0, 0]);
  const binary = Buffer.concat([positions, times, translations]);
  const nodes = [
    { name: "rig.body", mesh: 0, extras: { role: "animated-body" } },
    ...variant.props.map((name, index) => ({ name, mesh: 0, translation: [index * 0.18 - 0.09, 0, -0.12], extras: { role: "equipment-prop" } }))
  ];
  const json = {
    asset: { version: "2.0", generator: "Gym Local animation pilot deterministic materializer", extras: { rigId, releaseSentinel } },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index), extras: { declaredProps: variant.props } }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 },
      { buffer: 0, byteOffset: positions.length, byteLength: times.length },
      { buffer: 0, byteOffset: positions.length + times.length, byteLength: translations.length }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.32, 0, 0], max: [0.32, 0.82, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "SCALAR", min: [0], max: [variant.durationSeconds] },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC3" }
    ],
    animations: [{
      name: variant.clipName,
      samplers: [{ input: 1, output: 2, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
    }]
  };
  const jsonBytes = textEncoder.encode(JSON.stringify(json));
  const paddedJsonLength = align4(jsonBytes.length);
  const jsonChunk = Buffer.alloc(paddedJsonLength, 0x20);
  Buffer.from(jsonBytes).copy(jsonChunk);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binary.length;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binHeader = 20 + jsonChunk.length;
  glb.writeUInt32LE(binary.length, binHeader);
  glb.writeUInt32LE(0x004e4942, binHeader + 4);
  binary.copy(glb, binHeader + 8);
  return glb;
}

export function inspectPilotGlb(bytes, expected) {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 28 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) fail("invalid GLB header");
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) fail("missing GLB JSON chunk");
  const json = JSON.parse(textDecoder.decode(buffer.subarray(20, 20 + jsonLength)).trimEnd());
  const binHeader = 20 + jsonLength;
  const binLength = buffer.readUInt32LE(binHeader);
  if (buffer.readUInt32LE(binHeader + 4) !== 0x004e4942 || binHeader + 8 + binLength !== buffer.length) fail("invalid GLB BIN chunk");
  if (json.asset?.version !== "2.0" || json.asset?.extras?.rigId !== "rig.gym-local-pilot-v1") fail("invalid rig metadata");
  if (json.asset.extras.releaseSentinel !== expected.releaseSentinel) fail("invalid release sentinel");
  if (json.buffers?.length !== 1 || "uri" in json.buffers[0]) fail("GLB must be self-contained");
  if (json.animations?.length !== 1 || json.animations[0].name !== expected.clipName) fail("clip identity mismatch");
  const props = json.nodes.filter((node) => node.extras?.role === "equipment-prop").map((node) => node.name);
  if (JSON.stringify([...props].sort()) !== JSON.stringify([...expected.props].sort())) fail(`prop-node mismatch: expected ${JSON.stringify(expected.props)}, received ${JSON.stringify(props)}`);
  const inputAccessor = json.accessors[json.animations[0].samplers[0].input];
  const inputView = json.bufferViews[inputAccessor.bufferView];
  const binary = buffer.subarray(binHeader + 8, binHeader + 8 + binLength);
  const values = Array.from({ length: inputAccessor.count }, (_, index) => binary.readFloatLE((inputView.byteOffset ?? 0) + index * 4));
  if (values.some((value) => !Number.isFinite(value)) || values.some((value, index) => index > 0 && value <= values[index - 1])) fail("animation time track is not finite and monotonic");
  const serialized = JSON.stringify(json);
  if (/"uri"\s*:/.test(serialized)) fail("external URI is forbidden");
  return { json, durationSeconds: values.at(-1), props, binarySha256: sha256Bytes(binary) };
}

export async function readPilotDeclarations() {
  const source = JSON.parse(await readFile(join(PILOT_ROOT, "source.json"), "utf8"));
  const releases = JSON.parse(await readFile(join(PILOT_ROOT, "releases.json"), "utf8"));
  if (source.schemaVersion !== 1 || source.packId !== "gym-local.animation-pilot-01" || source.variants?.length !== EXPECTED_VARIANT_COUNT) fail("source declaration count or identity mismatch");
  if (new Set(source.variants.map((variant) => variant.exerciseVariantId)).size !== EXPECTED_VARIANT_COUNT) fail("duplicate variant ID");
  if (new Set(source.variants.map((variant) => variant.animationId)).size !== EXPECTED_VARIANT_COUNT) fail("duplicate animation ID");
  if (JSON.stringify(releases.releases.map((release) => release.version)) !== JSON.stringify(["1.0.0", "1.0.1"])) fail("release matrix mismatch");
  return { source, releases };
}

function sourceUrl(path) {
  return `https://github.com/luutru433-coder/gym-local/blob/main/${path}`;
}

export async function materializeReleaseSource(root, source, release) {
  await mkdir(join(root, "assets"), { recursive: true });
  const reviewId = "review.automation.animation-pilot-01-rev-02";
  const licenseId = "license.mit-gym-local";
  const sources = [];
  const assets = [];
  const entries = [];
  for (const variant of source.variants) {
    const slug = variant.animationId.replace("animation.pilot-01.", "");
    const assetId = `asset.pilot-01.${slug}`;
    const sourceId = `source.pilot-01.${slug}`;
    const path = `assets/${slug}.glb`;
    const bytes = createPilotGlb(variant, release.sentinel, source.rigId);
    await writeFile(join(root, ...path.split("/")), bytes);
    sources.push({
      id: sourceId,
      author: source.author,
      sourceUrl: sourceUrl(source.sourcePath),
      licenseId,
      attribution: "Copyright (c) 2026 Gym Local contributors",
      modifications: `${release.modifications} Declarative record ${variant.exerciseVariantId}; sentinel ${release.sentinel}.`,
      reviewedAt: source.reviewedAt,
      reviewId
    });
    assets.push({ id: assetId, path, mediaType: "model/gltf-binary", compression: "none", rigId: source.rigId, sourceId, licenseId, durationSeconds: variant.durationSeconds });
    entries.push({
      animationId: variant.animationId,
      exerciseVariantId: variant.exerciseVariantId,
      animationCatalogVersion: 1,
      primary: true,
      assetId,
      assetPath: path,
      clipName: variant.clipName,
      durationSeconds: variant.durationSeconds,
      loop: { startSeconds: 0, endSeconds: variant.durationSeconds },
      defaultCamera: { preset: variant.camera, ...cameraByPreset[variant.camera] },
      equipmentProps: variant.props,
      accessibilityFallbackKey: `exercise.${variant.exerciseVariantId}.written-guidance`,
      sourceId,
      licenseId
    });
  }
  const packSource = {
    packId: source.packId,
    version: release.version,
    animationPackSchemaVersion: 1,
    animationPlayerProtocolVersion: 1,
    animationCatalogVersion: 1,
    minimumAppVersion: "0.7.0",
    releaseDate: release.releaseDate,
    createdAt: release.releaseDate,
    releaseReviewId: reviewId,
    reviews: [{ id: reviewId, reviewer: source.automationId, reviewedAt: source.reviewedAt, status: "approved" }],
    licenses: [{ id: licenseId, name: "MIT License", termsUrl: sourceUrl("content/animation-packs/animation-pilot-01/LICENSE.md"), redistributionScope: "offline", attribution: "Copyright (c) 2026 Gym Local contributors", reviewedAt: source.reviewedAt, reviewId }],
    sources,
    assets,
    entries
  };
  await writeFile(join(root, "pack-source.json"), canonicalBytes(packSource));
  return packSource;
}

async function buildPass(pass, declarations, outputRoot) {
  const result = new Map();
  for (const release of declarations.releases.releases) {
    const sourceRoot = join(outputRoot, `source-${pass}`, release.version);
    const releaseOutputRoot = join(outputRoot, `build-${pass}`, release.version);
    await materializeReleaseSource(sourceRoot, declarations.source, release);
    await validateAnimationPackSource(sourceRoot);
    await mkdir(dirname(releaseOutputRoot), { recursive: true });
    await publishAnimationPack(sourceRoot, releaseOutputRoot);
    const artifacts = await readOutputArtifacts(releaseOutputRoot);
    result.set(release.version, { sourceRoot, outputRoot: releaseOutputRoot, artifacts });
  }
  return result;
}

function artifactSummary(artifacts) {
  return Object.fromEntries(OUTPUT_FILES.map((name) => {
    const bytes = artifacts.get(name);
    return [name, { byteSize: bytes.length, sha256: sha256Bytes(bytes) }];
  }));
}

async function materializePilot(outputRoot, { writeEvidence }) {
  const declarations = await readPilotDeclarations();
  const first = await buildPass("a", declarations, outputRoot);
  const second = await buildPass("b", declarations, outputRoot);
  const releases = [];
  const semantics = new Map();
  for (const release of declarations.releases.releases) {
    const left = first.get(release.version).artifacts;
    const right = second.get(release.version).artifacts;
    for (const name of OUTPUT_FILES) if (!left.get(name).equals(right.get(name))) fail(`${release.version} ${name} is not reproducible`);
    const manifest = JSON.parse(left.get("animation-pack-manifest.json").toString("utf8"));
    let totalAssetBytes = 0;
    const assetSemantics = [];
    for (const asset of manifest.assets) {
      const assetBytes = await readFile(join(first.get(release.version).sourceRoot, ...asset.path.split("/")));
      totalAssetBytes += assetBytes.length;
      if (assetBytes.length > MAX_ASSET_BYTES) fail(`${asset.id} exceeds 4 MiB`);
      const entry = manifest.entries.find((candidate) => candidate.assetId === asset.id);
      const variant = declarations.source.variants.find((candidate) => candidate.animationId === entry?.animationId);
      if (!entry || !variant) fail(`${asset.id} has no exact declaration`);
      const inspected = inspectPilotGlb(assetBytes, { ...variant, releaseSentinel: release.sentinel });
      assetSemantics.push({ path: asset.path, json: inspected.json, binarySha256: inspected.binarySha256 });
    }
    if (totalAssetBytes > MAX_TOTAL_ASSET_BYTES) fail(`${release.version} assets exceed 24 MiB`);
    semantics.set(release.version, { manifest, assetSemantics });
    releases.push({ version: release.version, sentinel: release.sentinel, entries: manifest.entries.length, assets: manifest.assets.length, totalAssetBytes, artifacts: artifactSummary(left) });
  }
  const normalizeManifest = (value) => {
    const normalized = structuredClone(value);
    normalized.version = "<release-version>";
    for (const source of normalized.sources) source.modifications = "<declared-release-sentinel-and-metadata>";
    for (const asset of normalized.assets) {
      asset.byteSize = 1;
      asset.sha256 = "0".repeat(64);
    }
    return normalized;
  };
  const baseline = semantics.get("1.0.0");
  const update = semantics.get("1.0.1");
  if (JSON.stringify(normalizeManifest(baseline.manifest)) !== JSON.stringify(normalizeManifest(update.manifest))) fail("release manifests differ outside declared version/sentinel metadata");
  for (const left of baseline.assetSemantics) {
    const right = update.assetSemantics.find((candidate) => candidate.path === left.path);
    if (!right || left.binarySha256 !== right.binarySha256) fail(`${left.path} geometry/keyframes differ between releases`);
    const leftJson = structuredClone(left.json);
    const rightJson = structuredClone(right.json);
    leftJson.asset.extras.releaseSentinel = "<release-sentinel>";
    rightJson.asset.extras.releaseSentinel = "<release-sentinel>";
    if (JSON.stringify(leftJson) !== JSON.stringify(rightJson)) fail(`${left.path} differs outside its release sentinel`);
  }
  const report = { schemaVersion: 1, packetId: "ANIMATION-PILOT-01-REV-02", status: "pass", buildsPerRelease: 2, differencePolicy: "semantic version plus declared release sentinel/provenance metadata only", differencePolicyValidated: true, releases };
  if (writeEvidence) {
    await mkdir(PILOT_EVIDENCE_ROOT, { recursive: true });
    await writeFile(join(PILOT_EVIDENCE_ROOT, "release-reproducibility.json"), canonicalBytes(report));
    await writeFile(join(PILOT_EVIDENCE_ROOT, "license-audit.json"), canonicalBytes({
      schemaVersion: 1,
      packetId: report.packetId,
      status: "pass",
      authoredAssets: 24,
      author: declarations.source.author,
      sourcePath: declarations.source.sourcePath,
      license: "MIT",
      redistributionScope: declarations.releases.redistributionScope,
      attribution: declarations.releases.attribution,
      automationId: declarations.source.automationId,
      optionalHumanReviewClaimed: false,
      selectedDependency: { name: "three", version: "0.185.1", integrity: "sha512-5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==", license: "MIT", dependencyCount: 0 }
    }));
  }
  return { declarations, first, second, report };
}

export async function reproducePilot({ writeEvidence = true, hooks, consume } = {}) {
  if (typeof consume !== "function") fail("reproduction consumer callback is required");
  const invocation = await createPilotInvocation();
  try {
    await hooks?.afterOutputPrepared?.(invocation.root);
    const reproduction = await materializePilot(invocation.root, { writeEvidence });
    return await consume(reproduction, { outputRoot: invocation.root });
  } finally {
    await cleanupPilotInvocation(invocation);
  }
}

export async function validatePilot() {
  const report = await reproducePilot({ writeEvidence: false, consume: (result) => result.report });
  process.stdout.write(`VALID ${report.releases.length} releases, ${EXPECTED_VARIANT_COUNT} exact variants, deterministic self-contained GLB\n`);
}

async function main(argv = process.argv.slice(2)) {
  const [command] = argv;
  if (command === "validate") return validatePilot();
  if (command === "repro") {
    const report = await reproducePilot({ consume: (result) => result.report });
    process.stdout.write(`PASS reproducibility ${createHash("sha256").update(JSON.stringify(report)).digest("hex")}\n`);
    return;
  }
  fail("usage: animation-pilot-assets.mjs <validate|repro>");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
