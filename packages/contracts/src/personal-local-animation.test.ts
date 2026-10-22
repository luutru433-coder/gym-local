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
  parsePersonalLocalAnimationRecord,
  personalLocalAnimationSchemaVersion,
  personalLocalAnimationStorageLayoutVersion,
  personalLocalNoEgressPolicy
} from "./index";

function record() {
  return {
    schemaVersion: 1,
    personalLocalAnimationId: "personal-local.123e4567-e89b-42d3-a456-426614174000",
    exerciseVariantId: "squat__barbell",
    mediaType: "model/gltf-binary",
    byteSize: 256,
    contentSha256: "a".repeat(64),
    clipName: "SquatLoop",
    durationSeconds: 2,
    loop: { startSeconds: 0, endSeconds: 2 },
    defaultCamera: { preset: "side", position: [3, 1, 0], target: [0, 1, 0], fovDegrees: 45 },
    origin: "user_supplied",
    scope: "personal_local_only",
    importedAt: "2026-10-22T01:02:03.000Z",
    noEgress: { ...personalLocalNoEgressPolicy() }
  };
}

describe("personal-local animation contract", () => {
  it("keeps its schema and storage layout additive and independently locked at v1", () => {
    expect([personalLocalAnimationSchemaVersion, personalLocalAnimationStorageLayoutVersion]).toEqual([1, 1]);
    expect(parsePersonalLocalAnimationRecord(record())).toEqual({ success: true, data: record() });
  });

  it.each([
    ["unknown field", (value: any) => { value.releaseDate = "2026-10-22"; }, "unexpected_field"],
    ["release identity", (value: any) => { value.packId = "gym-local.animation-production"; }, "unexpected_field"],
    ["mutable local id", (value: any) => { value.personalLocalAnimationId = "animation.release-id"; }, "invalid_local_id"],
    ["case-normalized variant", (value: any) => { value.exerciseVariantId = "Squat__Barbell"; }, "invalid_variant_id"],
    ["non-local scope", (value: any) => { value.scope = "offline"; }, "invalid_scope"],
    ["malformed hash", (value: any) => { value.contentSha256 = "A".repeat(64); }, "invalid_sha256"],
    ["oversized bytes", (value: any) => { value.byteSize = 16 * 1024 * 1024 + 1; }, "invalid_byte_size"],
    ["bad timestamp", (value: any) => { value.importedAt = "2026-10-22"; }, "invalid_timestamp"],
    ["egress enabled", (value: any) => { value.noEgress.upload = true; }, "invalid_no_egress"],
    ["release eligible", (value: any) => { value.noEgress.releaseEligibility = "approved"; }, "invalid_no_egress"]
  ])("rejects %s", (_label, mutate, issue) => {
    const value = record();
    mutate(value);
    const parsed = parsePersonalLocalAnimationRecord(value);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.issues.some((candidate) => candidate.code === issue)).toBe(true);
  });

  it("rejects every release trust-domain shape instead of interpreting provenance fields", () => {
    for (const field of ["archiveSha256", "manifestSha256", "sourceId", "licenseId", "review", "provenance"]) {
      const value = { ...record(), [field]: "forbidden" };
      const parsed = parsePersonalLocalAnimationRecord(value);
      expect(parsed).toMatchObject({ success: false, issues: expect.arrayContaining([{ code: "unexpected_field", path: [field] }]) });
    }
  });
});
