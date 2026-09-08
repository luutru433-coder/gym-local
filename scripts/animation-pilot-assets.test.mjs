/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_VARIANT_COUNT, createPilotGlb, inspectPilotGlb, readPilotDeclarations, reproducePilot } from "./animation-pilot-assets.mjs";

describe("animation pilot assets", () => {
  it("materializes both releases twice with identical bytes", async () => {
    const { report } = await reproducePilot({ writeEvidence: false });
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
    const { first } = await reproducePilot({ writeEvidence: false });
    const descriptor = await readFile(join(first.get("1.0.0").outputRoot, "animation-pack-release.json"));
    expect(JSON.parse(descriptor.toString("utf8")).packId).toBe("gym-local.animation-pilot-01");
  }, 30_000);
});
