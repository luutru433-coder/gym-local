/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import JSZip from "jszip";
import {
  MANIFEST_ARCHIVE_PATH,
  OUTPUT_FILES,
  RESOURCE_LIMITS,
  assertPackResourceLimits,
  canonicalJsonBytes,
  classifySourceEntryKind,
  createAnimationPackArtifacts,
  parseStrictJsonBytes,
  publishAnimationPack,
  readOutputArtifacts,
  sha256Bytes,
  stagingPathFor,
  validateAnimationPackSource,
  validateGlbEnvelope,
  validateGltfEnvelope,
  validatePortableAssetPath,
  verifyBuiltArtifacts,
  verifyRawZip
} from "./animation-pack-v1.mjs";

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), "..");
const fixtureRoot = join(repositoryRoot, "tests", "fixtures", "animation-pack-v1", "valid");
const fixtureSourcePath = join(fixtureRoot, "pack-source.json");
const fixtureBase64Path = join(fixtureRoot, "assets", "synthetic-minimal.glb.base64");
const cliPath = join(repositoryRoot, "scripts", "build-animation-pack-v1.mjs");
const requireFromTest = createRequire(import.meta.url);

async function freshDirectory(prefix = "gym-local-f03-") {
  return mkdtemp(join(tmpdir(), prefix));
}

async function fixtureObject() {
  return JSON.parse(await readFile(fixtureSourcePath, "utf8"));
}

async function writeSource(root, source, options = {}) {
  source ??= await fixtureObject();
  await mkdir(join(root, "assets"), { recursive: true });
  const bytes = Buffer.from((await readFile(fixtureBase64Path, "utf8")).trim(), "base64");
  if (options.assetFirst !== false) await writeFile(join(root, "assets", "synthetic-minimal.glb"), bytes);
  await writeFile(join(root, "pack-source.json"), options.rawSource ?? `${JSON.stringify(source, null, options.pretty === false ? 0 : 2)}\n`, "utf8");
  if (options.assetFirst === false) await writeFile(join(root, "assets", "synthetic-minimal.glb"), bytes);
  return { source, bytes };
}

async function withTemporaryDirectory(callback) {
  const root = await freshDirectory();
  try { return await callback(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function artifactsForSource(sourceRoot) {
  return createAnimationPackArtifacts(await validateAnimationPackSource(sourceRoot));
}

function runCli(arguments_, environment = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [cliPath, ...arguments_], {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("close", (code) => resolvePromise({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
  });
}

function expectFailure(action, code) {
  return assert.rejects(action, (error) => {
    assert.equal(error?.code, code, error?.stack);
    return true;
  });
}

function cloneArtifacts(artifacts) {
  return new Map([...artifacts].map(([name, bytes]) => [name, Buffer.from(bytes)]));
}

function digestTuple(artifacts) {
  return OUTPUT_FILES.map((name) => `${artifacts.get(name).length}:${sha256Bytes(artifacts.get(name))}`).join("|");
}

function glbWithBinPayload(payload) {
  const json = Buffer.from('{"asset":{"version":"2.0"}} ', "utf8");
  const bin = Buffer.from(payload);
  assert.equal(json.length % 4, 0);
  assert.equal(bin.length % 4, 0);
  const bytes = Buffer.alloc(12 + 8 + json.length + 8 + bin.length);
  bytes.write("glTF", 0, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  const binHeader = 20 + json.length;
  bytes.writeUInt32LE(bin.length, binHeader);
  bytes.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(bytes, binHeader + 8);
  return bytes;
}

async function sourceForGltfAssets(count) {
  const source = await fixtureObject();
  const template = source.assets[0];
  source.assets = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(template),
    id: `asset.foundation-03-budget-${index}`,
    path: `assets/budget-${index}.gltf`,
    mediaType: "model/gltf+json"
  }));
  source.entries[0].assetId = source.assets[0].id;
  source.entries[0].assetPath = source.assets[0].path;
  return source;
}

async function writeGltfAssetSource(root, count, bytesOrSize) {
  const source = await sourceForGltfAssets(count);
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "pack-source.json"), `${JSON.stringify(source, null, 2)}\n`);
  for (const asset of source.assets) {
    const path = join(root, ...asset.path.split("/"));
    if (Buffer.isBuffer(bytesOrSize)) {
      await writeFile(path, bytesOrSize);
    } else {
      const handle = await open(path, "w");
      try { await handle.truncate(bytesOrSize); } finally { await handle.close(); }
    }
  }
  return source;
}

function errorFingerprint(error) {
  return { code: error?.code, message: error?.message };
}

async function createJunction(target, path, context) {
  try {
    await symlink(target, path, "junction");
    return true;
  } catch (error) {
    if (error?.code === "EPERM") {
      context.diagnostic(`junction creation unavailable for ${path}`);
      return false;
    }
    throw error;
  }
}

test("fixture is tiny, project-authored text that decodes to the exact reviewed GLB envelope", async () => {
  const base64Text = await readFile(fixtureBase64Path, "utf8");
  assert.match(base64Text, /^[A-Za-z0-9+/]+={0,2}\n$/);
  const bytes = Buffer.from(base64Text.trim(), "base64");
  assert.equal(bytes.length, 48);
  assert.equal(bytes.toString("hex"), "676c544602000000300000001c0000004a534f4e7b226173736574223a7b2276657273696f6e223a22322e30227d7d20");
  validateGlbEnvelope(bytes);
  const readme = await readFile(join(fixtureRoot, "..", "README.md"), "utf8");
  const normalizedReadme = readme.toLowerCase().replace(/\s+/g, " ");
  for (const evidence of ["gym local contributors", "mit license", "no scraped", "48 bytes", "no playable exercise animation"]) assert.ok(normalizedReadme.includes(evidence));
  assert.ok((await stat(fixtureBase64Path)).size < 100);
});

test("two independent builds publish byte-identical canonical manifest, ZIP, and descriptor", async () => {
  await withTemporaryDirectory(async (root) => {
    const sourceA = join(root, "source-a");
    const sourceB = join(root, "source-b");
    const outputA = join(root, "output-a");
    const outputB = join(root, "output-b");
    await writeSource(sourceA, await fixtureObject(), { assetFirst: true });
    await writeSource(sourceB, await fixtureObject(), { assetFirst: false, pretty: false });
    await publishAnimationPack(sourceA, outputA);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    await publishAnimationPack(sourceB, outputB);
    const a = await readOutputArtifacts(outputA);
    const b = await readOutputArtifacts(outputB);
    assert.deepEqual([...a.keys()], OUTPUT_FILES);
    for (const name of OUTPUT_FILES) assert.ok(a.get(name).equals(b.get(name)), name);
  });
});

test("cross-process determinism survives TZ/locale, array/object order, creation order, and elapsed time", async () => {
  await withTemporaryDirectory(async (root) => {
    const original = await fixtureObject();
    const expanded = structuredClone(original);
    expanded.reviews.push({ ...expanded.reviews[0], id: "review.foundation-03-secondary", reviewer: "Secondary fixture reviewer" });
    expanded.licenses.push({ ...expanded.licenses[0], id: "license.secondary", reviewId: "review.foundation-03-secondary" });
    expanded.sources.push({ ...expanded.sources[0], id: "source.secondary", licenseId: "license.secondary", reviewId: "review.foundation-03-secondary" });
    expanded.entries[0].equipmentProps = ["zeta", "alpha"];
    const reversed = Object.fromEntries(Object.entries(expanded).reverse());
    reversed.reviews = [...expanded.reviews].reverse();
    reversed.licenses = [...expanded.licenses].reverse();
    reversed.sources = [...expanded.sources].reverse();
    reversed.entries = [...expanded.entries].reverse();
    const matrix = [
      { source: expanded, env: { TZ: "UTC", LANG: "C", LC_ALL: "C" }, assetFirst: true },
      { source: reversed, env: { TZ: "Pacific/Honolulu", LANG: "vi_VN.UTF-8", LC_ALL: "vi_VN.UTF-8" }, assetFirst: false },
      { source: expanded, env: { TZ: "Asia/Bangkok", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" }, assetFirst: false }
    ];
    const tuples = [];
    for (let index = 0; index < matrix.length; index += 1) {
      const source = join(root, `source-${index}`);
      const output = join(root, `output-${index}`);
      await writeSource(source, matrix[index].source, { assetFirst: matrix[index].assetFirst, pretty: index !== 1 });
      const result = await runCli(["build", "--source", source, "--output", output], matrix[index].env);
      assert.equal(result.code, 0, result.stderr);
      tuples.push(digestTuple(await readOutputArtifacts(output)));
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 15));
    }
    assert.equal(new Set(tuples).size, 1);
  });
});

test("canonical JSON recursively sorts keys, preserves Unicode, and has one LF", () => {
  const first = canonicalJsonBytes({ z: 0, unicode: "Việt", decimal: 1.25, nested: { y: true, a: null } });
  const second = canonicalJsonBytes({ nested: { a: null, y: true }, decimal: 1.25, unicode: "Việt", z: 0 });
  assert.ok(first.equals(second));
  assert.equal(first.toString("utf8"), '{"decimal":1.25,"nested":{"a":null,"y":true},"unicode":"Việt","z":0}\n');
  assert.equal(first.at(-1), 10);
  assert.equal(first.includes(13), false);
  assert.deepEqual(parseStrictJsonBytes(first), JSON.parse(first));
  assert.throws(() => canonicalJsonBytes({ value: -0 }), /noncanonical_number/);
  assert.throws(() => canonicalJsonBytes({ value: Number.NaN }), /noncanonical_number/);
  assert.throws(() => canonicalJsonBytes({ value: Number.POSITIVE_INFINITY }), /noncanonical_number/);
  assert.throws(() => canonicalJsonBytes({ 1: "integer key" }), /integer_like_key/);
  const sparse = new Array(1);
  assert.throws(() => canonicalJsonBytes(sparse), /noncanonical_array/);
});

test("strict JSON rejects missing/malformed/BOM/duplicate-key/non-object/unknown source data", async () => {
  assert.throws(() => parseStrictJsonBytes(Buffer.from('{"a":1,"a":2}')), /duplicate_json_key/);
  assert.throws(() => parseStrictJsonBytes(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), /utf8_bom/);
  assert.throws(() => parseStrictJsonBytes(Buffer.from([0xc3, 0x28])), /invalid_utf8/);
  assert.throws(() => parseStrictJsonBytes(Buffer.from("{broken")), /malformed_json/);
  await withTemporaryDirectory(async (root) => {
    await mkdir(join(root, "assets"));
    await expectFailure(() => validateAnimationPackSource(root), "missing_pack_source");
  });
  for (const raw of ["null\n", "[]\n", '{"packId":"x","packId":"y"}\n']) {
    await withTemporaryDirectory(async (root) => {
      await writeSource(root, await fixtureObject(), { rawSource: raw });
      await assert.rejects(() => validateAnimationPackSource(root));
    });
  }
  await withTemporaryDirectory(async (root) => {
    const source = await fixtureObject();
    source.unreviewed = true;
    await writeSource(root, source);
    await expectFailure(() => validateAnimationPackSource(root), "unknown_source_field");
  });
  await withTemporaryDirectory(async (root) => {
    const source = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(await fixtureObject()))]);
    await writeSource(root, await fixtureObject(), { rawSource: source });
    await expectFailure(() => validateAnimationPackSource(root), "utf8_bom");
  });
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    await rm(join(root, "pack-source.json"));
    await mkdir(join(root, "pack-source.json"));
    await expectFailure(() => validateAnimationPackSource(root), "missing_pack_source");
  });
});

test("unsupported/schema-invalid sources, empty assets, and duplicate mapping identities fail closed", async () => {
  const mutations = [
    (source) => { source.animationPackSchemaVersion = 2; },
    (source) => { source.animationPlayerProtocolVersion = 2; },
    (source) => { source.animationCatalogVersion = 2; },
    (source) => { source.minimumAppVersion = "99.0.0"; },
    (source) => { source.assets[0].compression = "deflate"; },
    (source) => { source.assets[0].mediaType = "video/mp4"; },
    (source) => { source.entries.push({ ...structuredClone(source.entries[0]), exerciseVariantId: "fixture_movement__dumbbell" }); },
    (source) => { source.entries.push({ ...structuredClone(source.entries[0]), animationId: "animation.foundation-03-other" }); }
  ];
  for (const mutate of mutations) {
    await withTemporaryDirectory(async (root) => {
      const source = await fixtureObject();
      mutate(source);
      await writeSource(root, source);
      await assert.rejects(() => artifactsForSource(root));
    });
  }
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    await writeFile(join(root, "assets", "synthetic-minimal.glb"), Buffer.alloc(0));
    await expectFailure(() => validateAnimationPackSource(root), "empty_asset");
  });
});

test("source and record resource limits reject at the boundary without large allocation", () => {
  assert.doesNotThrow(() => assertPackResourceLimits({ sourceJsonBytes: RESOURCE_LIMITS.sourceJsonBytes, assetCount: RESOURCE_LIMITS.assetCount, entryCount: RESOURCE_LIMITS.entryCount, recordCount: RESOURCE_LIMITS.recordCount, totalAssetBytes: RESOURCE_LIMITS.totalAssetBytes }));
  for (const [field, value, code] of [
    ["sourceJsonBytes", RESOURCE_LIMITS.sourceJsonBytes + 1, "source_json_too_large"],
    ["assetCount", RESOURCE_LIMITS.assetCount + 1, "asset_count_limit"],
    ["entryCount", RESOURCE_LIMITS.entryCount + 1, "entry_count_limit"],
    ["recordCount", RESOURCE_LIMITS.recordCount + 1, "record_count_limit"],
    ["totalAssetBytes", RESOURCE_LIMITS.totalAssetBytes + 1, "total_asset_bytes_limit"]
  ]) {
    const input = { sourceJsonBytes: 1, assetCount: 1, entryCount: 1, recordCount: 1, totalAssetBytes: 1, [field]: value };
    assert.throws(() => assertPackResourceLimits(input), new RegExp(code));
  }
});

test("asset size preflight rejects an exceeding asset before any asset read and accepts the exact aggregate boundary", async () => {
  await withTemporaryDirectory(async (root) => {
    await writeGltfAssetSource(root, 5, RESOURCE_LIMITS.assetBytes);
    let reads = 0;
    let preflight;
    await expectFailure(() => validateAnimationPackSource(root, { hooks: {
      afterAssetSizePreflight(plan) { preflight = plan; },
      afterAssetRead() { reads += 1; }
    } }), "total_asset_bytes_limit");
    assert.equal(reads, 0);
    assert.equal(preflight, undefined);
  });
  await withTemporaryDirectory(async (root) => {
    const prefix = Buffer.from('{"asset":{"version":"2.0"},"extras":{"padding":"');
    const suffix = Buffer.from('"}}');
    const validLargeGltf = Buffer.concat([
      prefix,
      Buffer.alloc(RESOURCE_LIMITS.assetBytes - prefix.length - suffix.length, 0x61),
      suffix
    ]);
    assert.equal(validLargeGltf.length, RESOURCE_LIMITS.assetBytes);
    await writeGltfAssetSource(root, 4, validLargeGltf);
    let reads = 0;
    const validated = await validateAnimationPackSource(root, { hooks: { afterAssetRead() { reads += 1; } } });
    assert.equal(reads, 4);
    assert.equal([...validated.assetBytes.values()].reduce((total, bytes) => total + bytes.length, 0), RESOURCE_LIMITS.totalAssetBytes);
  });
  await withTemporaryDirectory(async (root) => {
    await writeGltfAssetSource(root, 1, RESOURCE_LIMITS.assetBytes + 1);
    let reads = 0;
    await expectFailure(() => validateAnimationPackSource(root, { hooks: { afterAssetRead() { reads += 1; } } }), "asset_byte_limit");
    assert.equal(reads, 0);
  });
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    await expectFailure(() => validateAnimationPackSource(root, { hooks: {
      async afterAssetSizePreflight() {
        const path = join(root, "assets", "synthetic-minimal.glb");
        const replacement = `${path}.replacement`;
        await copyFile(path, replacement);
        await unlink(path);
        await rename(replacement, path);
      }
    } }), "source_changed");
  });
});

test("path policy rejects traversal, delimiters, reserved devices, overlong paths, and collisions before normalization", () => {
  const invalid = [
    "/assets/a.glb", "C:/a.glb", "https://example.test/a.glb", "assets\\a.glb", "assets/./a.glb",
    "assets/../a.glb", "assets//a.glb", "assets/%2e%2e/a.glb", "assets/%2f.glb", "assets/a.glb?x",
    "assets/a.glb#x", "assets/a\u0000.glb", "assets/CON.glb", "assets/name .glb", "assets/Upper.glb",
    `assets/${"a".repeat(RESOURCE_LIMITS.pathBytes)}.glb`, MANIFEST_ARCHIVE_PATH
  ];
  for (const path of invalid) assert.throws(() => validatePortableAssetPath(path), undefined, path);
});

test("declaration and live inventory reject duplicate, case, Unicode, missing, undeclared, and reserved paths", async () => {
  const cases = [
    ["duplicate_path", (source) => source.assets.push(structuredClone(source.assets[0]))],
    ["case_path_collision", (source) => source.assets.push({ ...structuredClone(source.assets[0]), id: "asset.case", path: "assets/SYNTHETIC-minimal.glb" })],
    ["unicode_path_collision", (source) => {
      source.assets[0].path = "assets/café.glb";
      source.assets.push({ ...structuredClone(source.assets[0]), id: "asset.unicode", path: "assets/café.glb" });
    }],
    ["reserved_path_collision", (source) => { source.assets[0].path = MANIFEST_ARCHIVE_PATH; }]
  ];
  for (const [code, mutate] of cases) {
    await withTemporaryDirectory(async (root) => {
      const source = await fixtureObject();
      mutate(source);
      await writeSource(root, source);
      await expectFailure(() => validateAnimationPackSource(root), code);
    });
  }
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    await writeFile(join(root, "assets", "undeclared.glb"), "x");
    await expectFailure(() => validateAnimationPackSource(root), "asset_inventory_mismatch");
  });
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    await rm(join(root, "assets", "synthetic-minimal.glb"));
    await expectFailure(() => validateAnimationPackSource(root), "asset_inventory_mismatch");
  });
});

test("symlink, junction/reparse link, and special/non-regular source entries fail closed", async (context) => {
  assert.throws(() => classifySourceEntryKind({ isSymbolicLink: () => false, isDirectory: () => false, isFile: () => false }, "synthetic socket"), /source_special_file/);
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    const target = join(root, "target.glb");
    await writeFile(target, "target");
    try {
      await symlink(target, join(root, "assets", "linked.glb"), "file");
    } catch (error) {
      if (error?.code === "EPERM") { context.diagnostic("file symlink creation unavailable; junction probe remains authoritative on Windows"); return; }
      throw error;
    }
    await expectFailure(() => validateAnimationPackSource(root), "source_link");
  });
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    const target = join(root, "junction-target");
    await mkdir(target);
    try {
      await symlink(target, join(root, "assets", "junction"), "junction");
    } catch (error) {
      if (error?.code === "EPERM") { context.diagnostic("junction creation unavailable"); return; }
      throw error;
    }
    await expectFailure(() => validateAnimationPackSource(root), "source_link");
  });
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    await rm(join(root, "assets", "synthetic-minimal.glb"));
    await mkdir(join(root, "assets", "synthetic-minimal.glb"));
    await assert.rejects(() => validateAnimationPackSource(root), /inventory|directory|regular/);
  });
});

test("source traversal selects the same first failure regardless of creation and enumeration order", async (context) => {
  await withTemporaryDirectory(async (root) => {
    const targetA = join(root, "target-a");
    const targetZ = join(root, "target-z");
    await mkdir(targetA);
    await mkdir(targetZ);
    const fingerprints = [];
    for (const [index, creationOrder] of [[0, ["z-invalid", "a-invalid"]], [1, ["a-invalid", "z-invalid"]]]) {
      const source = join(root, `source-${index}`);
      await writeSource(source);
      for (const name of creationOrder) {
        const target = name.startsWith("a") ? targetA : targetZ;
        if (!await createJunction(target, join(source, "assets", name), context)) return;
      }
      try {
        await validateAnimationPackSource(source, { hooks: {
          async readDirectory(directory) {
            return (await readdir(directory, { withFileTypes: true })).reverse();
          }
        } });
        assert.fail("expected deterministic traversal failure");
      } catch (error) {
        fingerprints.push(errorFingerprint(error));
      }
    }
    assert.deepEqual(fingerprints, [
      { code: "source_link", message: "source_link: assets/a-invalid" },
      { code: "source_link", message: "source_link: assets/a-invalid" }
    ]);
  });
});

test("license, source, review, approval, URL, date, and relation evidence fails closed", async () => {
  const mutations = [
    (source) => { source.releaseReviewId = "review.missing"; },
    (source) => { source.reviews[0].status = "draft"; },
    (source) => { source.reviews.push(structuredClone(source.reviews[0])); },
    (source) => { source.licenses[0].redistributionScope = "online"; },
    (source) => { source.licenses[0].termsUrl = "http://example.test/license"; },
    (source) => { source.licenses[0].attribution = ""; },
    (source) => { source.licenses[0].reviewedAt = "2026-08-25"; },
    (source) => { source.licenses[0].reviewId = "review.missing"; },
    (source) => { source.sources[0].author = ""; },
    (source) => { source.sources[0].sourceUrl = "http://example.test/source"; },
    (source) => { source.sources[0].attribution = ""; },
    (source) => { source.sources[0].modifications = ""; },
    (source) => { source.sources[0].reviewedAt = "2026-08-25"; },
    (source) => { source.sources[0].licenseId = "license.missing"; },
    (source) => { source.assets[0].licenseId = "license.missing"; },
    (source) => { source.entries[0].sourceId = "source.missing"; },
    (source) => { source.entries[0].assetPath = "assets/other.glb"; },
    (source) => { source.entries[0].durationSeconds = 2; source.entries[0].loop.endSeconds = 2; }
  ];
  for (const mutate of mutations) {
    await withTemporaryDirectory(async (root) => {
      const source = await fixtureObject();
      mutate(source);
      await writeSource(root, source);
      await assert.rejects(() => validateAnimationPackSource(root));
      const result = await runCli(["validate", "--source", root]);
      assert.notEqual(result.code, 0);
    });
  }
});

test("GLB and glTF envelopes reject corrupt headers, chunks, UTF-8, JSON, versions, and external URIs", async () => {
  const valid = Buffer.from((await readFile(fixtureBase64Path, "utf8")).trim(), "base64");
  const corruptions = [
    (bytes) => bytes.write("BAD!", 0),
    (bytes) => bytes.writeUInt32LE(1, 4),
    (bytes) => bytes.writeUInt32LE(bytes.length + 4, 8),
    (bytes) => bytes.writeUInt32LE(26, 12),
    (bytes) => bytes.writeUInt32LE(0x004e4942, 16),
    (bytes) => { bytes[20] = 0xff; },
    (bytes) => { bytes.write("1.0", 41, "ascii"); }
  ];
  for (const corrupt of corruptions) {
    const bytes = Buffer.from(valid);
    corrupt(bytes);
    assert.throws(() => validateGlbEnvelope(bytes));
  }
  assert.throws(() => validateGlbEnvelope(Buffer.concat([valid, Buffer.alloc(4)])));
  validateGltfEnvelope(Buffer.from('{"asset":{"version":"2.0"},"buffers":[{"uri":"data:application/octet-stream;base64,AA=="}]}'));
  for (const value of [
    { asset: { version: "1.0" } },
    { asset: { version: "2.0" }, buffers: [{ uri: "asset.bin" }] },
    { asset: { version: "2.0" }, images: [{ uri: "https://example.test/image.png" }] },
    { asset: { version: "2.0" }, images: [{ uri: "/absolute.png" }] },
    { asset: { version: "2.0" }, buffers: [{ uri: "file:///asset.bin" }] }
  ]) assert.throws(() => validateGltfEnvelope(Buffer.from(JSON.stringify(value))));
});

test("GLB JSON accepts required ASCII-space padding and rejects NUL and control padding", async () => {
  const valid = Buffer.from((await readFile(fixtureBase64Path, "utf8")).trim(), "base64");
  assert.equal(valid.at(-1), 0x20);
  assert.doesNotThrow(() => validateGlbEnvelope(valid));
  for (const padding of [0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f]) {
    const mutated = Buffer.from(valid);
    mutated[mutated.length - 1] = padding;
    assert.throws(() => validateGlbEnvelope(mutated), /glb_json_padding|malformed_json/, `padding 0x${padding.toString(16)}`);
  }
});

test("source mutation after immediate stat is detected without source rewriting", async () => {
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    const path = join(root, "assets", "synthetic-minimal.glb");
    const original = await readFile(path);
    const before = await stat(path);
    await expectFailure(() => validateAnimationPackSource(root, { hooks: {
      async afterImmediateStat(candidate) {
        if (candidate === path) {
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
          await writeFile(candidate, Buffer.from(original).fill(0, 20, 21));
        }
      }
    } }), "source_changed");
    assert.equal((await stat(path)).size, before.size);
  });
});

test("complete source snapshots reject inventory, pack-source, file, and directory races", async () => {
  const cases = [
    ["added inventory", async (root) => { await writeFile(join(root, "assets", "undeclared.glb"), "foreign"); }],
    ["removed asset", async (_root, candidate) => { await unlink(candidate); }],
    ["replaced asset identity", async (_root, candidate) => {
      const replacement = `${candidate}.replacement`;
      await copyFile(candidate, replacement);
      await unlink(candidate);
      await rename(replacement, candidate);
    }],
    ["replaced assets directory identity", async (root) => {
      const assets = join(root, "assets");
      const oldAssets = join(root, "assets-old");
      await rename(assets, oldAssets);
      await mkdir(assets);
      await copyFile(join(oldAssets, "synthetic-minimal.glb"), join(assets, "synthetic-minimal.glb"));
    }]
  ];
  for (const [label, mutate] of cases) {
    await withTemporaryDirectory(async (root) => {
      await writeSource(root);
      await assert.rejects(() => validateAnimationPackSource(root, { hooks: {
        async afterAssetRead(candidate) { await mutate(root, candidate); }
      } }), /source_changed|source_special_file/, label);
    });
  }
  for (const replace of [false, true]) {
    await withTemporaryDirectory(async (root) => {
      await writeSource(root);
      await assert.rejects(() => validateAnimationPackSource(root, { hooks: {
        async afterPackSourceRead(path) {
          const bytes = await readFile(path);
          if (replace) {
            const replacement = `${path}.replacement`;
            await writeFile(replacement, bytes);
            await unlink(path);
            await rename(replacement, path);
          } else {
            await writeFile(path, Buffer.concat([bytes, Buffer.from(" ")]));
          }
        }
      } }), /source_changed/, replace ? "pack-source replacement" : "pack-source mutation");
    });
  }
});

test("source identity is rechecked before and after artifacts and before publication", async (context) => {
  const phases = ["beforeArtifactCreation", "afterArtifactCreation", "beforePublication"];
  for (const phase of phases) {
    await withTemporaryDirectory(async (root) => {
      const source = join(root, "source");
      const output = join(root, "output");
      await writeSource(source);
      let changed = false;
      await assert.rejects(() => publishAnimationPack(source, output, { hooks: {
        async [phase]() {
          if (changed) return;
          changed = true;
          await writeFile(join(source, "assets", "late.glb"), "late");
        }
      } }), /source_changed|asset_inventory_mismatch/, phase);
      await assert.rejects(() => lstat(output), { code: "ENOENT" });
      await assert.rejects(() => lstat(stagingPathFor(output)), { code: "ENOENT" });
    });
  }
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const oldSource = join(root, "source-old");
    const output = join(root, "output");
    await writeSource(source);
    await assert.rejects(() => publishAnimationPack(source, output, { hooks: {
      async beforeArtifactCreation() {
        await rename(source, oldSource);
        await writeSource(source);
      }
    } }), /source_changed/);
    await assert.rejects(() => lstat(output), { code: "ENOENT" });
  });
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const oldSource = join(root, "source-old");
    const output = join(root, "output");
    await writeSource(source);
    const probe = join(root, "junction-probe");
    if (!await createJunction(source, probe, context)) return;
    await rm(probe);
    await assert.rejects(() => publishAnimationPack(source, output, { hooks: {
      async beforeArtifactCreation() {
        await rename(source, oldSource);
        await symlink(oldSource, source, "junction");
      }
    } }), /invalid_source_root|source_changed/);
    assert.equal((await lstat(source)).isSymbolicLink(), true);
    await assert.rejects(() => lstat(output), { code: "ENOENT" });
  });
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const output = join(root, "output");
    await writeSource(source);
    await assert.rejects(() => publishAnimationPack(source, output, { async faultInjector(phase) {
      if (phase === "beforeRename") await unlink(join(source, "assets", "synthetic-minimal.glb"));
    } }), /source_changed/);
    await assert.rejects(() => lstat(output), { code: "ENOENT" });
    await assert.rejects(() => lstat(stagingPathFor(output)), { code: "ENOENT" });
  });
});

test("ZIP has exact STORE records and extracts exact manifest/asset bytes", async () => {
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    const built = await artifactsForSource(root);
    const evidence = await verifyRawZip(built.artifacts.get("animation-pack.zip"), new Map([[MANIFEST_ARCHIVE_PATH, built.artifacts.get("animation-pack-manifest.json")], ...built.assetBytes]));
    assert.deepEqual(evidence.entries.map((entry) => entry.name), ["assets/synthetic-minimal.glb", MANIFEST_ARCHIVE_PATH]);
    assert.equal(evidence.entries.length, 2);
  });
});

test("terminal EOCD parsing ignores EOCD signature bytes stored in a valid GLB BIN payload", async () => {
  await withTemporaryDirectory(async (root) => {
    const { source } = await writeSource(root);
    const payload = glbWithBinPayload(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    validateGlbEnvelope(payload);
    await writeFile(join(root, ...source.assets[0].path.split("/")), payload);
    const built = await artifactsForSource(root);
    const archive = built.artifacts.get("animation-pack.zip");
    assert.ok(archive.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) < archive.length - 22);
    const evidence = await verifyRawZip(archive, new Map([[MANIFEST_ARCHIVE_PATH, built.artifacts.get("animation-pack-manifest.json")], ...built.assetBytes]));
    assert.equal(evidence.eocdOffset, archive.length - 22);
  });
});

test("raw ZIP verification rejects corrupt bytes, CRC, sizes, offsets, flags, method, time, attributes, extras, and trailing data", async () => {
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    const built = await artifactsForSource(root);
    const original = built.artifacts.get("animation-pack.zip");
    const expected = new Map([[MANIFEST_ARCHIVE_PATH, built.artifacts.get("animation-pack-manifest.json")], ...built.assetBytes]);
    const central = original.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const eocd = original.length - 22;
    const mutations = [
      (bytes) => { bytes[40] ^= 1; },
      (bytes) => { bytes.writeUInt16LE(8, 6); },
      (bytes) => { bytes.writeUInt16LE(8, 8); },
      (bytes) => { bytes.writeUInt16LE(1, 10); },
      (bytes) => { bytes.writeUInt32LE(0, 14); },
      (bytes) => { bytes.writeUInt32LE(0, 18); },
      (bytes) => { bytes.writeUInt16LE(1, central + 30); },
      (bytes) => { bytes.writeUInt32LE(0, central + 38); },
      (bytes) => { bytes.writeUInt32LE(1, central + 42); },
      (bytes) => { bytes.writeUInt16LE(1, eocd + 8); },
      (bytes) => { bytes.writeUInt16LE(1, eocd + 20); },
      (bytes) => { bytes.writeUInt32LE(1, eocd + 16); }
    ];
    for (const mutate of mutations) {
      const bytes = Buffer.from(original);
      mutate(bytes);
      await assert.rejects(() => verifyRawZip(bytes, expected));
    }
    const evidence = await verifyRawZip(original, expected);
    const duplicate = Buffer.from(original);
    const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    const secondCentral = duplicate.indexOf(centralSignature, central + 4);
    const firstName = Buffer.from(evidence.entries[0].name, "ascii");
    const secondName = Buffer.from(evidence.entries[1].name, "ascii");
    assert.equal(firstName.length, secondName.length);
    firstName.copy(duplicate, secondCentral + 46);
    firstName.copy(duplicate, evidence.entries[1].localOffset + 30);
    await assert.rejects(() => verifyRawZip(duplicate, expected));
    const extraZip = await JSZip.loadAsync(original);
    extraZip.file("assets/extra.glb", Buffer.from("x"), {
      binary: true,
      date: new Date("1980-01-01T00:00:00.000Z"),
      compression: "STORE",
      createFolders: false,
      dir: false,
      unixPermissions: 0o100644
    });
    const extraArchive = await extraZip.generateAsync({ type: "nodebuffer", compression: "STORE", streamFiles: false, platform: "UNIX", comment: "" });
    await assert.rejects(() => verifyRawZip(extraArchive, expected));
    await assert.rejects(() => verifyRawZip(Buffer.concat([original, Buffer.from("tail")]), expected));
    await assert.rejects(() => verifyRawZip(Buffer.concat([original.subarray(0, eocd), original.subarray(eocd), original.subarray(eocd)]), expected));
    await assert.rejects(() => verifyRawZip(original, new Map([...expected, ["assets/extra.glb", Buffer.from("x")]])));
  });
});

test("descriptor alone owns exact manifest/archive sizes and hashes and is not archived", async () => {
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    const built = await artifactsForSource(root);
    const manifestBytes = built.artifacts.get("animation-pack-manifest.json");
    const archiveBytes = built.artifacts.get("animation-pack.zip");
    const descriptor = parseStrictJsonBytes(built.artifacts.get("animation-pack-release.json"));
    assert.equal(descriptor.manifestByteSize, manifestBytes.length);
    assert.equal(descriptor.manifestSha256, sha256Bytes(manifestBytes));
    assert.equal(descriptor.archiveByteSize, archiveBytes.length);
    assert.equal(descriptor.archiveSha256, sha256Bytes(archiveBytes));
    const manifestText = manifestBytes.toString("utf8");
    for (const forbidden of ["archiveByteSize", "archiveSha256", "manifestPath", "manifestByteSize", "manifestSha256", descriptor.archiveSha256, descriptor.manifestSha256]) assert.equal(manifestText.includes(forbidden), false);
    const zipNames = (await verifyRawZip(archiveBytes, new Map([[MANIFEST_ARCHIVE_PATH, manifestBytes], ...built.assetBytes]))).entries.map((entry) => entry.name);
    assert.equal(zipNames.includes("animation-pack-release.json"), false);
  });
});

test("built-artifact verification rejects corrupt manifest, descriptor, archive, identity, version, app, size, and hash", async () => {
  await withTemporaryDirectory(async (root) => {
    await writeSource(root);
    const built = await artifactsForSource(root);
    const cases = [
      (artifacts) => { artifacts.get("animation-pack-manifest.json")[0] ^= 1; },
      (artifacts) => { artifacts.get("animation-pack.zip")[30] ^= 1; },
      (artifacts) => { artifacts.get("animation-pack-release.json")[0] ^= 1; },
      (artifacts) => {
        const value = parseStrictJsonBytes(artifacts.get("animation-pack-release.json"));
        value.archiveByteSize += 1;
        artifacts.set("animation-pack-release.json", canonicalJsonBytes(value));
      },
      (artifacts) => {
        const value = parseStrictJsonBytes(artifacts.get("animation-pack-release.json"));
        value.packId = "gym-local.other";
        artifacts.set("animation-pack-release.json", canonicalJsonBytes(value));
      },
      (artifacts) => {
        const value = parseStrictJsonBytes(artifacts.get("animation-pack-release.json"));
        value.minimumAppVersion = "99.0.0";
        artifacts.set("animation-pack-release.json", canonicalJsonBytes(value));
      }
    ];
    for (const mutate of cases) {
      const artifacts = cloneArtifacts(built.artifacts);
      mutate(artifacts);
      await assert.rejects(() => verifyBuiltArtifacts(artifacts, built.assetBytes));
    }
  });
});

test("exact exerciseVariantId is preserved; case changes fail and equipment near matches remain distinct", async () => {
  await withTemporaryDirectory(async (root) => {
    const source = await fixtureObject();
    source.entries.push({
      ...structuredClone(source.entries[0]),
      animationId: "animation.foundation-03-dumbbell-near-match",
      exerciseVariantId: "fixture_movement__dumbbell",
      primary: true
    });
    await writeSource(root, source);
    const built = await artifactsForSource(root);
    assert.deepEqual(built.manifest.entries.map((entry) => entry.exerciseVariantId), ["fixture_movement__bodyweight", "fixture_movement__dumbbell"]);
  });
  await withTemporaryDirectory(async (root) => {
    const source = await fixtureObject();
    source.entries[0].exerciseVariantId = "fixture_movement__Bodyweight";
    await writeSource(root, source);
    await assert.rejects(() => validateAnimationPackSource(root), /invalid_id/);
  });
});

test("realpath containment rejects source and output aliases and rechecks output identity before rename", async (context) => {
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const sourceAlias = join(root, "source-alias");
    await writeSource(source);
    if (await createJunction(source, sourceAlias, context)) {
      await expectFailure(() => validateAnimationPackSource(sourceAlias), "invalid_source_root");
    }
  });
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const parentAlias = join(root, "parent-alias");
    await writeSource(source);
    if (await createJunction(source, parentAlias, context)) {
      await expectFailure(() => publishAnimationPack(source, join(parentAlias, "output")), "invalid_output_parent");
      await assert.rejects(() => lstat(join(source, "output")), { code: "ENOENT" });
    }
  });
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const foreign = join(root, "foreign");
    const output = join(root, "output");
    await writeSource(source);
    await mkdir(foreign);
    if (await createJunction(foreign, output, context)) {
      await expectFailure(() => publishAnimationPack(source, output), "output_exists");
      assert.equal((await lstat(output)).isSymbolicLink(), true);
    }
    const stageOutput = join(root, "stage-output");
    const staging = stagingPathFor(stageOutput);
    if (await createJunction(foreign, staging, context)) {
      await expectFailure(() => publishAnimationPack(source, stageOutput), "staging_exists");
      assert.equal((await lstat(staging)).isSymbolicLink(), true);
    }
  });
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const foreign = join(root, "foreign");
    const output = join(root, "output");
    await writeSource(source);
    await mkdir(foreign);
    const probe = join(root, "junction-probe");
    if (!await createJunction(foreign, probe, context)) return;
    await rm(probe);
    await assert.rejects(() => publishAnimationPack(source, output, { async faultInjector(phase) {
      if (phase === "beforeRename") await symlink(foreign, output, "junction");
    } }), /output_race|injected|staging/i);
    assert.equal((await lstat(output)).isSymbolicLink(), true);
    await assert.rejects(() => lstat(stagingPathFor(output)), { code: "ENOENT" });
  });
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const foreign = join(root, "foreign-stage");
    const output = join(root, "output");
    const staging = stagingPathFor(output);
    await writeSource(source);
    await mkdir(foreign);
    const probe = join(root, "junction-probe");
    if (!await createJunction(foreign, probe, context)) return;
    await rm(probe);
    await assert.rejects(() => publishAnimationPack(source, output, { async faultInjector(phase) {
      if (phase === "beforeRename") {
        await rm(staging, { recursive: true });
        await symlink(foreign, staging, "junction");
        await writeFile(join(foreign, "foreign-sentinel"), "foreign");
      }
    } }), /ownership proof|staging_identity_mismatch/i);
    assert.equal((await lstat(staging)).isSymbolicLink(), true);
    assert.equal(await readFile(join(foreign, "foreign-sentinel"), "utf8"), "foreign");
    await assert.rejects(() => lstat(output), { code: "ENOENT" });
  });
});

test("output parent identity swaps are rejected before staging creation", async (context) => {
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const parent = join(root, "publish-parent");
    const oldParent = join(root, "publish-parent-old");
    const output = join(parent, "output");
    await writeSource(source);
    await mkdir(parent);
    let junctionAvailable = true;
    await assert.rejects(() => publishAnimationPack(source, output, { hooks: {
      async beforePublication() {
        await rename(parent, oldParent);
        junctionAvailable = await createJunction(oldParent, parent, context);
        if (!junctionAvailable) await mkdir(parent);
      }
    } }), /output_parent_changed|output_parent_alias/);
    await assert.rejects(() => lstat(output), { code: "ENOENT" });
    await assert.rejects(() => lstat(stagingPathFor(output)), { code: "ENOENT" });
    if (junctionAvailable) assert.equal((await lstat(parent)).isSymbolicLink(), true);
  });
});

test("atomic publication refuses existing output/stage and cleans only current staging for every injected phase", async () => {
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    await writeSource(source);
    const sentinel = join(root, "sentinel.txt");
    await writeFile(sentinel, "do not touch");
    const sourceBefore = createHash("sha256").update(await readFile(join(source, "pack-source.json"))).digest("hex");
    const sourceMtime = (await stat(join(source, "pack-source.json"))).mtimeMs;
    const assetBefore = createHash("sha256").update(await readFile(join(source, "assets", "synthetic-minimal.glb"))).digest("hex");
    const assetMtime = (await stat(join(source, "assets", "synthetic-minimal.glb"))).mtimeMs;
    const existing = join(root, "existing");
    await mkdir(existing);
    await writeFile(join(existing, "keep.txt"), "keep");
    await expectFailure(() => publishAnimationPack(source, existing), "output_exists");
    assert.equal(await readFile(join(existing, "keep.txt"), "utf8"), "keep");
    const staleOutput = join(root, "stale-output");
    await mkdir(stagingPathFor(staleOutput));
    await writeFile(join(stagingPathFor(staleOutput), "stale.txt"), "stale");
    await expectFailure(() => publishAnimationPack(source, staleOutput), "staging_exists");
    assert.equal(await readFile(join(stagingPathFor(staleOutput), "stale.txt"), "utf8"), "stale");
    const phases = [
      "afterMarker",
      ...OUTPUT_FILES.flatMap((name) => [`beforeWrite:${name}`, `afterWrite:${name}`]),
      "beforeVerify", "afterVerify", "beforeRename"
    ];
    for (const [index, phase] of phases.entries()) {
      const output = join(root, `failure-${index}`);
      await assert.rejects(() => publishAnimationPack(source, output, { faultInjector(current) { if (current === phase) throw new Error(`injected ${phase}`); } }), new RegExp(`injected ${phase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      await assert.rejects(() => lstat(output), { code: "ENOENT" });
      await assert.rejects(() => lstat(stagingPathFor(output)), { code: "ENOENT" });
    }
    assert.equal(await readFile(sentinel, "utf8"), "do not touch");
    assert.equal(createHash("sha256").update(await readFile(join(source, "pack-source.json"))).digest("hex"), sourceBefore);
    assert.equal((await stat(join(source, "pack-source.json"))).mtimeMs, sourceMtime);
    assert.equal(createHash("sha256").update(await readFile(join(source, "assets", "synthetic-minimal.glb"))).digest("hex"), assetBefore);
    assert.equal((await stat(join(source, "assets", "synthetic-minimal.glb"))).mtimeMs, assetMtime);
  });
});

test("questionable staging is preserved when owner proof or staging identity changes", async () => {
  const ownerName = ".foundation-03-owner";
  const ownerBytes = "Gym Local FOUNDATION-03 staging ownership\n";
  const cases = [
    ["missing marker", async (staging) => { await unlink(join(staging, ownerName)); await writeFile(join(staging, "foreign-sentinel"), "foreign"); }],
    ["mismatched marker", async (staging) => { await writeFile(join(staging, ownerName), "foreign"); await writeFile(join(staging, "foreign-sentinel"), "foreign"); }],
    ["unreadable marker", async (staging) => { await unlink(join(staging, ownerName)); await mkdir(join(staging, ownerName)); await writeFile(join(staging, "foreign-sentinel"), "foreign"); }],
    ["replaced staging identity", async (staging) => {
      await rm(staging, { recursive: true });
      await mkdir(staging);
      await writeFile(join(staging, ownerName), ownerBytes);
      await writeFile(join(staging, "foreign-sentinel"), "foreign");
    }]
  ];
  for (const [label, mutate] of cases) {
    await withTemporaryDirectory(async (root) => {
      const source = join(root, "source");
      const output = join(root, "output");
      const staging = stagingPathFor(output);
      await writeSource(source);
      await assert.rejects(() => publishAnimationPack(source, output, { async faultInjector(phase) {
        if (phase === "beforeRename") await mutate(staging);
      } }), (error) => {
        assert.equal(error instanceof AggregateError, true, `${label}: ${error?.stack}`);
        assert.match(error.message, /ownership proof/i);
        return true;
      });
      await assert.rejects(() => lstat(output), { code: "ENOENT" });
      assert.equal(await readFile(join(staging, "foreign-sentinel"), "utf8"), "foreign");
    });
  }
});

test("failure after owner-marker removal preserves the unprovable stage and never deletes publication", async () => {
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const output = join(root, "output");
    const staging = stagingPathFor(output);
    await writeSource(source);
    await assert.rejects(() => publishAnimationPack(source, output, { async faultInjector(phase) {
      if (phase === "afterMarkerRemoval") {
        await writeFile(join(staging, "foreign-sentinel"), "foreign");
        throw new Error("injected afterMarkerRemoval");
      }
    } }), (error) => {
      assert.equal(error instanceof AggregateError, true, error?.stack);
      assert.match(error.message, /ownership proof/i);
      return true;
    });
    await assert.rejects(() => lstat(output), { code: "ENOENT" });
    assert.equal(await readFile(join(staging, "foreign-sentinel"), "utf8"), "foreign");
    await assert.rejects(() => lstat(join(staging, ".foundation-03-owner")), { code: "ENOENT" });
  });
});

test("concurrent deterministic staging collision fails without deleting the pre-existing stage", async () => {
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const output = join(root, "output");
    await writeSource(source);
    const staging = stagingPathFor(output);
    await mkdir(staging);
    await writeFile(join(staging, "foreign-sentinel"), "foreign");
    await expectFailure(() => publishAnimationPack(source, output), "staging_exists");
    assert.equal(await readFile(join(staging, "foreign-sentinel"), "utf8"), "foreign");
    await assert.rejects(() => lstat(output), { code: "ENOENT" });
  });
});

test("CLI validates arguments, reports failures nonzero, and never leaves partial output", async () => {
  await withTemporaryDirectory(async (root) => {
    const source = join(root, "source");
    const output = join(root, "output");
    await writeSource(source);
    assert.equal((await runCli(["validate", "--source", source])).code, 0);
    assert.equal((await runCli(["build", "--source", source, "--output", output])).code, 0);
    assert.deepEqual((await readdir(output)).sort(), [...OUTPUT_FILES].sort());
    assert.notEqual((await runCli(["build", "--source", source, "--output", output])).code, 0);
    assert.notEqual((await runCli(["validate"])).code, 0);
    assert.notEqual((await runCli(["unknown", "--source", source])).code, 0);
  });
});

test("imports are restricted to Node built-ins, direct jszip, and public @gym/contracts resolution", async () => {
  const source = await readFile(join(repositoryRoot, "scripts", "animation-pack-v1.mjs"), "utf8");
  const cli = await readFile(cliPath, "utf8");
  const combined = `${source}\n${cli}`;
  assert.ok(combined.includes('from "jszip"'));
  assert.ok(combined.includes('resolve("@gym/contracts")'));
  assert.ok(combined.includes("stripTypeScriptTypes"));
  assert.ok(combined.includes("register("));
  const unavailableFloorApi = ["register", "Hooks"].join("");
  for (const forbidden of ["packages/contracts/src", "pako", "readable-stream", "setimmediate", "fetch(", "http.request", "https.request", "localeCompare", "Intl.", "Date.now", "Math.random", "randomUUID", unavailableFloorApi]) assert.equal(combined.includes(forbidden), false, forbidden);
});

test("direct jszip 3.10.1 lock integrity and selected MIT license are pinned", async () => {
  const packagePath = requireFromTest.resolve("jszip/package.json");
  const packageMetadata = JSON.parse(await readFile(packagePath, "utf8"));
  assert.deepEqual({ name: packageMetadata.name, version: packageMetadata.version, license: packageMetadata.license }, {
    name: "jszip",
    version: "3.10.1",
    license: "(MIT OR GPL-3.0-or-later)"
  });
  const packageLicense = await readFile(join(dirname(packagePath), "LICENSE.markdown"), "utf8");
  assert.ok(packageLicense.includes("The MIT License"));
  const rootPackage = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  assert.equal(rootPackage.dependencies.jszip, "3.10.1");
  const lock = await readFile(join(repositoryRoot, "pnpm-lock.yaml"), "utf8");
  assert.ok(lock.includes("specifier: 3.10.1\n        version: 3.10.1"));
  assert.ok(lock.includes("sha512-xXDvecyTpGLrqFrvkrUSoxxfJI5AH7U8zxxtVclpsUtMCq4JQ290LY8AW5c7Ggnr/Y/oK+bQMbqK2qmtk3pN4g=="));
});
