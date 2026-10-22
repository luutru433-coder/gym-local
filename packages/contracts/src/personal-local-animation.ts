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

import type { AnimationCamera } from "./animation-pack";

export const personalLocalAnimationSchemaVersion = 1 as const;
export const personalLocalAnimationStorageLayoutVersion = 1 as const;
export const PERSONAL_LOCAL_ANIMATION_MAX_BYTES = 16 * 1024 * 1024;

export type PersonalLocalAnimationOrigin = "user_supplied" | "permissively_sourced";

export interface PersonalLocalNoEgressPolicy {
  backup: false;
  cacheStorage: false;
  export: false;
  releaseEligibility: "never";
  sync: false;
  telemetry: false;
  upload: false;
}

export interface PersonalLocalAnimationRecord {
  schemaVersion: typeof personalLocalAnimationSchemaVersion;
  personalLocalAnimationId: string;
  exerciseVariantId: string;
  mediaType: "model/gltf-binary";
  byteSize: number;
  contentSha256: string;
  clipName: string;
  durationSeconds: number;
  loop: { startSeconds: number; endSeconds: number };
  defaultCamera: AnimationCamera;
  origin: PersonalLocalAnimationOrigin;
  scope: "personal_local_only";
  importedAt: string;
  noEgress: PersonalLocalNoEgressPolicy;
}

export type PersonalLocalAnimationValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: Array<{ code: string; path: Array<string | number> }> };

const ID_PATTERN = /^[a-z0-9]+(?:(?:__|[._-])[a-z0-9]+)*$/;
const LOCAL_ID_PATTERN = /^personal-local\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const RECORD_FIELDS = [
  "schemaVersion", "personalLocalAnimationId", "exerciseVariantId", "mediaType", "byteSize",
  "contentSha256", "clipName", "durationSeconds", "loop", "defaultCamera", "origin", "scope",
  "importedAt", "noEgress"
] as const;

type UnknownRecord = Record<string, unknown>;
type Issue = { code: string; path: Array<string | number> };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactFields(value: UnknownRecord, fields: readonly string[], path: Array<string | number>, issues: Issue[]): void {
  const allowed = new Set(fields);
  for (const key of Object.keys(value).sort()) if (!allowed.has(key)) issues.push({ code: "unexpected_field", path: [...path, key] });
  for (const key of fields) if (!Object.hasOwn(value, key)) issues.push({ code: "missing_field", path: [...path, key] });
}

function finite(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0) && value >= minimum && value <= maximum;
}

function realTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = TIMESTAMP_PATTERN.exec(value);
  if (match === null) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === (match[7] === undefined ? value.replace("Z", ".000Z") : value);
}

function plainText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value
    && ![...value].some((character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f);
}

function vector(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((item) => finite(item, -10_000, 10_000));
}

function parseCamera(value: unknown, issues: Issue[]): AnimationCamera | undefined {
  if (!isRecord(value)) {
    issues.push({ code: "invalid_camera", path: ["defaultCamera"] });
    return undefined;
  }
  exactFields(value, ["preset", "position", "target", "fovDegrees"], ["defaultCamera"], issues);
  if (!["front", "side", "three_quarter", "custom"].includes(String(value.preset))) issues.push({ code: "invalid_camera", path: ["defaultCamera", "preset"] });
  if (!vector(value.position)) issues.push({ code: "invalid_camera", path: ["defaultCamera", "position"] });
  if (!vector(value.target)) issues.push({ code: "invalid_camera", path: ["defaultCamera", "target"] });
  if (!finite(value.fovDegrees, 10, 120)) issues.push({ code: "invalid_camera", path: ["defaultCamera", "fovDegrees"] });
  if (issues.some((issue) => issue.path[0] === "defaultCamera")) return undefined;
  return {
    preset: value.preset as AnimationCamera["preset"],
    position: [...value.position as [number, number, number]],
    target: [...value.target as [number, number, number]],
    fovDegrees: value.fovDegrees as number
  };
}

export function personalLocalNoEgressPolicy(): PersonalLocalNoEgressPolicy {
  return Object.freeze({ backup: false, cacheStorage: false, export: false, releaseEligibility: "never", sync: false, telemetry: false, upload: false });
}

export function parsePersonalLocalAnimationRecord(value: unknown): PersonalLocalAnimationValidationResult<PersonalLocalAnimationRecord> {
  const issues: Issue[] = [];
  if (!isRecord(value)) return { success: false, issues: [{ code: "invalid_type", path: [] }] };
  exactFields(value, RECORD_FIELDS, [], issues);
  if (value.schemaVersion !== personalLocalAnimationSchemaVersion) issues.push({ code: "invalid_schema_version", path: ["schemaVersion"] });
  if (typeof value.personalLocalAnimationId !== "string" || !LOCAL_ID_PATTERN.test(value.personalLocalAnimationId)) issues.push({ code: "invalid_local_id", path: ["personalLocalAnimationId"] });
  if (typeof value.exerciseVariantId !== "string" || value.exerciseVariantId.length > 128 || !ID_PATTERN.test(value.exerciseVariantId)) issues.push({ code: "invalid_variant_id", path: ["exerciseVariantId"] });
  if (value.mediaType !== "model/gltf-binary") issues.push({ code: "invalid_media_type", path: ["mediaType"] });
  if (!Number.isSafeInteger(value.byteSize) || (value.byteSize as number) <= 0 || (value.byteSize as number) > PERSONAL_LOCAL_ANIMATION_MAX_BYTES) issues.push({ code: "invalid_byte_size", path: ["byteSize"] });
  if (typeof value.contentSha256 !== "string" || !SHA256_PATTERN.test(value.contentSha256)) issues.push({ code: "invalid_sha256", path: ["contentSha256"] });
  if (!plainText(value.clipName, 256)) issues.push({ code: "invalid_clip_name", path: ["clipName"] });
  if (!finite(value.durationSeconds, Number.MIN_VALUE, 86_400)) issues.push({ code: "invalid_duration", path: ["durationSeconds"] });
  let loop: PersonalLocalAnimationRecord["loop"] | undefined;
  if (!isRecord(value.loop)) issues.push({ code: "invalid_loop", path: ["loop"] });
  else {
    exactFields(value.loop, ["startSeconds", "endSeconds"], ["loop"], issues);
    if (!finite(value.loop.startSeconds, 0, 86_400)) issues.push({ code: "invalid_loop", path: ["loop", "startSeconds"] });
    if (!finite(value.loop.endSeconds, Number.MIN_VALUE, 86_400)) issues.push({ code: "invalid_loop", path: ["loop", "endSeconds"] });
    if (finite(value.loop.startSeconds, 0, 86_400) && finite(value.loop.endSeconds, Number.MIN_VALUE, 86_400)
      && finite(value.durationSeconds, Number.MIN_VALUE, 86_400)) {
      if (value.loop.startSeconds >= value.loop.endSeconds || value.loop.endSeconds > value.durationSeconds) issues.push({ code: "invalid_loop", path: ["loop"] });
      else loop = { startSeconds: value.loop.startSeconds, endSeconds: value.loop.endSeconds };
    }
  }
  const defaultCamera = parseCamera(value.defaultCamera, issues);
  if (value.origin !== "user_supplied" && value.origin !== "permissively_sourced") issues.push({ code: "invalid_origin", path: ["origin"] });
  if (value.scope !== "personal_local_only") issues.push({ code: "invalid_scope", path: ["scope"] });
  if (!realTimestamp(value.importedAt)) issues.push({ code: "invalid_timestamp", path: ["importedAt"] });
  const expectedNoEgress = personalLocalNoEgressPolicy();
  if (!isRecord(value.noEgress)) issues.push({ code: "invalid_no_egress", path: ["noEgress"] });
  else {
    exactFields(value.noEgress, Object.keys(expectedNoEgress), ["noEgress"], issues);
    for (const [key, expected] of Object.entries(expectedNoEgress)) {
      if (value.noEgress[key] !== expected) issues.push({ code: "invalid_no_egress", path: ["noEgress", key] });
    }
  }
  if (issues.length > 0 || loop === undefined || defaultCamera === undefined) return { success: false, issues };
  return {
    success: true,
    data: {
      schemaVersion: 1,
      personalLocalAnimationId: value.personalLocalAnimationId as string,
      exerciseVariantId: value.exerciseVariantId as string,
      mediaType: "model/gltf-binary",
      byteSize: value.byteSize as number,
      contentSha256: value.contentSha256 as string,
      clipName: value.clipName as string,
      durationSeconds: value.durationSeconds as number,
      loop,
      defaultCamera,
      origin: value.origin as PersonalLocalAnimationOrigin,
      scope: "personal_local_only",
      importedAt: value.importedAt as string,
      noEgress: personalLocalNoEgressPolicy()
    }
  };
}
