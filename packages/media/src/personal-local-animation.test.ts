/*
 * Copyright (c) 2026 MyCompany LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { describe, expect, it, vi } from "vitest";
import { personalLocalNoEgressPolicy, type AnimationPlayerRequest, type PersonalLocalAnimationRecord } from "@gym/contracts";
import { createAnimationPlayerController } from "./animation-player";
import { createPersonalLocalAnimationAssetLoader } from "./personal-local-animation";
import { createTestAnimationRenderer } from "./animation-player.test-renderer";

const request: AnimationPlayerRequest = { exerciseVariantId: "squat__barbell", animationId: "personal-local.00000000-0000-4000-8000-000000000001", playbackSpeed: 1, cameraPreset: "front", mirrorMode: "none", reducedMotion: false };
const record: PersonalLocalAnimationRecord = {
  schemaVersion: 1, personalLocalAnimationId: request.animationId, exerciseVariantId: request.exerciseVariantId,
  mediaType: "model/gltf-binary", byteSize: 4, contentSha256: "a".repeat(64), clipName: "Local clip", durationSeconds: 1,
  loop: { startSeconds: 0, endSeconds: 1 }, defaultCamera: { preset: "front", position: [0, 1, 3], target: [0, 1, 0], fovDegrees: 45 },
  origin: "user_supplied", scope: "personal_local_only", importedAt: "2026-10-22T00:00:00.000Z", noEgress: personalLocalNoEgressPolicy()
};

describe("personal-local player adapter", () => {
  it("passes the exact case-sensitive identity and reaches ready without release provenance impersonation", async () => {
    const read = vi.fn(async () => ({ kind: "personal_local" as const, record, blob: new Blob([new Uint8Array(4)], { type: record.mediaType }) }));
    const renderer = createTestAnimationRenderer();
    const controller = createAnimationPlayerController({ loader: createPersonalLocalAnimationAssetLoader(read), renderer: renderer.renderer });
    controller.attach(document.createElement("div")); controller.load(request);
    await vi.waitFor(() => expect(renderer.mountCount()).toBe(1));
    expect(read).toHaveBeenCalledWith({ personalLocalAnimationId: request.animationId, exerciseVariantId: request.exerciseVariantId, signal: expect.any(AbortSignal) });
    expect(renderer.mountInput().entry).not.toHaveProperty("sourceId");
    renderer.resolveMount();
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("ready"));
  });

  it("rejects reader substitution across IDs or equipment variants", async () => {
    const changed = { ...record, exerciseVariantId: "squat__dumbbell" };
    const loader = createPersonalLocalAnimationAssetLoader(async () => ({ kind: "personal_local", record: changed, blob: new Blob([new Uint8Array(4)]) }));
    await expect(loader.load(request, new AbortController().signal)).rejects.toThrow(/Exact/);
  });
});
