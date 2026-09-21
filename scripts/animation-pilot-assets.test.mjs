/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { OUTPUT_FILES } from "./animation-pack-v1.mjs";
import { EXPECTED_VARIANT_COUNT, PILOT_OUTPUT_ROOT, createPilotGlb, inspectPilotGlb, readPilotDeclarations, reproducePilot } from "./animation-pilot-assets.mjs";

function reproductionFingerprints(reproduction) {
  const artifacts = createHash("sha256");
  for (const pass of [reproduction.first, reproduction.second]) {
    for (const version of [...pass.keys()].sort()) {
      for (const name of OUTPUT_FILES) {
        artifacts.update(`${version}:${name}:`);
        artifacts.update(pass.get(version).artifacts.get(name));
      }
    }
  }
  return {
    artifactHash: artifacts.digest("hex"),
    reportHash: createHash("sha256").update(JSON.stringify(reproduction.report)).digest("hex")
  };
}

async function invocationRoots() {
  return (await readdir(PILOT_OUTPUT_ROOT).catch((error) => error?.code === "ENOENT" ? [] : Promise.reject(error)))
    .filter((name) => name.startsWith("invocation-"));
}

describe("animation pilot assets", () => {
  it("materializes both releases twice with identical bytes", async () => {
    const report = await reproducePilot({ writeEvidence: false, consume: (reproduction) => reproduction.report });
    expect(report.status).toBe("pass");
    expect(report.buildsPerRelease).toBe(2);
    expect(report.releases).toHaveLength(2);
    expect(report.releases.every((release) => release.assets === EXPECTED_VARIANT_COUNT && release.entries === EXPECTED_VARIANT_COUNT)).toBe(true);
  }, 30_000);

  it("pins every exact clip, rig, prop node and finite monotonic track", async () => {
    const { source, releases } = await readPilotDeclarations();
    for (const release of releases.releases) {
      for (const variant of source.variants) {
        const bytes = createPilotGlb(variant, release.sentinel, source.rigId);
        const inspected = inspectPilotGlb(bytes, { ...variant, releaseSentinel: release.sentinel });
        expect(inspected.durationSeconds).toBeCloseTo(variant.durationSeconds, 5);
        expect(inspected.props).toEqual(variant.props);
        expect(bytes.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
      }
    }
  });

  it("rejects corruption and undeclared external data", async () => {
    const { source, releases } = await readPilotDeclarations();
    const expected = { ...source.variants[0], releaseSentinel: releases.releases[0].sentinel };
    const corrupt = createPilotGlb(source.variants[0], expected.releaseSentinel);
    corrupt.writeUInt32LE(1, 4);
    expect(() => inspectPilotGlb(corrupt, expected)).toThrow(/invalid GLB header/);
    const wrongClip = createPilotGlb({ ...source.variants[0], clipName: "WrongClip" }, expected.releaseSentinel);
    expect(() => inspectPilotGlb(wrongClip, expected)).toThrow(/clip identity mismatch/);
  });

  it("keeps generated release binaries ignored", async () => {
    const descriptor = await reproducePilot({
      writeEvidence: false,
      consume: ({ first }) => readFile(join(first.get("1.0.0").outputRoot, "animation-pack-release.json"))
    });
    expect(JSON.parse(descriptor.toString("utf8")).packId).toBe("gym-local.animation-pilot-01");
  }, 30_000);

  it("isolates overlapping reproduction consumers and cleans only their owned roots", async () => {
    await mkdir(PILOT_OUTPUT_ROOT, { recursive: true });
    const sentinelPath = join(PILOT_OUTPUT_ROOT, ".fix-03-foreign-sentinel");
    await writeFile(sentinelPath, "foreign-pre-existing-state\n", { flag: "wx" }).catch((error) => {
      if (error?.code !== "EEXIST") throw error;
    });
    const sentinel = await readFile(sentinelPath);
    const rootsBeforeTest = await invocationRoots();

    let arrivals = 0;
    let releaseOverlap;
    const overlap = new Promise((resolvePromise) => { releaseOverlap = resolvePromise; });
    const roots = [];
    const afterOutputPrepared = async (outputRoot) => {
      roots.push(outputRoot);
      arrivals += 1;
      if (arrivals === 2) releaseOverlap();
      await overlap;
    };
    const benchmark = JSON.parse(await readFile("docs/ai/evidence/ANIMATION-PILOT-01-REV-02/renderer-benchmark.json", "utf8"));
    const rendererSelection = {
      selected: benchmark.selected,
      scores: benchmark.candidates.map(({ id, score }) => ({ id, score }))
    };

    const results = await Promise.all([0, 1].map(() => reproducePilot({
      writeEvidence: false,
      hooks: { afterOutputPrepared },
      consume: async (reproduction, invocation) => {
        const latest = reproduction.first.get("1.0.1");
        const manifest = JSON.parse(latest.artifacts.get("animation-pack-manifest.json").toString("utf8"));
        const finalAsset = manifest.assets.at(-1);
        const finalRead = await readFile(join(latest.sourceRoot, ...finalAsset.path.split("/")));
        expect(finalRead.length).toBe(finalAsset.byteSize);
        await expect(lstat(invocation.outputRoot)).resolves.toMatchObject({});
        return { ...reproductionFingerprints(reproduction), rendererSelection };
      }
    })));

    expect(new Set(roots).size).toBe(2);
    expect(roots.every((root) => !rootsBeforeTest.includes(basename(root)))).toBe(true);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].rendererSelection).toEqual(rendererSelection);
    expect(results[0].rendererSelection.selected).toBe("three-direct");
    for (const root of roots) await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });

    let failedRoot;
    await expect(reproducePilot({
      writeEvidence: false,
      hooks: { afterOutputPrepared(outputRoot) { failedRoot = outputRoot; } },
      consume: async ({ first }) => {
        await readFile(join(first.get("1.0.1").outputRoot, "animation-pack-release.json"));
        throw new Error("injected consumer failure after final read");
      }
    })).rejects.toThrow("injected consumer failure after final read");
    await expect(lstat(failedRoot)).rejects.toMatchObject({ code: "ENOENT" });
    const ownedRootNames = [...roots, failedRoot].map((root) => basename(root));
    expect((await invocationRoots()).filter((name) => ownedRootNames.includes(name))).toEqual([]);
    expect(await readFile(sentinelPath)).toEqual(sentinel);
  }, 60_000);
});
