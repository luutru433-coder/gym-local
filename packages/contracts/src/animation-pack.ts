/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Dependency-free v1 contracts for trusted animation-pack release metadata.
 *
 * Canonical IDs use lowercase ASCII alphanumerics separated by `.`, `_`, or `-`.
 * Metadata dates are real proleptic-Gregorian `YYYY-MM-DD` dates with years
 * `0001` through `9999`. Installed timestamps are canonical RFC 3339 timestamps
 * with seconds and either no fraction or exactly milliseconds. URLs are absolute
 * `https` URLs with no credentials, a lowercase ASCII DNS host or bracketed IPv6
 * host, and an optional decimal port from 0 through 65535.
 */

export const animationPackSchemaVersion = 1 as const;
export const animationPlayerProtocolVersion = 1 as const;
export const animationCatalogVersion = 1 as const;

export const ANIMATION_PACK_ERROR_CODES = [
  "incompatible_schema",
  "incompatible_player_protocol",
  "incompatible_animation_catalog",
  "incompatible_minimum_app",
  "descriptor_manifest_identity_mismatch",
  "archive_size_mismatch",
  "archive_checksum_mismatch",
  "manifest_size_mismatch",
  "manifest_checksum_mismatch",
  "asset_size_mismatch",
  "asset_checksum_mismatch",
  "corrupt_archive",
  "missing_asset",
  "missing_variant",
  "missing_source",
  "missing_license",
  "quota_exceeded",
  "activation_failed"
] as const;

export type AnimationPackErrorCode = typeof ANIMATION_PACK_ERROR_CODES[number];
export type AnimationPackPathSegment = string | number;

export interface AnimationPackError {
  code: AnimationPackErrorCode;
  message?: string;
}

export interface AnimationPackValidationIssue {
  code: string;
  path: AnimationPackPathSegment[];
  message?: string;
}

export type AnimationPackValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: AnimationPackValidationIssue[] };

export interface AnimationReviewRecord {
  id: string;
  reviewer: string;
  reviewedAt: string;
  status: "approved";
}

export interface AnimationLicenseRecord {
  id: string;
  name: string;
  termsUrl: string;
  redistributionScope: "offline";
  attribution: string;
  reviewedAt: string;
  reviewId: string;
}

export interface AnimationSourceRecord {
  id: string;
  author: string;
  sourceUrl: string;
  licenseId: string;
  attribution: string;
  modifications: string;
  reviewedAt: string;
  reviewId: string;
}

export interface AnimationAssetDescriptor {
  id: string;
  path: string;
  mediaType: "model/gltf-binary" | "model/gltf+json";
  byteSize: number;
  sha256: string;
  compression: "none";
  rigId: string;
  sourceId: string;
  licenseId: string;
  durationSeconds: number;
}

export interface AnimationCamera {
  preset: "front" | "side" | "three_quarter" | "custom";
  position: [number, number, number];
  target: [number, number, number];
  fovDegrees: number;
}

export interface AnimationPackEntry {
  animationId: string;
  exerciseVariantId: string;
  animationCatalogVersion: number;
  primary: boolean;
  assetId: string;
  assetPath: string;
  clipName: string;
  durationSeconds: number;
  loop: { startSeconds: number; endSeconds: number };
  defaultCamera: AnimationCamera;
  equipmentProps: string[];
  accessibilityFallbackKey: string;
  sourceId: string;
  licenseId: string;
}

export interface AnimationPackReleaseDescriptor {
  packId: string;
  version: string;
  animationPackSchemaVersion: number;
  animationPlayerProtocolVersion: number;
  animationCatalogVersion: number;
  minimumAppVersion: string;
  releaseDate: string;
  review: AnimationReviewRecord;
  archiveByteSize: number;
  archiveSha256: string;
  manifestPath: string;
  manifestByteSize: number;
  manifestSha256: string;
}

export interface AnimationPackManifest {
  packId: string;
  version: string;
  animationPackSchemaVersion: number;
  animationPlayerProtocolVersion: number;
  animationCatalogVersion: number;
  minimumAppVersion: string;
  releaseDate: string;
  createdAt: string;
  review: AnimationReviewRecord;
  reviews: AnimationReviewRecord[];
  licenses: AnimationLicenseRecord[];
  sources: AnimationSourceRecord[];
  assets: AnimationAssetDescriptor[];
  entries: AnimationPackEntry[];
}

interface InstalledAnimationPackCommon {
  packId: string;
  version: string;
  installedByteSize: number;
  installedAt: string;
  verifiedAt: string;
  verification: "verified";
}

export type InstalledAnimationPack =
  | (InstalledAnimationPackCommon & { status: "active"; activePointer: string; previousPointer?: string })
  | (InstalledAnimationPackCommon & { status: "staged"; stagedPointer: string })
  | (InstalledAnimationPackCommon & { status: "previous"; previousPointer: string });

export interface AnimationPlayerRequest {
  exerciseVariantId: string;
  animationId: string;
  playbackSpeed: number;
  cameraPreset: "front" | "side" | "three_quarter" | "custom";
  mirrorMode: "none" | "horizontal";
  reducedMotion: boolean;
}

export type AnimationOfflineFallback = "none" | "text";

export type AnimationPlayerState =
  | { status: "idle"; offlineFallback: "none" }
  | { status: "loading"; request: AnimationPlayerRequest; offlineFallback: AnimationOfflineFallback }
  | { status: "ready"; request: AnimationPlayerRequest; durationSeconds: number; offlineFallback: AnimationOfflineFallback }
  | { status: "playing"; request: AnimationPlayerRequest; positionSeconds: number; durationSeconds: number; offlineFallback: AnimationOfflineFallback }
  | { status: "paused"; request: AnimationPlayerRequest; positionSeconds: number; durationSeconds: number; offlineFallback: AnimationOfflineFallback }
  | { status: "failed"; request?: AnimationPlayerRequest; error: AnimationPackError; recoverable: boolean; offlineFallback: "text" };

type Path = AnimationPackPathSegment[];
type UnknownRecord = Record<string, unknown>;

class ValidationContext {
  readonly issues: AnimationPackValidationIssue[] = [];

  issue(code: string, path: Path, message?: string): void {
    this.issues.push(message === undefined ? { code, path: [...path] } : { code, path: [...path], message });
  }
}

// Double underscore is retained because existing immutable exercise variant IDs
// use it to separate movement identity from the equipment variant.
const ID_PATTERN = /^[a-z0-9]+(?:(?:__|[._-])[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|[+-]\d{2}:\d{2})$/;
const RELATIVE_PATH_BAD_PERCENT = /%(?:2e|2f|5c)/i;
const HTTPS_PATH_BAD_PERCENT_DELIMITER = /%(?:2f|5c)/i;
const HTTPS_PATH_ENCODED_DOT = /%2e/i;
const HTTPS_PATH_DOT_SEGMENT = /^(?:(?:%2e)|\.){1,2}$/i;
const ERROR_CODE_SET = new Set<string>(ANIMATION_PACK_ERROR_CODES);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function record(value: unknown, path: Path, context: ValidationContext): UnknownRecord | undefined {
  if (!isRecord(value)) {
    context.issue("invalid_type", path, "Expected a plain object.");
    return undefined;
  }
  return value;
}

function rejectUnknownFields(value: UnknownRecord, allowed: readonly string[], path: Path, context: ValidationContext): void {
  const allowedSet = new Set(allowed);
  Object.keys(value).filter((key) => !allowedSet.has(key)).sort().forEach((key) => {
    context.issue("unexpected_field", [...path, key]);
  });
}

function stringValue(value: unknown, path: Path, context: ValidationContext, code = "invalid_string"): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    context.issue(code, path);
    return undefined;
  }
  return value;
}

function canonicalId(value: unknown, path: Path, context: ValidationContext): string | undefined {
  const parsed = stringValue(value, path, context, "invalid_id");
  if (parsed !== undefined && (parsed.length > 128 || !ID_PATTERN.test(parsed))) {
    context.issue("invalid_id", path);
    return undefined;
  }
  return parsed;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function hasUrlControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function hasNormalizationSensitivePathEncoding(value: string): boolean {
  const authorityEnd = value.slice("https://".length).search(/[/?#]/);
  if (authorityEnd < 0) return false;
  const pathStart = "https://".length + authorityEnd;
  if (value[pathStart] !== "/") return false;
  const pathEndOffset = value.slice(pathStart).search(/[?#]/);
  const rawPath = pathEndOffset < 0 ? value.slice(pathStart) : value.slice(pathStart, pathStart + pathEndOffset);
  if (HTTPS_PATH_BAD_PERCENT_DELIMITER.test(rawPath)) return true;
  return rawPath.split("/").some((segment) => HTTPS_PATH_ENCODED_DOT.test(segment) && HTTPS_PATH_DOT_SEGMENT.test(segment));
}

function plainText(value: unknown, path: Path, context: ValidationContext): string | undefined {
  const parsed = stringValue(value, path, context);
  if (parsed !== undefined && (parsed.trim() !== parsed || hasControlCharacter(parsed))) {
    context.issue("invalid_string", path);
    return undefined;
  }
  return parsed;
}

function enumValue<const T extends string>(value: unknown, values: readonly T[], path: Path, context: ValidationContext): T | undefined {
  if (typeof value !== "string" || !values.includes(value as T)) {
    context.issue("invalid_enum", path);
    return undefined;
  }
  return value as T;
}

function booleanValue(value: unknown, path: Path, context: ValidationContext): boolean | undefined {
  if (typeof value !== "boolean") {
    context.issue("invalid_boolean", path);
    return undefined;
  }
  return value;
}

function finiteNumber(value: unknown, path: Path, context: ValidationContext, minimum: number, maximum: number, code = "invalid_number"): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0) || value < minimum || value > maximum) {
    context.issue(code, path);
    return undefined;
  }
  return value;
}

function positiveSafeInteger(value: unknown, path: Path, context: ValidationContext): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    context.issue("invalid_byte_size", path);
    return undefined;
  }
  return value;
}

function positiveVersion(value: unknown, path: Path, context: ValidationContext): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    context.issue("invalid_version", path);
    return undefined;
  }
  return value;
}

function semver(value: unknown, path: Path, context: ValidationContext): string | undefined {
  if (typeof value !== "string" || !SEMVER_PATTERN.test(value)) {
    context.issue("invalid_semver", path);
    return undefined;
  }
  return value;
}

function isRealDateParts(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function metadataDate(value: unknown, path: Path, context: ValidationContext): string | undefined {
  if (typeof value !== "string") {
    context.issue("invalid_date", path);
    return undefined;
  }
  const match = DATE_PATTERN.exec(value);
  if (match === null || !isRealDateParts(Number(match[1]), Number(match[2]), Number(match[3]))) {
    context.issue("invalid_date", path);
    return undefined;
  }
  return value;
}

function timestamp(value: unknown, path: Path, context: ValidationContext): string | undefined {
  if (typeof value !== "string") {
    context.issue("invalid_timestamp", path);
    return undefined;
  }
  const match = RFC3339_PATTERN.exec(value);
  if (match === null) {
    context.issue("invalid_timestamp", path);
    return undefined;
  }
  const [, year, month, day, hour, minute, second, , zone] = match;
  const zoneHour = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const zoneMinute = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  if (!isRealDateParts(Number(year), Number(month), Number(day)) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || zoneHour > 14 || zoneMinute > 59 || (zoneHour === 14 && zoneMinute !== 0)) {
    context.issue("invalid_timestamp", path);
    return undefined;
  }
  return value;
}

function sha256(value: unknown, path: Path, context: ValidationContext): string | undefined {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    context.issue("invalid_sha256", path);
    return undefined;
  }
  return value;
}

function httpsUrl(value: unknown, path: Path, context: ValidationContext): string | undefined {
  if (typeof value !== "string" || !value.startsWith("https://") || /[\s\\]/.test(value) || hasUrlControlCharacter(value) || hasNormalizationSensitivePathEncoding(value)) {
    context.issue("invalid_url", path);
    return undefined;
  }
  const authorityMatch = /^https:\/\/([^/?#]+)(?:[/?#]|$)/.exec(value);
  if (authorityMatch === null || authorityMatch[1].includes("@")) {
    context.issue("invalid_url", path);
    return undefined;
  }
  const authority = authorityMatch[1];
  let rawHost: string;
  let rawPort: string | undefined;
  if (authority.startsWith("[")) {
    const closingBracket = authority.indexOf("]");
    if (closingBracket < 0) {
      context.issue("invalid_url", path);
      return undefined;
    }
    rawHost = authority.slice(0, closingBracket + 1);
    const remainder = authority.slice(closingBracket + 1);
    if (remainder !== "") {
      if (!remainder.startsWith(":")) {
        context.issue("invalid_url", path);
        return undefined;
      }
      rawPort = remainder.slice(1);
    }
  } else {
    const firstColon = authority.indexOf(":");
    const lastColon = authority.lastIndexOf(":");
    if (firstColon !== lastColon) {
      context.issue("invalid_url", path);
      return undefined;
    }
    rawHost = firstColon < 0 ? authority : authority.slice(0, firstColon);
    rawPort = firstColon < 0 ? undefined : authority.slice(firstColon + 1);
  }
  const dnsHostIsValid = rawHost.length <= 253
    && rawHost === rawHost.toLowerCase()
    && rawHost.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  if ((!rawHost.startsWith("[") && !dnsHostIsValid) || (rawPort !== undefined && (!/^(?:0|[1-9]\d{0,4})$/.test(rawPort) || Number(rawPort) > 65_535))) {
    context.issue("invalid_url", path);
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hostname === "" || parsed.href !== value) {
      context.issue("invalid_url", path);
      return undefined;
    }
    if (!rawHost.startsWith("[") && parsed.hostname !== rawHost) {
      context.issue("invalid_url", path);
      return undefined;
    }
  } catch {
    context.issue("invalid_url", path);
    return undefined;
  }
  return value;
}

function relativePath(value: unknown, path: Path, context: ValidationContext): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.includes("\\") || value.includes("?") || value.includes("#") || hasControlCharacter(value) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || RELATIVE_PATH_BAD_PERCENT.test(value)) {
    context.issue("invalid_relative_path", path);
    return undefined;
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    context.issue("invalid_relative_path", path);
    return undefined;
  }
  return value;
}

function arrayValue(value: unknown, path: Path, context: ValidationContext): unknown[] | undefined {
  if (!Array.isArray(value)) {
    context.issue("invalid_array", path);
    return undefined;
  }
  return value;
}

function parseArrayElements<T>(
  input: unknown[],
  path: Path,
  context: ValidationContext,
  parser: (item: unknown, itemPath: Path, itemContext: ValidationContext) => T | undefined
): Array<T | undefined> {
  return Array.from({ length: input.length }, (_, index) => {
    if (!Object.hasOwn(input, index)) {
      context.issue("missing_array_element", [...path, index]);
      return undefined;
    }
    return parser(input[index], [...path, index], context);
  });
}

function vector3(value: unknown, path: Path, context: ValidationContext): [number, number, number] | undefined {
  const array = arrayValue(value, path, context);
  if (array === undefined) return undefined;
  if (array.length !== 3) context.issue("invalid_vector", path);
  const components = parseArrayElements(array, path, context, (item, itemPath, itemContext) => finiteNumber(item, itemPath, itemContext, -10_000, 10_000, "invalid_camera_number"));
  if (array.length !== 3 || components.some((item) => item === undefined)) return undefined;
  return components as [number, number, number];
}

function finish<T>(context: ValidationContext, value: T | undefined): AnimationPackValidationResult<T> {
  return context.issues.length === 0 && value !== undefined
    ? { success: true, data: value }
    : { success: false, issues: context.issues };
}

function parseReview(value: unknown, path: Path, context: ValidationContext): AnimationReviewRecord | undefined {
  const input = record(value, path, context);
  if (input === undefined) return undefined;
  rejectUnknownFields(input, ["id", "reviewer", "reviewedAt", "status"], path, context);
  const id = canonicalId(input.id, [...path, "id"], context);
  const reviewer = plainText(input.reviewer, [...path, "reviewer"], context);
  const reviewedAt = metadataDate(input.reviewedAt, [...path, "reviewedAt"], context);
  const status = enumValue(input.status, ["approved"], [...path, "status"], context);
  return id && reviewer && reviewedAt && status ? { id, reviewer, reviewedAt, status } : undefined;
}

function parseLicense(value: unknown, path: Path, context: ValidationContext): AnimationLicenseRecord | undefined {
  const input = record(value, path, context);
  if (input === undefined) return undefined;
  rejectUnknownFields(input, ["id", "name", "termsUrl", "redistributionScope", "attribution", "reviewedAt", "reviewId"], path, context);
  const id = canonicalId(input.id, [...path, "id"], context);
  const name = plainText(input.name, [...path, "name"], context);
  const termsUrl = httpsUrl(input.termsUrl, [...path, "termsUrl"], context);
  const redistributionScope = enumValue(input.redistributionScope, ["offline"], [...path, "redistributionScope"], context);
  const attribution = plainText(input.attribution, [...path, "attribution"], context);
  const reviewedAt = metadataDate(input.reviewedAt, [...path, "reviewedAt"], context);
  const reviewId = canonicalId(input.reviewId, [...path, "reviewId"], context);
  return id && name && termsUrl && redistributionScope && attribution && reviewedAt && reviewId
    ? { id, name, termsUrl, redistributionScope, attribution, reviewedAt, reviewId }
    : undefined;
}

function parseSource(value: unknown, path: Path, context: ValidationContext): AnimationSourceRecord | undefined {
  const input = record(value, path, context);
  if (input === undefined) return undefined;
  rejectUnknownFields(input, ["id", "author", "sourceUrl", "licenseId", "attribution", "modifications", "reviewedAt", "reviewId"], path, context);
  const id = canonicalId(input.id, [...path, "id"], context);
  const author = plainText(input.author, [...path, "author"], context);
  const sourceUrl = httpsUrl(input.sourceUrl, [...path, "sourceUrl"], context);
  const licenseId = canonicalId(input.licenseId, [...path, "licenseId"], context);
  const attribution = plainText(input.attribution, [...path, "attribution"], context);
  const modifications = plainText(input.modifications, [...path, "modifications"], context);
  const reviewedAt = metadataDate(input.reviewedAt, [...path, "reviewedAt"], context);
  const reviewId = canonicalId(input.reviewId, [...path, "reviewId"], context);
  return id && author && sourceUrl && licenseId && attribution && modifications && reviewedAt && reviewId
    ? { id, author, sourceUrl, licenseId, attribution, modifications, reviewedAt, reviewId }
    : undefined;
}

function parseAsset(value: unknown, path: Path, context: ValidationContext): AnimationAssetDescriptor | undefined {
  const input = record(value, path, context);
  if (input === undefined) return undefined;
  rejectUnknownFields(input, ["id", "path", "mediaType", "byteSize", "sha256", "compression", "rigId", "sourceId", "licenseId", "durationSeconds"], path, context);
  const id = canonicalId(input.id, [...path, "id"], context);
  const assetPath = relativePath(input.path, [...path, "path"], context);
  const mediaType = enumValue(input.mediaType, ["model/gltf-binary", "model/gltf+json"], [...path, "mediaType"], context);
  const byteSize = positiveSafeInteger(input.byteSize, [...path, "byteSize"], context);
  const checksum = sha256(input.sha256, [...path, "sha256"], context);
  const compression = enumValue(input.compression, ["none"], [...path, "compression"], context);
  const rigId = canonicalId(input.rigId, [...path, "rigId"], context);
  const sourceId = canonicalId(input.sourceId, [...path, "sourceId"], context);
  const licenseId = canonicalId(input.licenseId, [...path, "licenseId"], context);
  const durationSeconds = finiteNumber(input.durationSeconds, [...path, "durationSeconds"], context, Number.MIN_VALUE, 86_400, "invalid_duration");
  return id && assetPath && mediaType && byteSize && checksum && compression && rigId && sourceId && licenseId && durationSeconds
    ? { id, path: assetPath, mediaType, byteSize, sha256: checksum, compression, rigId, sourceId, licenseId, durationSeconds }
    : undefined;
}

function parseCamera(value: unknown, path: Path, context: ValidationContext): AnimationCamera | undefined {
  const input = record(value, path, context);
  if (input === undefined) return undefined;
  rejectUnknownFields(input, ["preset", "position", "target", "fovDegrees"], path, context);
  const preset = enumValue(input.preset, ["front", "side", "three_quarter", "custom"], [...path, "preset"], context);
  const position = vector3(input.position, [...path, "position"], context);
  const target = vector3(input.target, [...path, "target"], context);
  const fovDegrees = finiteNumber(input.fovDegrees, [...path, "fovDegrees"], context, 10, 120, "invalid_camera_number");
  return preset && position && target && fovDegrees ? { preset, position, target, fovDegrees } : undefined;
}

function parseEntry(value: unknown, path: Path, context: ValidationContext): AnimationPackEntry | undefined {
  const input = record(value, path, context);
  if (input === undefined) return undefined;
  rejectUnknownFields(input, ["animationId", "exerciseVariantId", "animationCatalogVersion", "primary", "assetId", "assetPath", "clipName", "durationSeconds", "loop", "defaultCamera", "equipmentProps", "accessibilityFallbackKey", "sourceId", "licenseId"], path, context);
  const animationId = canonicalId(input.animationId, [...path, "animationId"], context);
  const exerciseVariantId = canonicalId(input.exerciseVariantId, [...path, "exerciseVariantId"], context);
  const catalogVersion = positiveVersion(input.animationCatalogVersion, [...path, "animationCatalogVersion"], context);
  const primary = booleanValue(input.primary, [...path, "primary"], context);
  const assetId = canonicalId(input.assetId, [...path, "assetId"], context);
  const assetPath = relativePath(input.assetPath, [...path, "assetPath"], context);
  const clipName = plainText(input.clipName, [...path, "clipName"], context);
  const durationSeconds = finiteNumber(input.durationSeconds, [...path, "durationSeconds"], context, Number.MIN_VALUE, 86_400, "invalid_duration");
  const loopInput = record(input.loop, [...path, "loop"], context);
  let loop: AnimationPackEntry["loop"] | undefined;
  if (loopInput !== undefined) {
    rejectUnknownFields(loopInput, ["startSeconds", "endSeconds"], [...path, "loop"], context);
    const startSeconds = finiteNumber(loopInput.startSeconds, [...path, "loop", "startSeconds"], context, 0, 86_400, "invalid_loop_window");
    const endSeconds = finiteNumber(loopInput.endSeconds, [...path, "loop", "endSeconds"], context, 0, 86_400, "invalid_loop_window");
    if (startSeconds !== undefined && endSeconds !== undefined && durationSeconds !== undefined) {
      if (startSeconds >= endSeconds) context.issue("invalid_loop_window", [...path, "loop"]);
      else if (endSeconds > durationSeconds) context.issue("invalid_loop_window", [...path, "loop", "endSeconds"]);
      else loop = { startSeconds, endSeconds };
    }
  }
  const defaultCamera = parseCamera(input.defaultCamera, [...path, "defaultCamera"], context);
  const equipmentInput = arrayValue(input.equipmentProps, [...path, "equipmentProps"], context);
  const equipmentProps = equipmentInput === undefined
    ? undefined
    : parseArrayElements(equipmentInput, [...path, "equipmentProps"], context, canonicalId);
  if (equipmentProps !== undefined) {
    const seen = new Set<string>();
    equipmentProps.forEach((item, index) => {
      if (item !== undefined && seen.has(item)) context.issue("duplicate_id", [...path, "equipmentProps", index]);
      if (item !== undefined) seen.add(item);
    });
  }
  const accessibilityFallbackKey = canonicalId(input.accessibilityFallbackKey, [...path, "accessibilityFallbackKey"], context);
  const sourceId = canonicalId(input.sourceId, [...path, "sourceId"], context);
  const licenseId = canonicalId(input.licenseId, [...path, "licenseId"], context);
  if (animationId && exerciseVariantId && catalogVersion && primary !== undefined && assetId && assetPath && clipName && durationSeconds && loop && defaultCamera && equipmentProps?.every((item) => item !== undefined) && accessibilityFallbackKey && sourceId && licenseId) {
    return { animationId, exerciseVariantId, animationCatalogVersion: catalogVersion, primary, assetId, assetPath, clipName, durationSeconds, loop, defaultCamera, equipmentProps: equipmentProps as string[], accessibilityFallbackKey, sourceId, licenseId };
  }
  return undefined;
}

export function parseAnimationReviewRecord(value: unknown): AnimationPackValidationResult<AnimationReviewRecord> {
  const context = new ValidationContext();
  return finish(context, parseReview(value, [], context));
}

export function parseAnimationLicenseRecord(value: unknown): AnimationPackValidationResult<AnimationLicenseRecord> {
  const context = new ValidationContext();
  return finish(context, parseLicense(value, [], context));
}

export function parseAnimationSourceRecord(value: unknown): AnimationPackValidationResult<AnimationSourceRecord> {
  const context = new ValidationContext();
  return finish(context, parseSource(value, [], context));
}

export function parseAnimationAssetDescriptor(value: unknown): AnimationPackValidationResult<AnimationAssetDescriptor> {
  const context = new ValidationContext();
  return finish(context, parseAsset(value, [], context));
}

export function parseAnimationPackEntry(value: unknown): AnimationPackValidationResult<AnimationPackEntry> {
  const context = new ValidationContext();
  return finish(context, parseEntry(value, [], context));
}

export function parseAnimationPackError(value: unknown): AnimationPackValidationResult<AnimationPackError> {
  const context = new ValidationContext();
  const input = record(value, [], context);
  let parsed: AnimationPackError | undefined;
  if (input !== undefined) {
    rejectUnknownFields(input, ["code", "message"], [], context);
    let code: AnimationPackErrorCode | undefined;
    if (typeof input.code !== "string" || !ERROR_CODE_SET.has(input.code)) context.issue("invalid_error_code", ["code"]);
    else code = input.code as AnimationPackErrorCode;
    let message: string | undefined;
    if (input.message !== undefined) message = plainText(input.message, ["message"], context);
    if (code !== undefined && (input.message === undefined || message !== undefined)) parsed = message === undefined ? { code } : { code, message };
  }
  return finish(context, parsed);
}

export function parseAnimationPackReleaseDescriptor(value: unknown): AnimationPackValidationResult<AnimationPackReleaseDescriptor> {
  const context = new ValidationContext();
  const input = record(value, [], context);
  let parsed: AnimationPackReleaseDescriptor | undefined;
  if (input !== undefined) {
    rejectUnknownFields(input, ["packId", "version", "animationPackSchemaVersion", "animationPlayerProtocolVersion", "animationCatalogVersion", "minimumAppVersion", "releaseDate", "review", "archiveByteSize", "archiveSha256", "manifestPath", "manifestByteSize", "manifestSha256"], [], context);
    const packId = canonicalId(input.packId, ["packId"], context);
    const version = semver(input.version, ["version"], context);
    const schemaVersion = positiveVersion(input.animationPackSchemaVersion, ["animationPackSchemaVersion"], context);
    const protocolVersion = positiveVersion(input.animationPlayerProtocolVersion, ["animationPlayerProtocolVersion"], context);
    const catalogVersion = positiveVersion(input.animationCatalogVersion, ["animationCatalogVersion"], context);
    const minimumAppVersion = semver(input.minimumAppVersion, ["minimumAppVersion"], context);
    const releaseDate = metadataDate(input.releaseDate, ["releaseDate"], context);
    const review = parseReview(input.review, ["review"], context);
    const archiveByteSize = positiveSafeInteger(input.archiveByteSize, ["archiveByteSize"], context);
    const archiveSha = sha256(input.archiveSha256, ["archiveSha256"], context);
    const manifestPath = relativePath(input.manifestPath, ["manifestPath"], context);
    const manifestByteSize = positiveSafeInteger(input.manifestByteSize, ["manifestByteSize"], context);
    const manifestSha = sha256(input.manifestSha256, ["manifestSha256"], context);
    if (packId && version && schemaVersion && protocolVersion && catalogVersion && minimumAppVersion && releaseDate && review && archiveByteSize && archiveSha && manifestPath && manifestByteSize && manifestSha) {
      parsed = { packId, version, animationPackSchemaVersion: schemaVersion, animationPlayerProtocolVersion: protocolVersion, animationCatalogVersion: catalogVersion, minimumAppVersion, releaseDate, review, archiveByteSize, archiveSha256: archiveSha, manifestPath, manifestByteSize, manifestSha256: manifestSha };
    }
  }
  return finish(context, parsed);
}

interface ParsedRecordArray<T> {
  input: unknown[];
  items: Array<T | undefined>;
  complete: T[] | undefined;
}

function parseRecordArray<T>(value: unknown, path: Path, context: ValidationContext, parser: (item: unknown, itemPath: Path, itemContext: ValidationContext) => T | undefined): ParsedRecordArray<T> | undefined {
  const input = arrayValue(value, path, context);
  if (input === undefined) return undefined;
  const items = parseArrayElements(input, path, context, parser);
  return {
    input,
    items,
    complete: items.every((item) => item !== undefined) ? items as T[] : undefined
  };
}

interface InspectedRecord {
  index: number;
  input: UnknownRecord;
}

function inspectedRecords<T>(array: ParsedRecordArray<T> | undefined): InspectedRecord[] {
  if (array === undefined) return [];
  const records: InspectedRecord[] = [];
  for (let index = 0; index < array.input.length; index += 1) {
    if (!Object.hasOwn(array.input, index)) continue;
    const input = array.input[index];
    if (isRecord(input)) records.push({ index, input });
  }
  return records;
}

function inspectWith<T>(parser: (context: ValidationContext) => T | undefined): T | undefined {
  return parser(new ValidationContext());
}

function inspectId(input: UnknownRecord, field: string): string | undefined {
  return inspectWith((context) => canonicalId(input[field], [], context));
}

function inspectText(input: UnknownRecord, field: string): string | undefined {
  return inspectWith((context) => plainText(input[field], [], context));
}

function inspectDate(input: UnknownRecord, field: string): string | undefined {
  return inspectWith((context) => metadataDate(input[field], [], context));
}

function inspectVersion(input: UnknownRecord, field: string): number | undefined {
  return inspectWith((context) => positiveVersion(input[field], [], context));
}

function inspectBoolean(input: UnknownRecord, field: string): boolean | undefined {
  return inspectWith((context) => booleanValue(input[field], [], context));
}

function inspectPath(input: UnknownRecord, field: string): string | undefined {
  return inspectWith((context) => relativePath(input[field], [], context));
}

function inspectDuration(input: UnknownRecord, field: string): number | undefined {
  return inspectWith((context) => finiteNumber(input[field], [], context, Number.MIN_VALUE, 86_400, "invalid_duration"));
}

function inspectReviewStatus(input: UnknownRecord): AnimationReviewRecord["status"] | undefined {
  return inspectWith((context) => enumValue(input.status, ["approved"], [], context));
}

function reportInspectedDuplicates(
  records: readonly InspectedRecord[],
  path: Path,
  context: ValidationContext,
  select: (input: UnknownRecord) => string | undefined,
  field: string,
  code = "duplicate_id"
): void {
  const seen = new Set<string>();
  records.forEach(({ index, input }) => {
    const value = select(input);
    if (value === undefined) return;
    if (seen.has(value)) context.issue(code, [...path, index, field]);
    seen.add(value);
  });
}

export function parseAnimationPackManifest(value: unknown): AnimationPackValidationResult<AnimationPackManifest> {
  const context = new ValidationContext();
  const input = record(value, [], context);
  let parsed: AnimationPackManifest | undefined;
  if (input !== undefined) {
    const forbidden = ["archiveByteSize", "archiveSha256", "manifestPath", "manifestByteSize", "manifestSha256"] as const;
    forbidden.forEach((field) => { if (Object.hasOwn(input, field)) context.issue("forbidden_manifest_field", [field]); });
    rejectUnknownFields(input, ["packId", "version", "animationPackSchemaVersion", "animationPlayerProtocolVersion", "animationCatalogVersion", "minimumAppVersion", "releaseDate", "createdAt", "review", "reviews", "licenses", "sources", "assets", "entries", ...forbidden], [], context);
    const packId = canonicalId(input.packId, ["packId"], context);
    const version = semver(input.version, ["version"], context);
    const schemaVersion = positiveVersion(input.animationPackSchemaVersion, ["animationPackSchemaVersion"], context);
    const protocolVersion = positiveVersion(input.animationPlayerProtocolVersion, ["animationPlayerProtocolVersion"], context);
    const catalogVersion = positiveVersion(input.animationCatalogVersion, ["animationCatalogVersion"], context);
    const minimumAppVersion = semver(input.minimumAppVersion, ["minimumAppVersion"], context);
    const releaseDate = metadataDate(input.releaseDate, ["releaseDate"], context);
    const createdAt = metadataDate(input.createdAt, ["createdAt"], context);
    const review = parseReview(input.review, ["review"], context);
    const reviewArray = parseRecordArray(input.reviews, ["reviews"], context, parseReview);
    const licenseArray = parseRecordArray(input.licenses, ["licenses"], context, parseLicense);
    const sourceArray = parseRecordArray(input.sources, ["sources"], context, parseSource);
    const assetArray = parseRecordArray(input.assets, ["assets"], context, parseAsset);
    const entryArray = parseRecordArray(input.entries, ["entries"], context, parseEntry);
    const reviews = reviewArray?.complete;
    const licenses = licenseArray?.complete;
    const sources = sourceArray?.complete;
    const assets = assetArray?.complete;
    const entries = entryArray?.complete;
    ([
      ["reviews", reviewArray],
      ["licenses", licenseArray],
      ["sources", sourceArray],
      ["assets", assetArray],
      ["entries", entryArray]
    ] as const).forEach(([field, items]) => {
      if (items !== undefined && items.input.length === 0) context.issue("empty_array", [field]);
    });
    const reviewRecords = inspectedRecords(reviewArray);
    const licenseRecords = inspectedRecords(licenseArray);
    const sourceRecords = inspectedRecords(sourceArray);
    const assetRecords = inspectedRecords(assetArray);
    const entryRecords = inspectedRecords(entryArray);
    reportInspectedDuplicates(reviewRecords, ["reviews"], context, (item) => inspectId(item, "id"), "id");
    reportInspectedDuplicates(licenseRecords, ["licenses"], context, (item) => inspectId(item, "id"), "id");
    reportInspectedDuplicates(sourceRecords, ["sources"], context, (item) => inspectId(item, "id"), "id");
    reportInspectedDuplicates(assetRecords, ["assets"], context, (item) => inspectId(item, "id"), "id");
    reportInspectedDuplicates(assetRecords, ["assets"], context, (item) => inspectPath(item, "path"), "path", "duplicate_path");
    reportInspectedDuplicates(entryRecords, ["entries"], context, (item) => inspectId(item, "animationId"), "animationId");
    reportInspectedDuplicates(entryRecords, ["entries"], context, (item) => {
      const exerciseVariantId = inspectId(item, "exerciseVariantId");
      const mappingVersion = inspectVersion(item, "animationCatalogVersion");
      const animationId = inspectId(item, "animationId");
      return exerciseVariantId && mappingVersion && animationId ? `${exerciseVariantId}\u0000${mappingVersion}\u0000${animationId}` : undefined;
    }, "animationId", "duplicate_mapping");
    const primarySeen = new Set<string>();
    entryRecords.forEach(({ index, input: item }) => {
      const exerciseVariantId = inspectId(item, "exerciseVariantId");
      const mappingVersion = inspectVersion(item, "animationCatalogVersion");
      const primary = inspectBoolean(item, "primary");
      if (exerciseVariantId === undefined || mappingVersion === undefined || primary !== true) return;
      const tuple = `${exerciseVariantId}\u0000${mappingVersion}`;
      if (primarySeen.has(tuple)) context.issue("duplicate_primary_mapping", ["entries", index, "primary"]);
      primarySeen.add(tuple);
    });

    const reviewIds = new Set(reviewRecords.map(({ input: item }) => inspectId(item, "id")).filter((item): item is string => item !== undefined));
    const licenseIds = new Set(licenseRecords.map(({ input: item }) => inspectId(item, "id")).filter((item): item is string => item !== undefined));
    const sourceIds = new Set(sourceRecords.map(({ input: item }) => inspectId(item, "id")).filter((item): item is string => item !== undefined));
    const assetIds = new Set(assetRecords.map(({ input: item }) => inspectId(item, "id")).filter((item): item is string => item !== undefined));
    const boundReviewInput = isRecord(input.review) ? input.review : undefined;
    const boundReviewId = boundReviewInput === undefined ? undefined : inspectId(boundReviewInput, "id");
    if (boundReviewInput !== undefined && boundReviewId !== undefined) {
      const matchingReviews = reviewRecords.filter(({ input: item }) => inspectId(item, "id") === boundReviewId);
      if (matchingReviews.length === 0) context.issue("missing_review", ["review", "id"]);
      else if (matchingReviews.length > 1) context.issue("ambiguous_review_binding", ["review", "id"]);
      else {
        const declaredReview = matchingReviews[0].input;
        if (inspectText(declaredReview, "reviewer") !== inspectText(boundReviewInput, "reviewer")) context.issue("review_binding_mismatch", ["review", "reviewer"]);
        if (inspectDate(declaredReview, "reviewedAt") !== inspectDate(boundReviewInput, "reviewedAt")) context.issue("review_binding_mismatch", ["review", "reviewedAt"]);
        if (inspectReviewStatus(declaredReview) !== inspectReviewStatus(boundReviewInput)) context.issue("review_binding_mismatch", ["review", "status"]);
      }
    }
    licenseRecords.forEach(({ index, input: item }) => {
      const reviewId = inspectId(item, "reviewId");
      if (reviewId !== undefined && !reviewIds.has(reviewId)) context.issue("missing_review", ["licenses", index, "reviewId"]);
    });
    sourceRecords.forEach(({ index, input: item }) => {
      const licenseId = inspectId(item, "licenseId");
      const reviewId = inspectId(item, "reviewId");
      if (licenseId !== undefined && !licenseIds.has(licenseId)) context.issue("missing_license", ["sources", index, "licenseId"]);
      if (reviewId !== undefined && !reviewIds.has(reviewId)) context.issue("missing_review", ["sources", index, "reviewId"]);
    });
    assetRecords.forEach(({ index, input: item }) => {
      const sourceId = inspectId(item, "sourceId");
      const licenseId = inspectId(item, "licenseId");
      if (sourceId !== undefined && !sourceIds.has(sourceId)) context.issue("missing_source", ["assets", index, "sourceId"]);
      if (licenseId !== undefined && !licenseIds.has(licenseId)) context.issue("missing_license", ["assets", index, "licenseId"]);
      const matchingSources = sourceRecords.filter(({ input: sourceItem }) => inspectId(sourceItem, "id") === sourceId);
      if (matchingSources.length === 1) {
        const sourceLicenseId = inspectId(matchingSources[0].input, "licenseId");
        if (sourceLicenseId !== undefined && licenseId !== undefined && sourceLicenseId !== licenseId) context.issue("license_reference_mismatch", ["assets", index, "licenseId"]);
      }
    });
    entryRecords.forEach(({ index, input: item }) => {
      const assetId = inspectId(item, "assetId");
      const sourceId = inspectId(item, "sourceId");
      const licenseId = inspectId(item, "licenseId");
      const mappingVersion = inspectVersion(item, "animationCatalogVersion");
      if (assetId !== undefined && !assetIds.has(assetId)) context.issue("missing_asset", ["entries", index, "assetId"]);
      if (sourceId !== undefined && !sourceIds.has(sourceId)) context.issue("missing_source", ["entries", index, "sourceId"]);
      if (licenseId !== undefined && !licenseIds.has(licenseId)) context.issue("missing_license", ["entries", index, "licenseId"]);
      const matchingAssets = assetRecords.filter(({ input: assetItem }) => inspectId(assetItem, "id") === assetId);
      if (matchingAssets.length === 1) {
        const declaredAsset = matchingAssets[0].input;
        const assetPath = inspectPath(declaredAsset, "path");
        const entryPath = inspectPath(item, "assetPath");
        const assetDuration = inspectDuration(declaredAsset, "durationSeconds");
        const entryDuration = inspectDuration(item, "durationSeconds");
        const assetSourceId = inspectId(declaredAsset, "sourceId");
        const assetLicenseId = inspectId(declaredAsset, "licenseId");
        if (assetPath !== undefined && entryPath !== undefined && assetPath !== entryPath) context.issue("asset_path_mismatch", ["entries", index, "assetPath"]);
        if (assetDuration !== undefined && entryDuration !== undefined && assetDuration !== entryDuration) context.issue("asset_duration_mismatch", ["entries", index, "durationSeconds"]);
        if (assetSourceId !== undefined && sourceId !== undefined && assetSourceId !== sourceId) context.issue("source_reference_mismatch", ["entries", index, "sourceId"]);
        if (assetLicenseId !== undefined && licenseId !== undefined && assetLicenseId !== licenseId) context.issue("license_reference_mismatch", ["entries", index, "licenseId"]);
      }
      if (catalogVersion !== undefined && mappingVersion !== undefined && mappingVersion !== catalogVersion) context.issue("mapping_catalog_mismatch", ["entries", index, "animationCatalogVersion"]);
    });
    if (packId && version && schemaVersion && protocolVersion && catalogVersion && minimumAppVersion && releaseDate && createdAt && review && reviews && licenses && sources && assets && entries) {
      parsed = { packId, version, animationPackSchemaVersion: schemaVersion, animationPlayerProtocolVersion: protocolVersion, animationCatalogVersion: catalogVersion, minimumAppVersion, releaseDate, createdAt, review, reviews, licenses, sources, assets, entries };
    }
  }
  return finish(context, parsed);
}

function parseInstalledCommon(input: UnknownRecord, context: ValidationContext): InstalledAnimationPackCommon | undefined {
  const packId = canonicalId(input.packId, ["packId"], context);
  const version = semver(input.version, ["version"], context);
  const installedByteSize = positiveSafeInteger(input.installedByteSize, ["installedByteSize"], context);
  const installedAt = timestamp(input.installedAt, ["installedAt"], context);
  const verifiedAt = timestamp(input.verifiedAt, ["verifiedAt"], context);
  const verification = enumValue(input.verification, ["verified"], ["verification"], context);
  return packId && version && installedByteSize && installedAt && verifiedAt && verification
    ? { packId, version, installedByteSize, installedAt, verifiedAt, verification }
    : undefined;
}

export function parseInstalledAnimationPack(value: unknown): AnimationPackValidationResult<InstalledAnimationPack> {
  const context = new ValidationContext();
  const input = record(value, [], context);
  let parsed: InstalledAnimationPack | undefined;
  if (input !== undefined) {
    const status = enumValue(input.status, ["active", "staged", "previous"], ["status"], context);
    const common = parseInstalledCommon(input, context);
    const commonFields = ["status", "packId", "version", "installedByteSize", "installedAt", "verifiedAt", "verification"];
    if (status === "active") {
      rejectUnknownFields(input, [...commonFields, "activePointer", "previousPointer"], [], context);
      const activePointer = canonicalId(input.activePointer, ["activePointer"], context);
      let previousPointer: string | undefined;
      if (input.previousPointer !== undefined) previousPointer = canonicalId(input.previousPointer, ["previousPointer"], context);
      if (common && activePointer && (input.previousPointer === undefined || previousPointer)) parsed = previousPointer ? { ...common, status, activePointer, previousPointer } : { ...common, status, activePointer };
    } else if (status === "staged") {
      rejectUnknownFields(input, [...commonFields, "stagedPointer"], [], context);
      const stagedPointer = canonicalId(input.stagedPointer, ["stagedPointer"], context);
      if (common && stagedPointer) parsed = { ...common, status, stagedPointer };
    } else if (status === "previous") {
      rejectUnknownFields(input, [...commonFields, "previousPointer"], [], context);
      const previousPointer = canonicalId(input.previousPointer, ["previousPointer"], context);
      if (common && previousPointer) parsed = { ...common, status, previousPointer };
    } else {
      rejectUnknownFields(input, [...commonFields, "activePointer", "stagedPointer", "previousPointer"], [], context);
    }
  }
  return finish(context, parsed);
}

function parsePlayerRequestAt(value: unknown, path: Path, context: ValidationContext): AnimationPlayerRequest | undefined {
  const input = record(value, path, context);
  if (input === undefined) return undefined;
  rejectUnknownFields(input, ["exerciseVariantId", "animationId", "playbackSpeed", "cameraPreset", "mirrorMode", "reducedMotion"], path, context);
  const exerciseVariantId = canonicalId(input.exerciseVariantId, [...path, "exerciseVariantId"], context);
  const animationId = canonicalId(input.animationId, [...path, "animationId"], context);
  const playbackSpeed = finiteNumber(input.playbackSpeed, [...path, "playbackSpeed"], context, 0.25, 4, "invalid_playback_speed");
  const cameraPreset = enumValue(input.cameraPreset, ["front", "side", "three_quarter", "custom"], [...path, "cameraPreset"], context);
  const mirrorMode = enumValue(input.mirrorMode, ["none", "horizontal"], [...path, "mirrorMode"], context);
  const reducedMotion = booleanValue(input.reducedMotion, [...path, "reducedMotion"], context);
  return exerciseVariantId && animationId && playbackSpeed && cameraPreset && mirrorMode && reducedMotion !== undefined
    ? { exerciseVariantId, animationId, playbackSpeed, cameraPreset, mirrorMode, reducedMotion }
    : undefined;
}

export function parseAnimationPlayerRequest(value: unknown): AnimationPackValidationResult<AnimationPlayerRequest> {
  const context = new ValidationContext();
  return finish(context, parsePlayerRequestAt(value, [], context));
}

export function parseAnimationPlayerState(value: unknown): AnimationPackValidationResult<AnimationPlayerState> {
  const context = new ValidationContext();
  const input = record(value, [], context);
  let parsed: AnimationPlayerState | undefined;
  if (input !== undefined) {
    const status = enumValue(input.status, ["idle", "loading", "ready", "playing", "paused", "failed"], ["status"], context);
    if (status === "idle") {
      rejectUnknownFields(input, ["status", "offlineFallback"], [], context);
      const offlineFallback = enumValue(input.offlineFallback, ["none"], ["offlineFallback"], context);
      if (offlineFallback) parsed = { status, offlineFallback };
    } else if (status === "loading") {
      rejectUnknownFields(input, ["status", "request", "offlineFallback"], [], context);
      const request = parsePlayerRequestAt(input.request, ["request"], context);
      const offlineFallback = enumValue(input.offlineFallback, ["none", "text"], ["offlineFallback"], context);
      if (request && offlineFallback) parsed = { status, request, offlineFallback };
    } else if (status === "ready") {
      rejectUnknownFields(input, ["status", "request", "durationSeconds", "offlineFallback"], [], context);
      const request = parsePlayerRequestAt(input.request, ["request"], context);
      const durationSeconds = finiteNumber(input.durationSeconds, ["durationSeconds"], context, Number.MIN_VALUE, 86_400, "invalid_duration");
      const offlineFallback = enumValue(input.offlineFallback, ["none", "text"], ["offlineFallback"], context);
      if (request && durationSeconds && offlineFallback) parsed = { status, request, durationSeconds, offlineFallback };
    } else if (status === "playing" || status === "paused") {
      rejectUnknownFields(input, ["status", "request", "positionSeconds", "durationSeconds", "offlineFallback"], [], context);
      const request = parsePlayerRequestAt(input.request, ["request"], context);
      const positionSeconds = finiteNumber(input.positionSeconds, ["positionSeconds"], context, 0, 86_400, "invalid_position");
      const durationSeconds = finiteNumber(input.durationSeconds, ["durationSeconds"], context, Number.MIN_VALUE, 86_400, "invalid_duration");
      if (positionSeconds !== undefined && durationSeconds !== undefined && positionSeconds > durationSeconds) context.issue("invalid_position", ["positionSeconds"]);
      const offlineFallback = enumValue(input.offlineFallback, ["none", "text"], ["offlineFallback"], context);
      if (request && positionSeconds !== undefined && durationSeconds && positionSeconds <= durationSeconds && offlineFallback) parsed = { status, request, positionSeconds, durationSeconds, offlineFallback };
    } else if (status === "failed") {
      rejectUnknownFields(input, ["status", "request", "error", "recoverable", "offlineFallback"], [], context);
      let request: AnimationPlayerRequest | undefined;
      if (input.request !== undefined) request = parsePlayerRequestAt(input.request, ["request"], context);
      const errorResult = parseAnimationPackError(input.error);
      if (!errorResult.success) errorResult.issues.forEach((issue) => context.issue(issue.code, ["error", ...issue.path], issue.message));
      const recoverable = booleanValue(input.recoverable, ["recoverable"], context);
      const offlineFallback = enumValue(input.offlineFallback, ["text"], ["offlineFallback"], context);
      if ((input.request === undefined || request) && errorResult.success && recoverable !== undefined && offlineFallback) parsed = request ? { status, request, error: errorResult.data, recoverable, offlineFallback } : { status, error: errorResult.data, recoverable, offlineFallback };
    } else {
      rejectUnknownFields(input, ["status", "request", "positionSeconds", "durationSeconds", "error", "recoverable", "offlineFallback"], [], context);
    }
  }
  return finish(context, parsed);
}

interface ParsedSemver {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[];
}

function parseSemverForComparison(value: unknown): ParsedSemver | undefined {
  if (typeof value !== "string") return undefined;
  const match = SEMVER_PATTERN.exec(value);
  if (match === null) return undefined;
  return { major: BigInt(match[1]), minor: BigInt(match[2]), patch: BigInt(match[3]), prerelease: match[4]?.split(".") ?? [] };
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  for (const field of ["major", "minor", "patch"] as const) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length === 0 ? 1 : -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return BigInt(a) < BigInt(b) ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

export function validateAnimationPackCompatibility(
  descriptor: AnimationPackReleaseDescriptor,
  manifest: AnimationPackManifest,
  currentAppVersion: string
): AnimationPackValidationResult<{ descriptor: AnimationPackReleaseDescriptor; manifest: AnimationPackManifest }> {
  const context = new ValidationContext();
  if (!isRecord(descriptor)) context.issue("invalid_type", ["descriptor"], "Expected a parsed descriptor object.");
  if (!isRecord(manifest)) context.issue("invalid_type", ["manifest"], "Expected a parsed manifest object.");
  if (!isRecord(descriptor) || !isRecord(manifest)) {
    return finish<{ descriptor: AnimationPackReleaseDescriptor; manifest: AnimationPackManifest }>(context, undefined);
  }
  if (!isRecord(descriptor.review)) context.issue("invalid_type", ["descriptor", "review"]);
  if (!isRecord(manifest.review)) context.issue("invalid_type", ["manifest", "review"]);
  if (!isRecord(descriptor.review) || !isRecord(manifest.review)) {
    return finish<{ descriptor: AnimationPackReleaseDescriptor; manifest: AnimationPackManifest }>(context, undefined);
  }
  const parsedManifest = parseAnimationPackManifest(manifest);
  if (!parsedManifest.success) {
    parsedManifest.issues.forEach((issue) => context.issue(issue.code, ["manifest", ...issue.path], issue.message));
  }
  const current = parseSemverForComparison(currentAppVersion);
  if (current === undefined) context.issue("invalid_semver", ["currentAppVersion"]);
  const minimum = parseSemverForComparison(descriptor.minimumAppVersion);
  if (minimum === undefined) context.issue("invalid_semver", ["descriptor", "minimumAppVersion"]);
  const versionChecks: Array<[keyof Pick<AnimationPackReleaseDescriptor, "animationPackSchemaVersion" | "animationPlayerProtocolVersion" | "animationCatalogVersion">, number, string]> = [
    ["animationPackSchemaVersion", animationPackSchemaVersion, "incompatible_schema"],
    ["animationPlayerProtocolVersion", animationPlayerProtocolVersion, "incompatible_player_protocol"],
    ["animationCatalogVersion", animationCatalogVersion, "incompatible_animation_catalog"]
  ];
  versionChecks.forEach(([field, supported, code]) => {
    if (descriptor[field] !== supported) context.issue(code, ["descriptor", field]);
    if (manifest[field] !== supported) context.issue(code, ["manifest", field]);
  });
  const identityFields = ["packId", "version", "animationPackSchemaVersion", "animationPlayerProtocolVersion", "animationCatalogVersion", "minimumAppVersion", "releaseDate"] as const;
  identityFields.forEach((field) => {
    if (descriptor[field] !== manifest[field]) context.issue("descriptor_manifest_identity_mismatch", ["manifest", field]);
  });
  const reviewFields = ["id", "reviewer", "reviewedAt", "status"] as const;
  reviewFields.forEach((field) => {
    if (descriptor.review[field] !== manifest.review[field]) context.issue("descriptor_manifest_identity_mismatch", ["manifest", "review", field]);
  });
  if (current !== undefined && minimum !== undefined && compareSemver(current, minimum) < 0) context.issue("incompatible_minimum_app", ["currentAppVersion"]);
  return finish(context, context.issues.length === 0 ? { descriptor, manifest } : undefined);
}

export function findPrimaryAnimationEntry(
  manifest: AnimationPackManifest,
  exerciseVariantId: string,
  catalogVersion: number
): AnimationPackValidationResult<AnimationPackEntry> {
  const matches = manifest.entries.filter((entry) => entry.primary && entry.exerciseVariantId === exerciseVariantId && entry.animationCatalogVersion === catalogVersion);
  if (matches.length === 1) return { success: true, data: matches[0] };
  return { success: false, issues: [{ code: "missing_variant", path: ["exerciseVariantId"] }] };
}
