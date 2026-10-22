/*
 * Copyright (c) 2026 MyCompany LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalLocalAnimationCard } from "./PersonalLocalAnimationCard";
import { personalLocalNoEgressPolicy, type PersonalLocalAnimationRecord } from "@gym/contracts";
import type { PersonalLocalAnimationListItem } from "@gym/storage";

const storage = vi.hoisted(() => ({
  listPersonalLocalAnimations: vi.fn<() => Promise<PersonalLocalAnimationListItem[]>>(async () => []), importPersonalLocalAnimation: vi.fn(async () => ({})),
  activatePersonalLocalAnimation: vi.fn(async () => []), removePersonalLocalAnimation: vi.fn(async () => [])
}));
vi.mock("@gym/storage", async (original) => ({ ...(await original()), ...storage }));

afterEach(() => { cleanup(); vi.clearAllMocks(); storage.listPersonalLocalAnimations.mockResolvedValue([]); });

describe("personal-local animation settings", () => {
  it("requires a file, exact variant, origin assertion and local-only acknowledgement", async () => {
    const user = userEvent.setup(); render(<PersonalLocalAnimationCard locale="en" />);
    const submit = screen.getByRole("button", { name: "Import on device" }); expect(submit).toBeDisabled();
    const file = new File([new Uint8Array([1, 2, 3])], "private.glb", { type: "model/gltf-binary" });
    fireEvent.change(screen.getByLabelText("GLB file"), { target: { files: [file] } });
    await user.selectOptions(screen.getByLabelText("Exact exercise variant"), screen.getByLabelText("Exact exercise variant").querySelectorAll("option")[1]!.value);
    await user.click(screen.getByRole("radio", { name: "My own file" }));
    await user.click(screen.getByRole("checkbox")); expect(submit).toBeEnabled(); await user.click(submit);
    await waitFor(() => expect(storage.importPersonalLocalAnimation).toHaveBeenCalledWith(expect.objectContaining({ file, origin: "user_supplied", localOnlyAcknowledged: true })));
    expect(screen.getByText(/absent from backup and transfer/)).toBeInTheDocument();
    expect(screen.getByText(/Written instructions always remain available/)).toBeInTheDocument();
  });

  it("offers accessible exact preview and remove controls without export or sharing", async () => {
    const record: PersonalLocalAnimationRecord = { schemaVersion: 1, personalLocalAnimationId: "personal-local.00000000-0000-4000-8000-000000000001", exerciseVariantId: "squat__barbell", mediaType: "model/gltf-binary", byteSize: 4, contentSha256: "a".repeat(64), clipName: "Private clip", durationSeconds: 1, loop: { startSeconds: 0, endSeconds: 1 }, defaultCamera: { preset: "front", position: [0, 1, 3], target: [0, 1, 0], fovDegrees: 45 }, origin: "user_supplied", scope: "personal_local_only", importedAt: "2026-10-22T00:00:00.000Z", noEgress: personalLocalNoEgressPolicy() };
    storage.listPersonalLocalAnimations.mockResolvedValue([{ active: false, record }]);
    render(<PersonalLocalAnimationCard locale="en" />);
    expect(await screen.findByText("Private clip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export|share|upload|sync/i })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { hidden: true })).toBeDefined();
  });
});
