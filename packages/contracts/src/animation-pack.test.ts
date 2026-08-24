/*
 * Copyright (c) 2026 MyCompany LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, it } from "vitest";
import {
  ANIMATION_PACK_ERROR_CODES,
  animationCatalogVersion,
  animationPackSchemaVersion,
  animationPlayerProtocolVersion,
  findPrimaryAnimationEntry,
  parseAnimationAssetDescriptor,
  parseAnimationLicenseRecord,
  parseAnimationPackEntry,
  parseAnimationPackError,
  parseAnimationPackManifest,
  parseAnimationPackReleaseDescriptor,
  parseAnimationPlayerRequest,
  parseAnimationPlayerState,
  parseAnimationReviewRecord,
  parseAnimationSourceRecord,
  parseInstalledAnimationPack,
  validateAnimationPackCompatibility,
  type AnimationPackManifest,
  type AnimationPackReleaseDescriptor,
  type AnimationPackValidationResult
} from "./index";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const review = {
  id: "review.release-1",
  reviewer: "Gym Local release review",
  reviewedAt: "2026-08-24",
  status: "approved" as const
};
const license = {
  id: "license.cc-by-4.0",
  name: "Creative Commons Attribution 4.0",
  termsUrl: "https://creativecommons.org/licenses/by/4.0/",
  redistributionScope: "offline" as const,
  attribution: "Example Artist, CC BY 4.0",
  reviewedAt: "2026-08-24",
  reviewId: review.id
};
const source = {
  id: "source.example-squat",
  author: "Example Artist",
  sourceUrl: "https://example.test/source/squat",
  licenseId: license.id,
  attribution: "Example Artist, CC BY 4.0",
  modifications: "None",
  reviewedAt: "2026-08-24",
  reviewId: review.id
};
const asset = {
  id: "asset.squat-barbell",
  path: "assets/squat-barbell.glb",
  mediaType: "model/gltf-binary" as const,
  byteSize: 12_345,
  sha256: hashA,
  compression: "none" as const,
  rigId: "rig.humanoid-v1",
  sourceId: source.id,
  licenseId: license.id,
  durationSeconds: 4
};
const entry = {
  animationId: "animation.squat-barbell",
  exerciseVariantId: "squat__barbell",
  animationCatalogVersion: 1,
  primary: true,
  assetId: asset.id,
  assetPath: asset.path,
  clipName: "Squat",
  durationSeconds: 4,
  loop: { startSeconds: 0.5, endSeconds: 3.5 },
  defaultCamera: {
    preset: "three_quarter" as const,
    position: [2, 1.5, 3] as [number, number, number],
    target: [0, 1, 0] as [number, number, number],
    fovDegrees: 45
  },
  equipmentProps: ["barbell", "rack"],
  accessibilityFallbackKey: "exercise.squat-barbell.instructions",
  sourceId: source.id,
  licenseId: license.id
};

function descriptor(): AnimationPackReleaseDescriptor {
  return {
    packId: "gym-local.animations-core",
    version: "1.2.3-beta.2+build.7",
    animationPackSchemaVersion: 1,
    animationPlayerProtocolVersion: 1,
    animationCatalogVersion: 1,
    minimumAppVersion: "0.7.0",
    releaseDate: "2026-08-24",
    review: structuredClone(review),
    archiveByteSize: 20_000,
    archiveSha256: hashB,
    manifestPath: "manifest/animation-pack.json",
    manifestByteSize: 2_000,
    manifestSha256: hashA
  };
}

function manifest(): AnimationPackManifest {
  const release = descriptor();
  return {
    packId: release.packId,
    version: release.version,
    animationPackSchemaVersion: release.animationPackSchemaVersion,
    animationPlayerProtocolVersion: release.animationPlayerProtocolVersion,
    animationCatalogVersion: release.animationCatalogVersion,
    minimumAppVersion: release.minimumAppVersion,
    releaseDate: release.releaseDate,
    createdAt: "2026-08-23",
    review: structuredClone(review),
    reviews: [structuredClone(review)],
    licenses: [structuredClone(license)],
    sources: [structuredClone(source)],
    assets: [structuredClone(asset)],
    entries: [structuredClone(entry)]
  };
}

function expectIssue<T>(result: AnimationPackValidationResult<T>, code: string, path?: Array<string | number>) {
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Expected validation failure");
  const issue = result.issues.find((candidate) => candidate.code === code && (path === undefined || JSON.stringify(candidate.path) === JSON.stringify(path)));
  expect(issue, `${code} at ${JSON.stringify(path)}`).toBeDefined();
  expect("data" in result).toBe(false);
}

function setAtPath(root: Record<string, any>, path: Array<string | number>, value: unknown): void {
  let cursor: any = root;
  for (let index = 0; index < path.length - 1; index += 1) cursor = cursor[path[index]];
  cursor[path.at(-1)!] = value;
}

const request = {
  exerciseVariantId: entry.exerciseVariantId,
  animationId: entry.animationId,
  playbackSpeed: 1,
  cameraPreset: "three_quarter" as const,
  mirrorMode: "none" as const,
  reducedMotion: true
};

describe("animation-pack public contract", () => {
  it("exports three independent literal v1 boundaries and every stable error spelling", () => {
    expect([animationPackSchemaVersion, animationPlayerProtocolVersion, animationCatalogVersion]).toEqual([1, 1, 1]);
    expect(ANIMATION_PACK_ERROR_CODES).toEqual([
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
    ]);
  });

  it("parses every public record and top-level release shape from unknown values", () => {
    const cases = [
      parseAnimationReviewRecord(review),
      parseAnimationLicenseRecord(license),
      parseAnimationSourceRecord(source),
      parseAnimationAssetDescriptor(asset),
      parseAnimationPackEntry(entry),
      parseAnimationPackError({ code: "missing_asset", message: "Asset unavailable." }),
      parseAnimationPackReleaseDescriptor(descriptor()),
      parseAnimationPackManifest(manifest()),
      parseInstalledAnimationPack({
        status: "active",
        packId: descriptor().packId,
        version: "1.2.3",
        installedByteSize: 20_000,
        installedAt: "2026-08-24T12:30:00.000+07:00",
        verifiedAt: "2026-08-24T12:29:59Z",
        verification: "verified",
        activePointer: "pointer.active-1",
        previousPointer: "pointer.previous-1"
      }),
      parseAnimationPlayerRequest(request),
      parseAnimationPlayerState({ status: "ready", request, durationSeconds: 4, offlineFallback: "none" })
    ];
    for (const result of cases) {
      expect(result.success).toBe(true);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it("does not coerce primitive values or fill missing fields", () => {
    const invalidDescriptor = descriptor() as unknown as Record<string, unknown>;
    invalidDescriptor.archiveByteSize = "20000";
    invalidDescriptor.animationPackSchemaVersion = "1";
    invalidDescriptor.releaseDate = new Date("2026-08-24T00:00:00Z");
    delete invalidDescriptor.manifestSha256;
    const result = parseAnimationPackReleaseDescriptor(invalidDescriptor);
    expectIssue(result, "invalid_byte_size", ["archiveByteSize"]);
    expectIssue(result, "invalid_version", ["animationPackSchemaVersion"]);
    expectIssue(result, "invalid_date", ["releaseDate"]);
    expectIssue(result, "invalid_sha256", ["manifestSha256"]);
  });
});

describe("descriptor trust boundary and strict primitives", () => {
  it("accepts descriptor-only archive and selected-manifest integrity fields", () => {
    const result = parseAnimationPackReleaseDescriptor(descriptor());
    expect(result).toEqual({ success: true, data: descriptor() });
  });

  it.each(["archiveByteSize", "archiveSha256", "manifestPath", "manifestByteSize", "manifestSha256"])(
    "rejects forbidden manifest self-reference field %s",
    (field) => {
      const input = manifest() as unknown as Record<string, unknown>;
      input[field] = field.endsWith("ByteSize") ? 100 : field.endsWith("Path") ? "manifest.json" : hashA;
      expectIssue(parseAnimationPackManifest(input), "forbidden_manifest_field", [field]);
    }
  );

  it.each([
    [["packId"], "Bad ID", "invalid_id"],
    [["version"], "v1.2.3", "invalid_semver"],
    [["version"], "01.2.3", "invalid_semver"],
    [["version"], "1.2", "invalid_semver"],
    [["minimumAppVersion"], "1.0.0-01", "invalid_semver"],
    [["releaseDate"], "2026-02-29", "invalid_date"],
    [["review", "reviewedAt"], "2026-13-01", "invalid_date"],
    [["archiveByteSize"], 0, "invalid_byte_size"],
    [["manifestByteSize"], Number.MAX_SAFE_INTEGER + 1, "invalid_byte_size"],
    [["archiveSha256"], "A".repeat(64), "invalid_sha256"],
    [["manifestSha256"], `sha256:${hashA}`, "invalid_sha256"],
    [["manifestPath"], "../manifest.json", "invalid_relative_path"],
    [["manifestPath"], "C:/manifest.json", "invalid_relative_path"],
    [["manifestPath"], "https://example.test/manifest.json", "invalid_relative_path"],
    [["manifestPath"], "manifest\\pack.json", "invalid_relative_path"],
    [["manifestPath"], "manifest//pack.json", "invalid_relative_path"],
    [["manifestPath"], "manifest/%2e%2e/pack.json", "invalid_relative_path"],
    [["manifestPath"], "manifest/pack.json?x=1", "invalid_relative_path"]
  ])("rejects descriptor %j = %j with %s", (path, value, code) => {
    const input = descriptor() as unknown as Record<string, any>;
    setAtPath(input, path as Array<string | number>, value);
    expectIssue(parseAnimationPackReleaseDescriptor(input), code as string, path as Array<string | number>);
  });
});

describe("manifest integrity", () => {
  it.each([
    [["assets", 0, "path"], "/asset.glb", "invalid_relative_path"],
    [["assets", 0, "sha256"], `${hashA} `, "invalid_sha256"],
    [["assets", 0, "byteSize"], -1, "invalid_byte_size"],
    [["assets", 0, "durationSeconds"], Number.NaN, "invalid_duration"],
    [["entries", 0, "durationSeconds"], Number.POSITIVE_INFINITY, "invalid_duration"],
    [["entries", 0, "loop", "startSeconds"], -0.1, "invalid_loop_window"],
    [["entries", 0, "loop", "endSeconds"], 4.1, "invalid_loop_window"],
    [["entries", 0, "loop"], { startSeconds: 2, endSeconds: 2 }, "invalid_loop_window"],
    [["entries", 0, "defaultCamera", "position", 1], Number.NEGATIVE_INFINITY, "invalid_camera_number"],
    [["entries", 0, "defaultCamera", "fovDegrees"], 121, "invalid_camera_number"],
    [["entries", 0, "animationCatalogVersion"], 2, "mapping_catalog_mismatch"],
    [["licenses", 0, "redistributionScope"], "online", "invalid_enum"],
    [["licenses", 0, "termsUrl"], "http://example.test/license", "invalid_url"],
    [["sources", 0, "modifications"], "", "invalid_string"],
    [["review", "status"], "draft", "invalid_enum"]
  ])("rejects malformed manifest field %j", (path, value, code) => {
    const input = manifest() as unknown as Record<string, any>;
    setAtPath(input, path as Array<string | number>, value);
    expectIssue(parseAnimationPackManifest(input), code as string, path as Array<string | number>);
  });

  it("rejects duplicate IDs, paths, mappings, equipment props, and exact-tuple primaries", () => {
    const input = manifest();
    input.reviews.push(structuredClone(review));
    input.licenses.push(structuredClone(license));
    input.sources.push(structuredClone(source));
    input.assets.push({ ...structuredClone(asset), id: "asset.other" });
    input.entries[0].equipmentProps.push("barbell");
    input.entries.push({ ...structuredClone(entry), animationId: "animation.squat-barbell-secondary" });
    input.entries.push({ ...structuredClone(entry), primary: false });
    const result = parseAnimationPackManifest(input);
    expectIssue(result, "duplicate_id", ["reviews", 1, "id"]);
    expectIssue(result, "duplicate_id", ["licenses", 1, "id"]);
    expectIssue(result, "duplicate_id", ["sources", 1, "id"]);
    expectIssue(result, "duplicate_path", ["assets", 1, "path"]);
    expectIssue(result, "duplicate_id", ["entries", 0, "equipmentProps", 2]);
    expectIssue(result, "duplicate_primary_mapping", ["entries", 1, "primary"]);
    expectIssue(result, "duplicate_mapping", ["entries", 2, "animationId"]);
  });

  it.each([
    ["missing review", (input: AnimationPackManifest) => { input.licenses[0].reviewId = "review.missing"; }, "missing_review", ["licenses", 0, "reviewId"]],
    ["missing source license", (input: AnimationPackManifest) => { input.sources[0].licenseId = "license.missing"; }, "missing_license", ["sources", 0, "licenseId"]],
    ["missing asset source", (input: AnimationPackManifest) => { input.assets[0].sourceId = "source.missing"; }, "missing_source", ["assets", 0, "sourceId"]],
    ["missing entry asset", (input: AnimationPackManifest) => { input.entries[0].assetId = "asset.missing"; }, "missing_asset", ["entries", 0, "assetId"]],
    ["missing entry source", (input: AnimationPackManifest) => { input.entries[0].sourceId = "source.missing"; }, "missing_source", ["entries", 0, "sourceId"]],
    ["missing entry license", (input: AnimationPackManifest) => { input.entries[0].licenseId = "license.missing"; }, "missing_license", ["entries", 0, "licenseId"]],
    ["asset path disagreement", (input: AnimationPackManifest) => { input.entries[0].assetPath = "assets/other.glb"; }, "asset_path_mismatch", ["entries", 0, "assetPath"]],
    ["asset duration disagreement", (input: AnimationPackManifest) => { input.entries[0].durationSeconds = 3; input.entries[0].loop.endSeconds = 3; }, "asset_duration_mismatch", ["entries", 0, "durationSeconds"]]
  ])("rejects referential-integrity failure: %s", (_label, mutate, code, path) => {
    const input = manifest();
    mutate(input);
    expectIssue(parseAnimationPackManifest(input), code, path as Array<string | number>);
  });

  it("reports deterministic schema-order issues, is serializable, and never mutates or returns partial data", () => {
    const input = manifest() as unknown as Record<string, any>;
    input.zUnexpected = true;
    input.aUnexpected = true;
    input.packId = " INVALID ";
    input.version = "v1";
    input.assets[0].byteSize = 0;
    input.entries[0].assetId = "asset.missing";
    const before = structuredClone(input);
    const first = parseAnimationPackManifest(input);
    const second = parseAnimationPackManifest(input);
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(input).toEqual(before);
    expect(first.success).toBe(false);
    if (first.success) throw new Error("Expected validation failure");
    expect(first.issues.slice(0, 4).map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "unexpected_field", path: ["aUnexpected"] },
      { code: "unexpected_field", path: ["zUnexpected"] },
      { code: "invalid_id", path: ["packId"] },
      { code: "invalid_semver", path: ["version"] }
    ]);
    expect("data" in first).toBe(false);
  });
});

describe("compatibility and exact variant identity", () => {
  it("accepts supported v1 at equal or greater SemVer including prerelease precedence", () => {
    const release = descriptor();
    const pack = manifest();
    release.minimumAppVersion = "1.0.0-beta.2";
    pack.minimumAppVersion = release.minimumAppVersion;
    expect(validateAnimationPackCompatibility(release, pack, "1.0.0-beta.2").success).toBe(true);
    expect(validateAnimationPackCompatibility(release, pack, "1.0.0").success).toBe(true);
    expect(validateAnimationPackCompatibility(release, pack, "2.0.0").success).toBe(true);
  });

  it("compares arbitrarily large SemVer core values without floating-point loss", () => {
    const release = descriptor();
    const pack = manifest();
    release.minimumAppVersion = "9007199254740993.0.0";
    pack.minimumAppVersion = release.minimumAppVersion;
    expectIssue(validateAnimationPackCompatibility(release, pack, "9007199254740992.999.999"), "incompatible_minimum_app", ["currentAppVersion"]);
    expect(validateAnimationPackCompatibility(release, pack, "9007199254740993.0.0").success).toBe(true);
  });

  it("returns plain validation failures instead of throwing on non-parsed runtime arguments", () => {
    const result = validateAnimationPackCompatibility(null as unknown as AnimationPackReleaseDescriptor, manifest(), "0.7.0");
    expectIssue(result, "invalid_type", ["descriptor"]);
  });

  it.each([
    ["animationPackSchemaVersion", "incompatible_schema"],
    ["animationPlayerProtocolVersion", "incompatible_player_protocol"],
    ["animationCatalogVersion", "incompatible_animation_catalog"]
  ] as const)("fails closed for future %s", (field, code) => {
    const release = descriptor();
    const pack = manifest();
    release[field] = 2;
    pack[field] = 2;
    const result = validateAnimationPackCompatibility(release, pack, "9.0.0");
    expectIssue(result, code, ["descriptor", field]);
    expectIssue(result, code, ["manifest", field]);
  });

  it("fails closed when the current app is below minimum and rejects an invalid current SemVer", () => {
    expectIssue(validateAnimationPackCompatibility(descriptor(), manifest(), "0.6.99"), "incompatible_minimum_app", ["currentAppVersion"]);
    expectIssue(validateAnimationPackCompatibility(descriptor(), manifest(), "v0.7.0"), "invalid_semver", ["currentAppVersion"]);
  });

  it.each([
    ["packId", "gym-local.other"],
    ["version", "1.2.4"],
    ["animationPackSchemaVersion", 2],
    ["animationPlayerProtocolVersion", 2],
    ["animationCatalogVersion", 2],
    ["minimumAppVersion", "0.8.0"],
    ["releaseDate", "2026-08-25"]
  ] as const)("identifies descriptor/manifest mismatch for %s", (field, value) => {
    const pack = manifest() as unknown as Record<string, unknown>;
    pack[field] = value;
    expectIssue(validateAnimationPackCompatibility(descriptor(), pack as unknown as AnimationPackManifest, "9.0.0"), "descriptor_manifest_identity_mismatch", ["manifest", field]);
  });

  it.each(["id", "reviewer", "reviewedAt", "status"] as const)("identifies bound review mismatch for %s", (field) => {
    const pack = manifest();
    (pack.review as unknown as Record<string, unknown>)[field] = field === "reviewedAt" ? "2026-08-25" : field === "status" ? "draft" : "different";
    expectIssue(validateAnimationPackCompatibility(descriptor(), pack, "9.0.0"), "descriptor_manifest_identity_mismatch", ["manifest", "review", field]);
  });

  it("returns only an exact primary equipment variant and never case-folds or falls back", () => {
    const pack = manifest();
    expect(findPrimaryAnimationEntry(pack, "squat__barbell", 1)).toEqual({ success: true, data: pack.entries[0] });
    expectIssue(findPrimaryAnimationEntry(pack, "squat__Barbell", 1), "missing_variant", ["exerciseVariantId"]);
    expectIssue(findPrimaryAnimationEntry(pack, "squat__dumbbell", 1), "missing_variant", ["exerciseVariantId"]);
    expectIssue(findPrimaryAnimationEntry(pack, "squat__barbell", 2), "missing_variant", ["exerciseVariantId"]);
  });
});

describe("installed records and player protocol discriminants", () => {
  const installedCommon = {
    packId: descriptor().packId,
    version: "1.2.3",
    installedByteSize: 20_000,
    installedAt: "2026-08-24T12:30:00.000Z",
    verifiedAt: "2026-08-24T12:29:59+07:00",
    verification: "verified" as const
  };

  it.each([
    { ...installedCommon, status: "active", activePointer: "pointer.active", previousPointer: "pointer.previous" },
    { ...installedCommon, status: "staged", stagedPointer: "pointer.staged" },
    { ...installedCommon, status: "previous", previousPointer: "pointer.previous" }
  ])("accepts verification-safe installed pointer state $status", (value) => {
    expect(parseInstalledAnimationPack(value).success).toBe(true);
  });

  it.each([
    [{ ...installedCommon, status: "active", stagedPointer: "pointer.staged" }, "unexpected_field", ["stagedPointer"]],
    [{ ...installedCommon, status: "staged", activePointer: "pointer.active" }, "unexpected_field", ["activePointer"]],
    [{ ...installedCommon, status: "previous", previousPointer: "pointer.previous", installedAt: "2026-02-30T00:00:00Z" }, "invalid_timestamp", ["installedAt"]],
    [{ ...installedCommon, status: "active", activePointer: "pointer.active", verification: "pending" }, "invalid_enum", ["verification"]]
  ])("rejects installed discriminant or timestamp mismatch", (value, code, path) => {
    expectIssue(parseInstalledAnimationPack(value), code as string, path as Array<string | number>);
  });

  it("preserves exact variant identity and reduced-motion preference", () => {
    const parsed = parseAnimationPlayerRequest(request);
    expect(parsed).toEqual({ success: true, data: request });
    if (parsed.success) {
      expect(parsed.data.exerciseVariantId).toBe("squat__barbell");
      expect(parsed.data.reducedMotion).toBe(true);
    }
  });

  it.each([
    { status: "idle", offlineFallback: "none" },
    { status: "loading", request, offlineFallback: "text" },
    { status: "ready", request, durationSeconds: 4, offlineFallback: "none" },
    { status: "playing", request, positionSeconds: 1, durationSeconds: 4, offlineFallback: "none" },
    { status: "paused", request, positionSeconds: 2, durationSeconds: 4, offlineFallback: "text" },
    { status: "failed", request, error: { code: "missing_asset" }, recoverable: true, offlineFallback: "text" },
    { status: "failed", error: { code: "corrupt_archive", message: "Pack is corrupt." }, recoverable: false, offlineFallback: "text" }
  ])("accepts serializable $status player state", (value) => {
    const result = parseAnimationPlayerState(value);
    expect(result.success).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([
    [{ ...request, playbackSpeed: 0 }, "invalid_playback_speed", ["playbackSpeed"]],
    [{ ...request, playbackSpeed: Number.NaN }, "invalid_playback_speed", ["playbackSpeed"]],
    [{ ...request, playbackSpeed: Number.POSITIVE_INFINITY }, "invalid_playback_speed", ["playbackSpeed"]],
    [{ ...request, reducedMotion: "true" }, "invalid_boolean", ["reducedMotion"]]
  ])("rejects unsafe player request numbers and coercion", (value, code, path) => {
    expectIssue(parseAnimationPlayerRequest(value), code as string, path as Array<string | number>);
  });

  it.each([
    [{ status: "idle", request, offlineFallback: "none" }, "unexpected_field", ["request"]],
    [{ status: "playing", request, positionSeconds: 5, durationSeconds: 4, offlineFallback: "none" }, "invalid_position", ["positionSeconds"]],
    [{ status: "failed", error: { code: "missing_asset" }, recoverable: true, offlineFallback: "none" }, "invalid_enum", ["offlineFallback"]],
    [{ status: "failed", error: { code: "not_stable" }, recoverable: true, offlineFallback: "text" }, "invalid_error_code", ["error", "code"]],
    [{ status: "unknown", offlineFallback: "none" }, "invalid_enum", ["status"]]
  ])("rejects invalid player state field combinations", (value, code, path) => {
    expectIssue(parseAnimationPlayerState(value), code as string, path as Array<string | number>);
  });
});
