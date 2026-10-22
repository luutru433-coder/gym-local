/*
 * Copyright (c) 2026 MyCompany LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PERSONAL_LOCAL_FILES = [
  "packages/contracts/src/personal-local-animation.ts",
  "packages/storage/src/personal-local-animation/store.ts",
  "packages/storage/src/personal-local-animation/opfs.ts",
  "packages/media/src/personal-local-animation.ts",
  "apps/web/src/features/settings/PersonalLocalAnimationCard.tsx"
];

async function filesBelow(root) {
  const result = [];
  const visit = async (path) => {
    for (const name of await readdir(path)) {
      const target = resolve(path, name);
      const info = await stat(target);
      if (info.isDirectory()) await visit(target); else result.push(target);
    }
  };
  await visit(root);
  return result;
}

export async function validatePersonalLocalEvidence() {
  const sources = await Promise.all(PERSONAL_LOCAL_FILES.map((file) => readFile(file, "utf8")));
  const combined = sources.join("\n");
  const failures = [];
  if (!combined.includes("personal_local_only") || !combined.includes("releaseEligibility")) failures.push("literal trust-domain policy is missing");
  if (!combined.includes("personalLocalAnimationId") || !combined.includes("exerciseVariantId")) failures.push("exact identity fields are missing");
  const storage = sources[1] + sources[2];
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|caches\.)\s*(?:\(|\.)/.test(storage)) failures.push("storage includes a network or CacheStorage operation");
  const publicApi = `${await readFile("packages/storage/src/personal-local-animation/index.ts", "utf8")}\n${await readFile("packages/media/src/personal-local-animation.ts", "utf8")}`;
  if (/export\s+(?:async\s+)?function\s+\w*(?:Export|Download|Share|Upload|Sync|Telemetry|Network)/i.test(publicApi)) failures.push("public API exposes an egress operation");
  if (failures.length) throw new Error(failures.join("; "));
  return { status: "PASS", checkedFiles: PERSONAL_LOCAL_FILES.length, networkOperations: 0, cacheStorageWrites: 0, egressApis: 0 };
}

export async function auditPersonalLocalBuild(root) {
  const files = await filesBelow(root);
  const forbidden = ["PERSONAL_LOCAL_BYTE_SENTINEL", "PRIVATE_LOCAL_FILENAME_SENTINEL", "PRIVATE_LOCAL_HASH_SENTINEL"];
  const findings = [];
  for (const file of files) {
    const bytes = await readFile(file);
    const text = bytes.toString("utf8");
    if (bytes.subarray(0, 4).equals(Buffer.from([0x67, 0x6c, 0x54, 0x46])) || bytes.subarray(0, 2).equals(Buffer.from([0x50, 0x4b]))) findings.push(`${file}:binary-container`);
    for (const marker of forbidden) if (text.includes(marker)) findings.push(`${file}:${marker}`);
  }
  if (findings.length) throw new Error(`Personal-local build exclusion failed: ${findings.join(", ")}`);
  return { status: "PASS", filesInspected: files.length, findings: [] };
}

async function main() {
  const [command, option, value] = process.argv.slice(2);
  if (command === "validate") { console.log(JSON.stringify(await validatePersonalLocalEvidence())); return; }
  if (command === "audit-build" && option === "--dist" && value) { console.log(JSON.stringify(await auditPersonalLocalBuild(resolve(value)))); return; }
  throw new Error("Usage: personal-local-animation-evidence.mjs validate | audit-build --dist <path>");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
