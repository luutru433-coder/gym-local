/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";

// The workspace package exports TypeScript directly and its public index uses an
// extensionless relative export. Node 24 strips TypeScript but does not add the
// extension, so this narrow built-in hook completes only that ordinary lookup.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && context.parentURL?.includes("/packages/contracts/")) {
        const candidate = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
      }
      throw error;
    }
  }
});

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const contractsRequire = createRequire(pathToFileURL(resolve(scriptDirectory, "../packages/contracts/package.json")));
const contracts = await import(pathToFileURL(contractsRequire.resolve("@gym/contracts")).href);
const {
  APP_VERSIONS,
  animationCatalogVersion,
  animationPackSchemaVersion,
  animationPlayerProtocolVersion,
  parseAnimationPackManifest,
  parseAnimationPackReleaseDescriptor,
  validateAnimationPackCompatibility
} = contracts;

export const MANIFEST_ARCHIVE_PATH = "manifest/animation-pack.json";
export const OUTPUT_FILES = Object.freeze([
  "animation-pack-manifest.json",
  "animation-pack.zip",
  "animation-pack-release.json"
]);
export const RESOURCE_LIMITS = Object.freeze({
  sourceJsonBytes: 1024 * 1024,
  assetCount: 64,
  entryCount: 256,
  recordCount: 512,
  assetBytes: 16 * 1024 * 1024,
  totalAssetBytes: 64 * 1024 * 1024,
  pathBytes: 240
});

const FIXED_DATE = new Date("1980-01-01T00:00:00.000Z");
const FIXED_DOS_DATE = 33;
const FIXED_DOS_TIME = 0;
const FILE_MODE = 0o100644;
const EXTERNAL_FILE_ATTRIBUTES = (FILE_MODE << 16) >>> 0;
const OWNER_FILE = ".foundation-03-owner";
const OWNER_BYTES = Buffer.from("Gym Local FOUNDATION-03 staging ownership\n", "utf8");
const PORTABLE_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const BAD_PERCENT = /%(?:00|2e|2f|3f|23|5c)/i;
const INTEGER_KEY = /^(?:0|[1-9]\d*)$/;
const SOURCE_ROOT_FIELDS = [
  "packId", "version", "animationPackSchemaVersion", "animationPlayerProtocolVersion",
  "animationCatalogVersion", "minimumAppVersion", "releaseDate", "createdAt",
  "releaseReviewId", "reviews", "licenses", "sources", "assets", "entries"
];
const REVIEW_FIELDS = ["id", "reviewer", "reviewedAt", "status"];
const LICENSE_FIELDS = ["id", "name", "termsUrl", "redistributionScope", "attribution", "reviewedAt", "reviewId"];
const SOURCE_FIELDS = ["id", "author", "sourceUrl", "licenseId", "attribution", "modifications", "reviewedAt", "reviewId"];
const SOURCE_ASSET_FIELDS = ["id", "path", "mediaType", "compression", "rigId", "sourceId", "licenseId", "durationSeconds"];
const ENTRY_FIELDS = [
  "animationId", "exerciseVariantId", "animationCatalogVersion", "primary", "assetId",
  "assetPath", "clipName", "durationSeconds", "loop", "defaultCamera", "equipmentProps",
  "accessibilityFallbackKey", "sourceId", "licenseId"
];
const LOOP_FIELDS = ["startSeconds", "endSeconds"];
const CAMERA_FIELDS = ["preset", "position", "target", "fovDegrees"];

export class AnimationPackBuildError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "AnimationPackBuildError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AnimationPackBuildError(code, message);
}

function hasPathControl(value) {
  return [...value].some((character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f);
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareRaw(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("invalid_source_schema", `${label} must be a plain object`);
  }
}

function assertExactFields(value, fields, label) {
  assertPlainObject(value, label);
  const expected = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!expected.has(field)) fail("unknown_source_field", `${label}.${field}`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) fail("missing_source_field", `${label}.${field}`);
  }
}

function assertDenseArray(value, label) {
  if (!Array.isArray(value)) fail("invalid_source_schema", `${label} must be an array`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail("sparse_source_array", `${label}[${index}]`);
  }
}

// A small recursive-descent JSON parser is used because JSON.parse silently
// accepts duplicate member names. It delegates string escape/number value
// semantics to JSON.parse only after token boundaries and duplicates are known.
export function parseStrictJsonBytes(bytes, label = "JSON") {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail("invalid_json_bytes", `${label} must be bytes`);
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) fail("utf8_bom", `${label} must not have a BOM`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail("invalid_utf8", `${label} is not strict UTF-8`);
  }
  let index = 0;
  const whitespace = () => { while (["\t", "\n", "\r", " "].includes(text[index])) index += 1; };
  const stringToken = () => {
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try { return JSON.parse(text.slice(start, index)); } catch { fail("malformed_json", `${label} has an invalid string`); }
      }
      if (character === "\\") {
        index += 1;
        if (text[index] === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) fail("malformed_json", `${label} has an invalid Unicode escape`);
          index += 5;
        } else {
          if (!/["\\/bfnrt]/.test(text[index] ?? "")) fail("malformed_json", `${label} has an invalid escape`);
          index += 1;
        }
      } else {
        if (character.charCodeAt(0) <= 0x1f) fail("malformed_json", `${label} has a control in a string`);
        index += 1;
      }
    }
    fail("malformed_json", `${label} has an unterminated string`);
  };
  const value = (path) => {
    whitespace();
    const character = text[index];
    if (character === '"') return stringToken();
    if (character === "{") {
      index += 1;
      whitespace();
      const result = {};
      const keys = new Set();
      if (text[index] === "}") { index += 1; return result; }
      while (true) {
        whitespace();
        if (text[index] !== '"') fail("malformed_json", `${label} object key expected at ${path}`);
        const key = stringToken();
        if (keys.has(key)) fail("duplicate_json_key", `${path}.${key}`);
        keys.add(key);
        whitespace();
        if (text[index] !== ":") fail("malformed_json", `${label} missing colon at ${path}.${key}`);
        index += 1;
        result[key] = value(`${path}.${key}`);
        whitespace();
        if (text[index] === "}") { index += 1; return result; }
        if (text[index] !== ",") fail("malformed_json", `${label} missing comma at ${path}`);
        index += 1;
      }
    }
    if (character === "[") {
      index += 1;
      whitespace();
      const result = [];
      if (text[index] === "]") { index += 1; return result; }
      while (true) {
        result.push(value(`${path}[${result.length}]`));
        whitespace();
        if (text[index] === "]") { index += 1; return result; }
        if (text[index] !== ",") fail("malformed_json", `${label} missing comma at ${path}`);
        index += 1;
      }
    }
    const remainder = text.slice(index);
    const literal = /^(?:true|false|null)/.exec(remainder)?.[0];
    if (literal) { index += literal.length; return JSON.parse(literal); }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(remainder)?.[0];
    if (number) {
      index += number.length;
      const parsed = JSON.parse(number);
      if (!Number.isFinite(parsed) || Object.is(parsed, -0)) fail("invalid_json_number", `${path} is not a lossless finite number`);
      return parsed;
    }
    fail("malformed_json", `${label} has an invalid value at ${path}`);
  };
  const parsed = value("$");
  whitespace();
  if (index !== text.length) fail("malformed_json", `${label} has trailing bytes`);
  return parsed;
}

function canonicalValue(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail("noncanonical_number", path);
    return value;
  }
  if (Array.isArray(value)) {
    return Array.from({ length: value.length }, (_, index) => {
      if (!Object.hasOwn(value, index)) fail("noncanonical_array", `${path}[${index}]`);
      return canonicalValue(value[index], `${path}[${index}]`);
    });
  }
  assertPlainObject(value, path);
  const result = {};
  for (const key of Object.keys(value).sort(compareRaw)) {
    if (INTEGER_KEY.test(key)) fail("integer_like_key", `${path}.${key}`);
    if (value[key] === undefined || typeof value[key] === "bigint" || typeof value[key] === "function" || typeof value[key] === "symbol") {
      fail("noncanonical_value", `${path}.${key}`);
    }
    result[key] = canonicalValue(value[key], `${path}.${key}`);
  }
  return result;
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, "utf8");
}

function schemaSortManifest(manifest) {
  return {
    ...manifest,
    reviews: [...manifest.reviews].sort((a, b) => compareRaw(a.id, b.id)),
    licenses: [...manifest.licenses].sort((a, b) => compareRaw(a.id, b.id)),
    sources: [...manifest.sources].sort((a, b) => compareRaw(a.id, b.id)),
    assets: [...manifest.assets].sort((a, b) => compareRaw(a.path, b.path) || compareRaw(a.id, b.id)),
    entries: [...manifest.entries].map((entry) => ({
      ...entry,
      equipmentProps: [...entry.equipmentProps].sort(compareRaw)
    })).sort((a, b) => compareRaw(a.exerciseVariantId, b.exerciseVariantId)
      || a.animationCatalogVersion - b.animationCatalogVersion
      || compareRaw(a.animationId, b.animationId)
      || compareRaw(a.assetPath, b.assetPath))
  };
}

function validationData(result, label) {
  if (!result.success) fail("contract_validation", `${label}: ${JSON.stringify(result.issues)}`);
  return result.data;
}

function assertPathCollisions(paths, label) {
  const exact = new Set();
  const caseKeys = new Map();
  const normalizationKeys = new Map();
  for (const path of paths) {
    if (exact.has(path)) fail("duplicate_path", `${label}: ${path}`);
    exact.add(path);
    const caseKey = path.replace(/[A-Z]/g, (character) => character.toLowerCase());
    if (caseKeys.has(caseKey) && caseKeys.get(caseKey) !== path) fail("case_path_collision", `${caseKeys.get(caseKey)} <> ${path}`);
    caseKeys.set(caseKey, path);
    const normalizationKey = path.normalize("NFC");
    if (normalizationKeys.has(normalizationKey) && normalizationKeys.get(normalizationKey) !== path) {
      fail("unicode_path_collision", `${normalizationKeys.get(normalizationKey)} <> ${path}`);
    }
    normalizationKeys.set(normalizationKey, path);
  }
}

export function validatePortableAssetPath(path) {
  if (path === MANIFEST_ARCHIVE_PATH) fail("reserved_path_collision", path);
  if (typeof path !== "string" || !path.startsWith("assets/") || path.startsWith("/") || path.includes("\\")
    || path.includes("?") || path.includes("#") || hasPathControl(path) || BAD_PERCENT.test(path)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || Buffer.byteLength(path, "utf8") > RESOURCE_LIMITS.pathBytes) {
    fail("unsafe_asset_path", String(path));
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || !PORTABLE_SEGMENT.test(segment)
    || WINDOWS_RESERVED.test(segment) || segment.endsWith(".") || segment.endsWith(" "))) {
    fail("nonportable_asset_path", path);
  }
  return path;
}

export function assertPackResourceLimits({ sourceJsonBytes, assetCount, entryCount, recordCount, totalAssetBytes }) {
  const values = { sourceJsonBytes, assetCount, entryCount, recordCount, totalAssetBytes };
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isSafeInteger(value) || value < 0) fail("invalid_resource_count", key);
  }
  if (sourceJsonBytes > RESOURCE_LIMITS.sourceJsonBytes) fail("source_json_too_large", String(sourceJsonBytes));
  if (assetCount === 0 || assetCount > RESOURCE_LIMITS.assetCount) fail("asset_count_limit", String(assetCount));
  if (entryCount === 0 || entryCount > RESOURCE_LIMITS.entryCount) fail("entry_count_limit", String(entryCount));
  if (recordCount > RESOURCE_LIMITS.recordCount) fail("record_count_limit", String(recordCount));
  if (totalAssetBytes > RESOURCE_LIMITS.totalAssetBytes) fail("total_asset_bytes_limit", String(totalAssetBytes));
}

function assertSourceSchema(source, sourceJsonBytes) {
  assertExactFields(source, SOURCE_ROOT_FIELDS, "pack-source");
  for (const [field, fields] of [["reviews", REVIEW_FIELDS], ["licenses", LICENSE_FIELDS], ["sources", SOURCE_FIELDS], ["assets", SOURCE_ASSET_FIELDS], ["entries", ENTRY_FIELDS]]) {
    assertDenseArray(source[field], field);
    source[field].forEach((record, index) => assertExactFields(record, fields, `${field}[${index}]`));
  }
  source.entries.forEach((entry, index) => {
    assertExactFields(entry.loop, LOOP_FIELDS, `entries[${index}].loop`);
    assertExactFields(entry.defaultCamera, CAMERA_FIELDS, `entries[${index}].defaultCamera`);
    assertDenseArray(entry.defaultCamera.position, `entries[${index}].defaultCamera.position`);
    assertDenseArray(entry.defaultCamera.target, `entries[${index}].defaultCamera.target`);
    assertDenseArray(entry.equipmentProps, `entries[${index}].equipmentProps`);
  });
  assertPackResourceLimits({
    sourceJsonBytes,
    assetCount: source.assets.length,
    entryCount: source.entries.length,
    recordCount: source.reviews.length + source.licenses.length + source.sources.length + source.assets.length + source.entries.length,
    totalAssetBytes: 0
  });
  if (source.animationPackSchemaVersion !== animationPackSchemaVersion
    || source.animationPlayerProtocolVersion !== animationPlayerProtocolVersion
    || source.animationCatalogVersion !== animationCatalogVersion) fail("unsupported_source_version", "only public v1 is supported");
}

function assertContained(rootReal, candidateReal, label) {
  const rel = relative(rootReal, candidateReal);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("source_root_escape", label);
}

function statIdentity(value) {
  return [value.dev, value.ino, value.size, value.mtimeMs, value.ctimeMs].join(":");
}

async function readStableRegularFile(path, rootReal, label, hooks) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) fail("non_regular_file", label);
  if (before.size <= 0) fail("empty_asset", label);
  if (before.size > RESOURCE_LIMITS.assetBytes) fail("asset_byte_limit", label);
  const candidateReal = await realpath(path);
  assertContained(rootReal, candidateReal, label);
  const immediate = await lstat(path);
  if (statIdentity(before) !== statIdentity(immediate)) fail("source_changed", label);
  await hooks?.afterImmediateStat?.(path, label);
  const bytes = await readFile(path).catch(() => fail("unreadable_asset", label));
  await hooks?.afterAssetRead?.(path, label);
  const after = await lstat(path);
  if (statIdentity(immediate) !== statIdentity(after) || bytes.length !== after.size) fail("source_changed", label);
  return bytes;
}

export function classifySourceEntryKind(info, label = "source entry") {
  if (info.isSymbolicLink()) fail("source_link", label);
  if (info.isDirectory()) return "directory";
  if (info.isFile()) return "file";
  fail("source_special_file", label);
}

async function walkSource(root, current = "") {
  const directory = join(root, current);
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const relativePath = current === "" ? entry.name : `${current}/${entry.name}`;
    const path = join(directory, entry.name);
    const info = await lstat(path);
    const kind = classifySourceEntryKind(info, relativePath);
    if (entry.isDirectory() && kind === "directory") {
      results.push({ path: relativePath, type: "directory" }, ...(await walkSource(root, relativePath)));
    } else if (entry.isFile() && kind === "file") {
      results.push({ path: relativePath, type: "file" });
    } else {
      fail("source_special_file", relativePath);
    }
  }
  return results;
}

function validateGltfUris(value, label) {
  assertPlainObject(value, label);
  if (!isRecordWithVersion(value.asset) || value.asset.version !== "2.0") fail("gltf_asset_version", label);
  for (const field of ["buffers", "images"]) {
    if (value[field] === undefined) continue;
    if (!Array.isArray(value[field])) fail("gltf_uri_shape", `${label}.${field}`);
    value[field].forEach((record, index) => {
      if (record === null || typeof record !== "object" || Array.isArray(record)) fail("gltf_uri_shape", `${label}.${field}[${index}]`);
      if (Object.hasOwn(record, "uri") && (typeof record.uri !== "string" || !record.uri.startsWith("data:"))) {
        fail("external_gltf_uri", `${label}.${field}[${index}]`);
      }
    });
  }
}

function isRecordWithVersion(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateGlbEnvelope(bytes, label = "GLB") {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "glTF") fail("glb_magic", label);
  if (buffer.readUInt32LE(4) !== 2) fail("glb_version", label);
  if (buffer.readUInt32LE(8) !== buffer.length) fail("glb_length", label);
  let offset = 12;
  let chunkIndex = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length || offset % 4 !== 0) fail("glb_chunk_alignment", label);
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (length % 4 !== 0 || end > buffer.length) fail("glb_chunk_length", label);
    if (chunkIndex === 0) {
      if (type !== 0x4e4f534a) fail("glb_first_chunk", label);
      const jsonBytes = buffer.subarray(offset + 8, end);
      let json;
      try {
        let jsonEnd = jsonBytes.length;
        while (jsonEnd > 0 && (jsonBytes[jsonEnd - 1] === 0x20 || jsonBytes[jsonEnd - 1] === 0)) jsonEnd -= 1;
        const text = new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes.subarray(0, jsonEnd));
        json = parseStrictJsonBytes(Buffer.from(text, "utf8"), `${label} JSON chunk`);
      } catch (error) {
        if (error instanceof AnimationPackBuildError) throw error;
        fail("glb_json", label);
      }
      validateGltfUris(json, label);
    }
    offset = end;
    chunkIndex += 1;
  }
  if (offset !== buffer.length || chunkIndex === 0) fail("glb_trailing_bytes", label);
}

export function validateGltfEnvelope(bytes, label = "glTF") {
  const json = parseStrictJsonBytes(bytes, label);
  validateGltfUris(json, label);
}

function validateAssetEnvelope(asset, bytes) {
  if (asset.mediaType === "model/gltf-binary") {
    if (!asset.path.endsWith(".glb")) fail("asset_extension", asset.path);
    validateGlbEnvelope(bytes, asset.path);
  } else if (asset.mediaType === "model/gltf+json") {
    if (!asset.path.endsWith(".gltf")) fail("asset_extension", asset.path);
    validateGltfEnvelope(bytes, asset.path);
  } else {
    fail("asset_media_type", asset.path);
  }
}

function assertReviewDates(manifest) {
  const releaseDate = manifest.releaseDate;
  if (manifest.createdAt > releaseDate || manifest.review.reviewedAt > releaseDate) fail("review_after_release", "release review");
  for (const record of [...manifest.reviews, ...manifest.licenses, ...manifest.sources]) {
    if (record.reviewedAt > releaseDate) fail("review_after_release", record.id);
  }
}

function assertDigestAbsent(value, digests, path = "$") {
  if (typeof value === "string" && digests.has(value)) fail("manifest_contains_descriptor_digest", path);
  if (Array.isArray(value)) value.forEach((item, index) => assertDigestAbsent(item, digests, `${path}[${index}]`));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (["archiveByteSize", "archiveSha256", "manifestPath", "manifestByteSize", "manifestSha256"].includes(key)) fail("descriptor_field_in_manifest", `${path}.${key}`);
      assertDigestAbsent(item, digests, `${path}.${key}`);
    }
  }
}

export async function validateAnimationPackSource(sourceRoot, options = {}) {
  const root = resolve(sourceRoot);
  const rootInfo = await lstat(root).catch(() => fail("missing_source_root", root));
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail("invalid_source_root", root);
  const rootReal = await realpath(root);
  const inventory = await walkSource(root);
  const files = inventory.filter((entry) => entry.type === "file").map((entry) => entry.path);
  const directories = inventory.filter((entry) => entry.type === "directory").map((entry) => entry.path);
  if (!files.includes("pack-source.json")) fail("missing_pack_source", root);
  if (!directories.includes("assets")) fail("missing_assets_directory", root);
  if (directories.some((path) => path !== "assets" && !path.startsWith("assets/"))) fail("unexpected_source_directory", root);
  if (files.some((path) => path !== "pack-source.json" && !path.startsWith("assets/"))) fail("unexpected_source_file", root);
  const sourcePath = join(root, "pack-source.json");
  const sourceStat = await lstat(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.size > RESOURCE_LIMITS.sourceJsonBytes) fail("invalid_pack_source", sourcePath);
  const sourceBytes = await readFile(sourcePath).catch(() => fail("unreadable_pack_source", sourcePath));
  const sourceAfter = await lstat(sourcePath);
  if (statIdentity(sourceStat) !== statIdentity(sourceAfter)) fail("source_changed", "pack-source.json");
  const source = parseStrictJsonBytes(sourceBytes, "pack-source.json");
  assertSourceSchema(source, sourceBytes.length);
  const declaredPaths = source.assets.map((asset) => asset.path);
  assertPathCollisions(declaredPaths, "asset declarations");
  if (declaredPaths.includes(MANIFEST_ARCHIVE_PATH)) fail("reserved_path_collision", MANIFEST_ARCHIVE_PATH);
  assertPathCollisions([...new Set([...declaredPaths, ...files.filter((path) => path.startsWith("assets/")), MANIFEST_ARCHIVE_PATH])], "portable inventory");
  declaredPaths.forEach(validatePortableAssetPath);
  files.filter((path) => path.startsWith("assets/")).forEach(validatePortableAssetPath);
  const inventoryAssets = files.filter((path) => path.startsWith("assets/")).sort(compareRaw);
  const declaredSorted = [...declaredPaths].sort(compareRaw);
  const inventoryByPath = new Map(inventory.map((entry) => [entry.path, entry.type]));
  for (const path of declaredPaths) {
    if (inventoryByPath.has(path) && inventoryByPath.get(path) !== "file") fail("non_regular_file", path);
  }
  if (JSON.stringify(inventoryAssets) !== JSON.stringify(declaredSorted)) fail("asset_inventory_mismatch", JSON.stringify({ inventoryAssets, declaredSorted }));
  const assetBytes = new Map();
  let totalAssetBytes = 0;
  for (const asset of source.assets) {
    const resolved = resolve(root, ...asset.path.split("/"));
    assertContained(rootReal, resolved, asset.path);
    const bytes = await readStableRegularFile(resolved, rootReal, asset.path, options.hooks);
    validateAssetEnvelope(asset, bytes);
    totalAssetBytes += bytes.length;
    assetBytes.set(asset.path, bytes);
  }
  assertPackResourceLimits({
    sourceJsonBytes: sourceBytes.length,
    assetCount: source.assets.length,
    entryCount: source.entries.length,
    recordCount: source.reviews.length + source.licenses.length + source.sources.length + source.assets.length + source.entries.length,
    totalAssetBytes
  });
  const boundReviews = source.reviews.filter((review) => review.id === source.releaseReviewId);
  if (boundReviews.length !== 1) fail("release_review_binding", source.releaseReviewId);
  const manifestInput = schemaSortManifest({
    packId: source.packId,
    version: source.version,
    animationPackSchemaVersion: source.animationPackSchemaVersion,
    animationPlayerProtocolVersion: source.animationPlayerProtocolVersion,
    animationCatalogVersion: source.animationCatalogVersion,
    minimumAppVersion: source.minimumAppVersion,
    releaseDate: source.releaseDate,
    createdAt: source.createdAt,
    review: boundReviews[0],
    reviews: source.reviews,
    licenses: source.licenses,
    sources: source.sources,
    assets: source.assets.map((asset) => ({
      ...asset,
      byteSize: assetBytes.get(asset.path).length,
      sha256: sha256Bytes(assetBytes.get(asset.path))
    })),
    entries: source.entries
  });
  const manifest = validationData(parseAnimationPackManifest(manifestInput), "manifest");
  assertReviewDates(manifest);
  const manifestBytes = canonicalJsonBytes(manifest);
  const reparsed = parseStrictJsonBytes(manifestBytes, "canonical manifest");
  const revalidated = validationData(parseAnimationPackManifest(reparsed), "canonical manifest round trip");
  if (!canonicalJsonBytes(schemaSortManifest(revalidated)).equals(manifestBytes)) fail("manifest_round_trip", "canonical bytes differ");
  return { root, source, manifest, manifestBytes, assetBytes };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function buildDeterministicZip(manifestBytes, assetBytes) {
  const entries = new Map([[MANIFEST_ARCHIVE_PATH, Buffer.from(manifestBytes)], ...assetBytes.entries()]);
  const names = [...entries.keys()].sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));
  assertPathCollisions(names, "archive entries");
  const zip = new JSZip();
  for (const name of names) {
    zip.file(name, entries.get(name), {
      binary: true,
      date: FIXED_DATE,
      compression: "STORE",
      createFolders: false,
      dir: false,
      unixPermissions: FILE_MODE
    });
  }
  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "STORE",
    streamFiles: false,
    platform: "UNIX",
    comment: ""
  });
  await verifyRawZip(bytes, entries);
  return bytes;
}

function readName(buffer, offset, length) {
  const nameBytes = buffer.subarray(offset, offset + length);
  if ([...nameBytes].some((byte) => byte > 0x7f)) fail("zip_non_ascii_name", nameBytes.toString("hex"));
  return nameBytes.toString("ascii");
}

export async function verifyRawZip(bytes, expectedEntries) {
  const buffer = Buffer.from(bytes);
  const expected = expectedEntries instanceof Map ? expectedEntries : new Map(Object.entries(expectedEntries));
  if (buffer.length < 22) fail("corrupt_zip", "too short");
  const eocdOffset = buffer.length - 22;
  if (buffer.readUInt32LE(eocdOffset) !== 0x06054b50 || buffer.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) !== eocdOffset) fail("zip_eocd", "EOCD position/count");
  const disk = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const diskCount = buffer.readUInt16LE(eocdOffset + 8);
  const totalCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentLength = buffer.readUInt16LE(eocdOffset + 20);
  if (disk || centralDisk || diskCount !== totalCount || totalCount !== expected.size || commentLength || centralOffset + centralSize !== eocdOffset) fail("zip_eocd_policy", "counts/offset/comment");
  const central = [];
  let offset = centralOffset;
  for (let index = 0; index < totalCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) fail("zip_central_signature", String(index));
    const madeBy = buffer.readUInt16LE(offset + 4);
    const needed = buffer.readUInt16LE(offset + 6);
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const time = buffer.readUInt16LE(offset + 12);
    const date = buffer.readUInt16LE(offset + 14);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const entryCommentLength = buffer.readUInt16LE(offset + 32);
    const startDisk = buffer.readUInt16LE(offset + 34);
    const internalAttributes = buffer.readUInt16LE(offset + 36);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = readName(buffer, offset + 46, nameLength);
    if (madeBy !== 0x031e || needed !== 10 || flags !== 0 || method !== 0 || time !== FIXED_DOS_TIME || date !== FIXED_DOS_DATE
      || extraLength || entryCommentLength || startDisk || internalAttributes || externalAttributes !== EXTERNAL_FILE_ATTRIBUTES
      || compressedSize !== size || [compressedSize, size, localOffset].includes(0xffffffff)) fail("zip_central_policy", name);
    central.push({ name, crc, size, localOffset });
    offset += 46 + nameLength + extraLength + entryCommentLength;
  }
  if (offset !== eocdOffset) fail("zip_central_size", String(offset));
  const expectedNames = [...expected.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  if (JSON.stringify(central.map((entry) => entry.name)) !== JSON.stringify(expectedNames)) fail("zip_entry_order", JSON.stringify(central.map((entry) => entry.name)));
  let localEnd = 0;
  for (const entry of central) {
    offset = entry.localOffset;
    if (offset !== localEnd || buffer.readUInt32LE(offset) !== 0x04034b50) fail("zip_local_offset", entry.name);
    const needed = buffer.readUInt16LE(offset + 4);
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const time = buffer.readUInt16LE(offset + 10);
    const date = buffer.readUInt16LE(offset + 12);
    const crc = buffer.readUInt32LE(offset + 14);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const size = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = readName(buffer, offset + 30, nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + size);
    const expectedBytes = Buffer.from(expected.get(name) ?? []);
    if (name !== entry.name || needed !== 10 || flags !== 0 || method !== 0 || time !== FIXED_DOS_TIME || date !== FIXED_DOS_DATE
      || extraLength || crc !== entry.crc || compressedSize !== size || size !== entry.size || size !== expectedBytes.length
      || crc !== crc32(data) || !data.equals(expectedBytes)) fail("zip_local_policy", name);
    localEnd = dataStart + size;
  }
  if (localEnd !== centralOffset) fail("zip_prefix_or_gap", String(localEnd));
  let loaded;
  try { loaded = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false }); } catch { fail("zip_crc", "JSZip rejected archive"); }
  const loadedNames = Object.keys(loaded.files).filter((name) => !loaded.files[name].dir).sort(compareRaw);
  if (JSON.stringify(loadedNames) !== JSON.stringify(expectedNames)) fail("zip_extraction_inventory", JSON.stringify(loadedNames));
  for (const name of loadedNames) {
    const extracted = await loaded.files[name].async("nodebuffer");
    if (!extracted.equals(Buffer.from(expected.get(name)))) fail("zip_extraction_bytes", name);
  }
  return { entries: central, centralOffset, centralSize, eocdOffset };
}

export async function createAnimationPackArtifacts(validatedSource) {
  const { manifest, manifestBytes, assetBytes } = validatedSource;
  const archiveBytes = await buildDeterministicZip(manifestBytes, assetBytes);
  const descriptorInput = {
    packId: manifest.packId,
    version: manifest.version,
    animationPackSchemaVersion: manifest.animationPackSchemaVersion,
    animationPlayerProtocolVersion: manifest.animationPlayerProtocolVersion,
    animationCatalogVersion: manifest.animationCatalogVersion,
    minimumAppVersion: manifest.minimumAppVersion,
    releaseDate: manifest.releaseDate,
    review: manifest.review,
    archiveByteSize: archiveBytes.length,
    archiveSha256: sha256Bytes(archiveBytes),
    manifestPath: MANIFEST_ARCHIVE_PATH,
    manifestByteSize: manifestBytes.length,
    manifestSha256: sha256Bytes(manifestBytes)
  };
  const descriptor = validationData(parseAnimationPackReleaseDescriptor(descriptorInput), "release descriptor");
  validationData(validateAnimationPackCompatibility(descriptor, manifest, APP_VERSIONS.app), "descriptor compatibility");
  assertDigestAbsent(manifest, new Set([descriptor.archiveSha256, descriptor.manifestSha256]));
  const descriptorBytes = canonicalJsonBytes(descriptor);
  const descriptorRoundTrip = validationData(parseAnimationPackReleaseDescriptor(parseStrictJsonBytes(descriptorBytes, "canonical descriptor")), "descriptor round trip");
  if (!canonicalJsonBytes(descriptorRoundTrip).equals(descriptorBytes)) fail("descriptor_round_trip", "canonical bytes differ");
  const artifacts = new Map([
    [OUTPUT_FILES[0], manifestBytes],
    [OUTPUT_FILES[1], archiveBytes],
    [OUTPUT_FILES[2], descriptorBytes]
  ]);
  await verifyBuiltArtifacts(artifacts, assetBytes);
  return { artifacts, descriptor, manifest, assetBytes };
}

export async function verifyBuiltArtifacts(artifacts, sourceAssetBytes) {
  const names = [...artifacts.keys()].sort(compareRaw);
  if (JSON.stringify(names) !== JSON.stringify([...OUTPUT_FILES].sort(compareRaw))) fail("output_inventory", JSON.stringify(names));
  const manifestBytes = Buffer.from(artifacts.get(OUTPUT_FILES[0]));
  const archiveBytes = Buffer.from(artifacts.get(OUTPUT_FILES[1]));
  const descriptorBytes = Buffer.from(artifacts.get(OUTPUT_FILES[2]));
  const manifest = validationData(parseAnimationPackManifest(parseStrictJsonBytes(manifestBytes, "built manifest")), "built manifest");
  const descriptor = validationData(parseAnimationPackReleaseDescriptor(parseStrictJsonBytes(descriptorBytes, "built descriptor")), "built descriptor");
  if (!canonicalJsonBytes(schemaSortManifest(manifest)).equals(manifestBytes) || !canonicalJsonBytes(descriptor).equals(descriptorBytes)) fail("noncanonical_artifact", "JSON bytes");
  validationData(validateAnimationPackCompatibility(descriptor, manifest, APP_VERSIONS.app), "built compatibility");
  if (descriptor.manifestPath !== MANIFEST_ARCHIVE_PATH || descriptor.manifestByteSize !== manifestBytes.length
    || descriptor.manifestSha256 !== sha256Bytes(manifestBytes) || descriptor.archiveByteSize !== archiveBytes.length
    || descriptor.archiveSha256 !== sha256Bytes(archiveBytes)) fail("descriptor_digest_mismatch", "artifact bytes");
  assertDigestAbsent(manifest, new Set([descriptor.archiveSha256, descriptor.manifestSha256]));
  const expected = new Map([[MANIFEST_ARCHIVE_PATH, manifestBytes]]);
  for (const asset of manifest.assets) {
    const bytes = sourceAssetBytes.get(asset.path);
    if (!bytes || bytes.length !== asset.byteSize || sha256Bytes(bytes) !== asset.sha256) fail("asset_digest_mismatch", asset.path);
    expected.set(asset.path, bytes);
  }
  if (expected.size !== sourceAssetBytes.size + 1) fail("asset_manifest_inventory", String(expected.size));
  await verifyRawZip(archiveBytes, expected);
  return { manifest, descriptor };
}

async function writeExclusive(path, bytes) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertAbsent(path, code) {
  try { await lstat(path); } catch (error) { if (error?.code === "ENOENT") return; throw error; }
  fail(code, path);
}

export function stagingPathFor(outputDirectory) {
  const output = resolve(outputDirectory);
  return join(dirname(output), `.${basename(output)}.animation-pack-v1.staging`);
}

export async function publishAnimationPack(sourceRoot, outputDirectory, options = {}) {
  const output = resolve(outputDirectory);
  const parent = dirname(output);
  const staging = stagingPathFor(output);
  if (output === resolve(sourceRoot) || output.startsWith(`${resolve(sourceRoot)}${sep}`)) fail("output_inside_source", output);
  await stat(parent).then((info) => { if (!info.isDirectory()) fail("invalid_output_parent", parent); });
  await assertAbsent(output, "output_exists");
  await assertAbsent(staging, "staging_exists");
  const built = await createAnimationPackArtifacts(await validateAnimationPackSource(sourceRoot, options));
  let created = false;
  try {
    await mkdir(staging);
    created = true;
    await writeExclusive(join(staging, OWNER_FILE), OWNER_BYTES);
    options.faultInjector?.("afterMarker");
    for (const name of OUTPUT_FILES) {
      options.faultInjector?.(`beforeWrite:${name}`);
      await writeExclusive(join(staging, name), built.artifacts.get(name));
      options.faultInjector?.(`afterWrite:${name}`);
    }
    options.faultInjector?.("beforeVerify");
    const stagedArtifacts = new Map();
    for (const name of OUTPUT_FILES) stagedArtifacts.set(name, await readFile(join(staging, name)));
    await verifyBuiltArtifacts(stagedArtifacts, built.assetBytes);
    options.faultInjector?.("afterVerify");
    const owner = await readFile(join(staging, OWNER_FILE));
    if (!owner.equals(OWNER_BYTES)) fail("staging_owner_mismatch", staging);
    await assertAbsent(output, "output_race");
    options.faultInjector?.("beforeRename");
    await unlink(join(staging, OWNER_FILE));
    await rename(staging, output);
    return { ...built, outputDirectory: output };
  } catch (error) {
    if (created) {
      const resolvedStaging = resolve(staging);
      if (dirname(resolvedStaging) !== resolve(parent) || resolvedStaging !== stagingPathFor(output)) throw new AggregateError([error], "Unsafe staging cleanup refused", { cause: error });
      let ownerMatches;
      try { ownerMatches = (await readFile(join(staging, OWNER_FILE))).equals(OWNER_BYTES); } catch { ownerMatches = true; }
      if (!ownerMatches) throw new AggregateError([error], "Staging ownership proof failed", { cause: error });
      await rm(staging, { recursive: true });
    }
    throw error;
  }
}

export async function readOutputArtifacts(outputDirectory) {
  const entries = await readdir(outputDirectory, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile()) || JSON.stringify(entries.map((entry) => entry.name).sort(compareRaw)) !== JSON.stringify([...OUTPUT_FILES].sort(compareRaw))) {
    fail("output_inventory", outputDirectory);
  }
  return new Map(await Promise.all(OUTPUT_FILES.map(async (name) => [name, await readFile(join(outputDirectory, name))])));
}
