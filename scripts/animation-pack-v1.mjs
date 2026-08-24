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
  unlink
} from "node:fs/promises";
import { createRequire, register } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";

// The public workspace package exports TypeScript and its index has one
// extensionless relative export. The asynchronous built-in loader registration
// API exists at the repository's Node floor; its loader uses the Node 22.13
// type-stripper and completes only relative public-contract TypeScript lookups.
const contractsLoaderSource = `
  import { readFile } from "node:fs/promises";
  import { stripTypeScriptTypes } from "node:module";

  export async function resolve(specifier, context, nextResolve) {
    try {
      return await nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && context.parentURL?.includes("/packages/contracts/")) {
        return nextResolve(specifier + ".ts", context);
      }
      throw error;
    }
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
register(`data:text/javascript,${encodeURIComponent(contractsLoaderSource)}`, import.meta.url);

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

function normalizedPhysicalPath(path) {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertUnaliasedPath(path, physicalPath, code) {
  if (normalizedPhysicalPath(path) !== normalizedPhysicalPath(physicalPath)) fail(code, path);
}

function objectIdentity(value) {
  return [value.dev, value.ino, value.mode].join(":");
}

function stableIdentity(value) {
  return [objectIdentity(value), value.size, value.mtimeNs, value.ctimeNs].join(":");
}

async function lstatIdentity(path) {
  return lstat(path, { bigint: true });
}

async function readStableRegularFile(path, rootReal, label, expected, hooks) {
  const before = await lstatIdentity(path).catch(() => fail("source_changed", label));
  if (!before.isFile() || before.isSymbolicLink()) fail("non_regular_file", label);
  if (before.size <= 0) fail("empty_asset", label);
  if (before.size > BigInt(RESOURCE_LIMITS.assetBytes)) fail("asset_byte_limit", label);
  if (stableIdentity(before) !== expected.identity) fail("source_changed", label);
  const candidateReal = await realpath(path);
  assertContained(rootReal, candidateReal, label);
  const immediate = await lstatIdentity(path).catch(() => fail("source_changed", label));
  if (stableIdentity(before) !== stableIdentity(immediate)) fail("source_changed", label);
  await hooks?.afterImmediateStat?.(path, label);
  const bytes = await readFile(path).catch(() => fail("unreadable_asset", label));
  await hooks?.afterAssetRead?.(path, label);
  const after = await lstatIdentity(path).catch(() => fail("source_changed", label));
  if (stableIdentity(immediate) !== stableIdentity(after) || BigInt(bytes.length) !== after.size) fail("source_changed", label);
  return bytes;
}

export function classifySourceEntryKind(info, label = "source entry") {
  if (info.isSymbolicLink()) fail("source_link", label);
  if (info.isDirectory()) return "directory";
  if (info.isFile()) return "file";
  fail("source_special_file", label);
}

async function walkSource(root, current = "", hooks) {
  const directory = join(root, current);
  const readEntries = hooks?.readDirectory
    ? await hooks.readDirectory(directory, current)
    : await readdir(directory, { withFileTypes: true });
  const entries = [...readEntries].sort((left, right) => compareRaw(left.name, right.name));
  const results = [];
  for (const entry of entries) {
    const relativePath = current === "" ? entry.name : `${current}/${entry.name}`;
    const path = join(directory, entry.name);
    const info = await lstatIdentity(path);
    const kind = classifySourceEntryKind(info, relativePath);
    if (entry.isDirectory() && kind === "directory") {
      results.push(
        { path: relativePath, type: "directory", identity: stableIdentity(info), objectIdentity: objectIdentity(info), size: Number(info.size) },
        ...(await walkSource(root, relativePath, hooks))
      );
    } else if (entry.isFile() && kind === "file") {
      results.push({ path: relativePath, type: "file", identity: stableIdentity(info), objectIdentity: objectIdentity(info), size: Number(info.size) });
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
        while (jsonEnd > 0 && jsonBytes[jsonEnd - 1] === 0x20) jsonEnd -= 1;
        if (jsonEnd === 0 || jsonBytes[jsonEnd - 1] <= 0x20 || jsonBytes[jsonEnd - 1] === 0x7f) {
          fail("glb_json_padding", label);
        }
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

function sourceSnapshotDifference(expected, actual) {
  const paths = [...new Set([...expected.records.keys(), ...actual.records.keys()])].sort(compareRaw);
  for (const path of paths) {
    const before = expected.records.get(path);
    const after = actual.records.get(path);
    if (JSON.stringify(before) !== JSON.stringify(after)) return path;
  }
  return undefined;
}

async function captureSourceSnapshot(root, hooks) {
  const rootInfo = await lstatIdentity(root).catch(() => fail("missing_source_root", root));
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail("invalid_source_root", root);
  const rootReal = await realpath(root);
  assertUnaliasedPath(root, rootReal, "source_root_alias");
  const immediateRoot = await lstatIdentity(root);
  if (stableIdentity(rootInfo) !== stableIdentity(immediateRoot)) fail("source_changed", ".");
  const inventory = await walkSource(root, "", hooks);
  const afterRoot = await lstatIdentity(root);
  if (stableIdentity(immediateRoot) !== stableIdentity(afterRoot)) fail("source_changed", ".");
  const records = new Map([[".", {
    path: ".",
    type: "directory",
    identity: stableIdentity(afterRoot),
    objectIdentity: objectIdentity(afterRoot),
    size: Number(afterRoot.size)
  }], ...inventory.map((entry) => [entry.path, entry])]);
  return { root, rootReal, inventory, records };
}

async function assertSourceSnapshotStable(expected, hooks, phase) {
  await hooks?.beforeSourceSnapshotRecheck?.(phase, expected.root);
  const actual = await captureSourceSnapshot(expected.root, hooks);
  if (normalizedPhysicalPath(actual.rootReal) !== normalizedPhysicalPath(expected.rootReal)) fail("source_changed", ".");
  const difference = sourceSnapshotDifference(expected, actual);
  if (difference !== undefined) fail("source_changed", `${phase}:${difference}`);
}

async function readStablePackSource(path, snapshot, hooks) {
  const expected = snapshot.records.get("pack-source.json");
  if (!expected || expected.type !== "file") fail("missing_pack_source", snapshot.root);
  const before = await lstatIdentity(path).catch(() => fail("source_changed", "pack-source.json"));
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(RESOURCE_LIMITS.sourceJsonBytes)) fail("invalid_pack_source", path);
  if (stableIdentity(before) !== expected.identity) fail("source_changed", "pack-source.json");
  const candidateReal = await realpath(path);
  assertContained(snapshot.rootReal, candidateReal, "pack-source.json");
  const bytes = await readFile(path).catch(() => fail("unreadable_pack_source", path));
  await hooks?.afterPackSourceRead?.(path);
  const after = await lstatIdentity(path).catch(() => fail("source_changed", "pack-source.json"));
  if (stableIdentity(before) !== stableIdentity(after) || BigInt(bytes.length) !== after.size) fail("source_changed", "pack-source.json");
  return bytes;
}

function preflightAssetReads(source, snapshot) {
  let totalAssetBytes = 0;
  const plan = [...source.assets].sort((left, right) => compareRaw(left.path, right.path));
  for (const asset of plan) {
    const expected = snapshot.records.get(asset.path);
    if (!expected || expected.type !== "file") fail("asset_inventory_mismatch", asset.path);
    if (expected.size <= 0) fail("empty_asset", asset.path);
    if (expected.size > RESOURCE_LIMITS.assetBytes) fail("asset_byte_limit", asset.path);
    totalAssetBytes += expected.size;
    if (totalAssetBytes > RESOURCE_LIMITS.totalAssetBytes) fail("total_asset_bytes_limit", asset.path);
  }
  return { plan, totalAssetBytes };
}

export async function validateAnimationPackSource(sourceRoot, options = {}) {
  const root = resolve(sourceRoot);
  const sourceSnapshot = await captureSourceSnapshot(root, options.hooks);
  await options.hooks?.afterSourceSnapshot?.(sourceSnapshot);
  const { inventory, rootReal } = sourceSnapshot;
  const files = inventory.filter((entry) => entry.type === "file").map((entry) => entry.path);
  const directories = inventory.filter((entry) => entry.type === "directory").map((entry) => entry.path);
  if (!files.includes("pack-source.json")) fail("missing_pack_source", root);
  if (!directories.includes("assets")) fail("missing_assets_directory", root);
  if (directories.some((path) => path !== "assets" && !path.startsWith("assets/"))) fail("unexpected_source_directory", root);
  if (files.some((path) => path !== "pack-source.json" && !path.startsWith("assets/"))) fail("unexpected_source_file", root);
  const sourcePath = join(root, "pack-source.json");
  const sourceBytes = await readStablePackSource(sourcePath, sourceSnapshot, options.hooks);
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
  const { plan: assetReadPlan, totalAssetBytes } = preflightAssetReads(source, sourceSnapshot);
  await options.hooks?.afterAssetSizePreflight?.(assetReadPlan.map((asset) => ({ path: asset.path, size: sourceSnapshot.records.get(asset.path).size })));
  const assetBytes = new Map();
  for (const asset of assetReadPlan) {
    const resolved = resolve(root, ...asset.path.split("/"));
    assertContained(rootReal, resolved, asset.path);
    const bytes = await readStableRegularFile(resolved, rootReal, asset.path, sourceSnapshot.records.get(asset.path), options.hooks);
    validateAssetEnvelope(asset, bytes);
    assetBytes.set(asset.path, bytes);
  }
  assertPackResourceLimits({
    sourceJsonBytes: sourceBytes.length,
    assetCount: source.assets.length,
    entryCount: source.entries.length,
    recordCount: source.reviews.length + source.licenses.length + source.sources.length + source.assets.length + source.entries.length,
    totalAssetBytes
  });
  await assertSourceSnapshotStable(sourceSnapshot, options.hooks, "after_validation_reads");
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
  return { root, source, manifest, manifestBytes, assetBytes, sourceSnapshot, hooks: options.hooks };
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

function terminalEocdOffsets(buffer) {
  const signature = 0x06054b50;
  const offsets = [];
  const firstPossible = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = firstPossible; offset <= buffer.length - 22; offset += 1) {
    if (buffer.readUInt32LE(offset) !== signature) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) offsets.push(offset);
  }
  return offsets;
}

export async function verifyRawZip(bytes, expectedEntries) {
  const buffer = Buffer.from(bytes);
  const expected = expectedEntries instanceof Map ? expectedEntries : new Map(Object.entries(expectedEntries));
  if (buffer.length < 22) fail("corrupt_zip", "too short");
  const eocdOffsets = terminalEocdOffsets(buffer);
  if (eocdOffsets.length !== 1) fail("zip_eocd", "structurally valid terminal EOCD count");
  const [eocdOffset] = eocdOffsets;
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

export async function createAnimationPackArtifacts(validatedSource, options = {}) {
  const { manifest, manifestBytes, assetBytes, sourceSnapshot } = validatedSource;
  const hooks = options.hooks ?? validatedSource.hooks;
  await hooks?.beforeArtifactCreation?.(validatedSource);
  await assertSourceSnapshotStable(sourceSnapshot, hooks, "before_artifact_creation");
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
  await hooks?.afterArtifactCreation?.({ artifacts, descriptor, manifest, assetBytes });
  await assertSourceSnapshotStable(sourceSnapshot, hooks, "after_artifact_creation");
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

function isAtOrInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function preparePublicationContext(validatedSource, outputDirectory) {
  const output = resolve(outputDirectory);
  const parent = dirname(output);
  const staging = stagingPathFor(output);
  const parentInfo = await lstatIdentity(parent).catch(() => fail("invalid_output_parent", parent));
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) fail("invalid_output_parent", parent);
  const parentReal = await realpath(parent);
  assertUnaliasedPath(parent, parentReal, "output_parent_alias");
  const immediateParent = await lstatIdentity(parent);
  if (objectIdentity(parentInfo) !== objectIdentity(immediateParent)) fail("output_parent_changed", parent);
  const outputPhysical = join(parentReal, basename(output));
  const stagingPhysical = join(parentReal, basename(staging));
  if (isAtOrInside(validatedSource.sourceSnapshot.rootReal, outputPhysical)
    || isAtOrInside(validatedSource.sourceSnapshot.rootReal, stagingPhysical)) {
    fail("output_inside_source", output);
  }
  await assertAbsent(output, "output_exists");
  await assertAbsent(staging, "staging_exists");
  return {
    output,
    parent,
    parentReal,
    parentIdentity: objectIdentity(immediateParent),
    outputPhysical,
    staging,
    stagingPhysical,
    stagingIdentity: undefined
  };
}

async function assertPublicationContextStable(context, validatedSource, phase, stagingState) {
  await validatedSource.hooks?.beforePublicationContextRecheck?.(phase, context);
  await assertSourceSnapshotStable(validatedSource.sourceSnapshot, validatedSource.hooks, phase);
  const parentInfo = await lstatIdentity(context.parent).catch(() => fail("output_parent_changed", context.parent));
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || objectIdentity(parentInfo) !== context.parentIdentity) {
    fail("output_parent_changed", context.parent);
  }
  const parentReal = await realpath(context.parent);
  if (normalizedPhysicalPath(parentReal) !== normalizedPhysicalPath(context.parentReal)) fail("output_parent_changed", context.parent);
  assertUnaliasedPath(context.parent, parentReal, "output_parent_alias");
  if (normalizedPhysicalPath(join(parentReal, basename(context.output))) !== normalizedPhysicalPath(context.outputPhysical)
    || normalizedPhysicalPath(join(parentReal, basename(context.staging))) !== normalizedPhysicalPath(context.stagingPhysical)) {
    fail("output_parent_changed", context.parent);
  }
  await assertAbsent(context.output, "output_race");
  if (stagingState === "absent") {
    await assertAbsent(context.staging, "staging_race");
  } else {
    const stageInfo = await lstatIdentity(context.staging).catch(() => fail("staging_identity_mismatch", context.staging));
    if (!stageInfo.isDirectory() || stageInfo.isSymbolicLink() || objectIdentity(stageInfo) !== context.stagingIdentity) {
      fail("staging_identity_mismatch", context.staging);
    }
    const stageReal = await realpath(context.staging);
    if (normalizedPhysicalPath(stageReal) !== normalizedPhysicalPath(context.stagingPhysical)) fail("staging_identity_mismatch", context.staging);
  }
}

async function assertOwnedStaging(context) {
  const stageInfo = await lstatIdentity(context.staging).catch(() => fail("staging_identity_mismatch", context.staging));
  if (!stageInfo.isDirectory() || stageInfo.isSymbolicLink() || objectIdentity(stageInfo) !== context.stagingIdentity) {
    fail("staging_identity_mismatch", context.staging);
  }
  const stageReal = await realpath(context.staging).catch(() => fail("staging_identity_mismatch", context.staging));
  if (normalizedPhysicalPath(stageReal) !== normalizedPhysicalPath(context.stagingPhysical)) fail("staging_identity_mismatch", context.staging);
  let owner;
  try {
    owner = await readFile(join(context.staging, OWNER_FILE));
  } catch {
    fail("staging_owner_unreadable", context.staging);
  }
  if (!owner.equals(OWNER_BYTES)) fail("staging_owner_mismatch", context.staging);
}

async function cleanupOwnedStaging(context, hooks, originalError) {
  try {
    await assertOwnedStaging(context);
    await hooks?.beforeCleanupRemoval?.(context.staging);
    await assertOwnedStaging(context);
  } catch (ownershipError) {
    throw new AggregateError([originalError, ownershipError], "Staging ownership proof failed", { cause: ownershipError });
  }
  try {
    await rm(context.staging, { recursive: true });
  } catch (cleanupError) {
    throw new AggregateError([originalError, cleanupError], "Owned staging cleanup failed", { cause: cleanupError });
  }
}

export async function publishAnimationPack(sourceRoot, outputDirectory, options = {}) {
  const validatedSource = await validateAnimationPackSource(sourceRoot, options);
  const context = await preparePublicationContext(validatedSource, outputDirectory);
  const built = await createAnimationPackArtifacts(validatedSource, options);
  await options.hooks?.beforePublication?.(context);
  await assertPublicationContextStable(context, validatedSource, "before_publication", "absent");
  let created = false;
  try {
    await mkdir(context.staging);
    created = true;
    const createdStage = await lstatIdentity(context.staging);
    context.stagingIdentity = objectIdentity(createdStage);
    const createdStageReal = await realpath(context.staging);
    if (!createdStage.isDirectory() || createdStage.isSymbolicLink()
      || normalizedPhysicalPath(createdStageReal) !== normalizedPhysicalPath(context.stagingPhysical)) {
      fail("staging_identity_mismatch", context.staging);
    }
    await writeExclusive(join(context.staging, OWNER_FILE), OWNER_BYTES);
    await options.faultInjector?.("afterMarker", context);
    for (const name of OUTPUT_FILES) {
      await options.faultInjector?.(`beforeWrite:${name}`, context);
      await writeExclusive(join(context.staging, name), built.artifacts.get(name));
      await options.faultInjector?.(`afterWrite:${name}`, context);
    }
    await options.faultInjector?.("beforeVerify", context);
    const stagedArtifacts = new Map();
    for (const name of OUTPUT_FILES) stagedArtifacts.set(name, await readFile(join(context.staging, name)));
    await verifyBuiltArtifacts(stagedArtifacts, built.assetBytes);
    await options.faultInjector?.("afterVerify", context);
    await assertPublicationContextStable(context, validatedSource, "after_staged_verification", "owned");
    await assertOwnedStaging(context);
    await options.faultInjector?.("beforeRename", context);
    await assertPublicationContextStable(context, validatedSource, "immediately_before_rename", "owned");
    await assertOwnedStaging(context);
    await unlink(join(context.staging, OWNER_FILE));
    await options.faultInjector?.("afterMarkerRemoval", context);
    await assertPublicationContextStable(context, validatedSource, "after_marker_removal", "owned");
    await rename(context.staging, context.output);
    return { ...built, outputDirectory: context.output };
  } catch (error) {
    if (created) await cleanupOwnedStaging(context, options.hooks, error);
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
