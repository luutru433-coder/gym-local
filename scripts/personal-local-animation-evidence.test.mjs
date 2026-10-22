/*
 * Copyright (c) 2026 MyCompany LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditPersonalLocalBuild, validatePersonalLocalEvidence } from "./personal-local-animation-evidence.mjs";

const temporary = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("personal-local evidence", () => {
  it("validates static zero-egress and exact-identity boundaries", async () => {
    await expect(validatePersonalLocalEvidence()).resolves.toMatchObject({ status: "PASS", networkOperations: 0, egressApis: 0 });
  });

  it("rejects personal-local markers and binary containers from build output", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "gym-local-pla-evidence-"));
    temporary.push(root);
    await mkdir(resolve(root, "assets"));
    await writeFile(resolve(root, "clean.js"), "console.log('clean')");
    await expect(auditPersonalLocalBuild(root)).resolves.toMatchObject({ status: "PASS" });
    await writeFile(resolve(root, "assets", "leak.js"), "PERSONAL_LOCAL_BYTE_SENTINEL");
    await expect(auditPersonalLocalBuild(root)).rejects.toThrow(/exclusion/);
  });
});
