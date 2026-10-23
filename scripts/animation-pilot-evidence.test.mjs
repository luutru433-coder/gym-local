/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { PILOT_EVIDENCE_ROOT } from "./animation-pilot-assets.mjs";
import { runRendererBenchmark, withBenchmarkEvidenceOutputRoot } from "./animation-pilot-benchmark.mjs";
import { validateEvidence } from "./animation-pilot-evidence.mjs";

const benchmarkRelativePath = "docs/ai/evidence/ANIMATION-PILOT-01-REV-02/renderer-benchmark.json";

function gitStatus() {
  return execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
}

describe("animation pilot evidence", () => {
  it("materializes seven finite schema-valid reports without optional review claims", async () => {
    await expect(validateEvidence({ regenerate: false })).resolves.toBeUndefined();
    for (const name of ["offline-rollback.json", "personal-data-isolation.json", "accessibility-automation.json", "performance-report.json"]) {
      const report = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, name), "utf8"));
      expect(report.status).toBe("pass");
      expect(report.optionalManualEvidence).toEqual([]);
      expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
    }

    const benchmark = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "renderer-benchmark.json"), "utf8"));
    expect(benchmark.selected).toBe("three-direct");
    expect(benchmark.candidates).toHaveLength(3);
    for (const candidate of benchmark.candidates) {
      expect(candidate.workload).toMatchObject({
        releases: 2,
        variants: 12,
        cycles: 10,
        parsedAssets: 240,
        mountedAssets: 240,
        remoteRequestAttempts: 0
      });
      expect(candidate.workload.operationTrace).toHaveLength(130);
      expect(candidate.workload).not.toHaveProperty("timing");
      expect(candidate.closureBytes).toBeGreaterThan(0);
      expect(candidate.packages.every((item) => item.versionMatches && item.integrityMatches && item.licenseMatches)).toBe(true);
      expect(Object.values(candidate.ownedResourceLeaks).every((count) => count === 0)).toBe(true);
    }

    const lifecycle = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "offline-rollback.json"), "utf8"));
    expect(lifecycle).toMatchObject({
      backendKind: "OpfsAnimationPackBackend",
      verifiedBlobCount: 12,
      playedBlobCount: 12,
      networkRequestAttempts: 0,
      textFallbackPreserved: true
    });
    expect(lifecycle.exactVariantIds).toHaveLength(12);
    expect(lifecycle.rendererFrameEvents).toBeGreaterThanOrEqual(12);
    expect(lifecycle.objectStates.map((state) => [state.phase, state.activeVersion, state.previousVersion, state.archiveObjectCount])).toEqual([
      ["install", "1.0.0", null, 1],
      ["offline-relaunch", "1.0.0", null, 1],
      ["failed-update", "1.0.0", null, 1],
      ["update", "1.0.1", "1.0.0", 2],
      ["rollback", "1.0.0", "1.0.1", 2],
      ["remove", null, null, 0]
    ]);

    const personal = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "personal-data-isolation.json"), "utf8"));
    expect(personal.phases).toHaveLength(6);
    for (const phase of personal.phases) {
      expect(phase.beforeHash).toBe(phase.afterHash);
      expect(phase.beforeCounts).toEqual(phase.afterCounts);
      expect(phase.personalDataMutated).toBe(false);
    }
    expect(personal).toMatchObject({ personalTablesChanged: 0, personalRecordCountDelta: 0, backupVersion: 5, packBytesInBackup: false });
    expect(personal.backupAudit.forbiddenStringMatches).toEqual([]);
    expect(personal.backupAudit.forbiddenArtifactMatches).toEqual([]);
    expect(personal.backupAudit.checkedArtifacts).toHaveLength(30);

    const accessibility = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "accessibility-automation.json"), "utf8"));
    expect(accessibility).toMatchObject({
      widthsCssPx: [320, 390],
      nativeKeyboardControls: true,
      politeAtomicStatus: true,
      writtenFallbackAlwaysPresent: true,
      reducedMotionStaticFrame: true,
      failureFallback: true
    });

    const performance = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, "performance-report.json"), "utf8"));
    expect(performance.measured.retainedArchiveMultiplier).toBeGreaterThan(1);
    expect(performance.measured.retainedArchiveMultiplier).toBeLessThanOrEqual(performance.budgets.retainedArchiveMultiplierMaximum);
    expect(performance.measured.resourceLeaks).toBe(0);
    expect(performance.resourceDerivation.rendererDiagnostics).toMatchObject({ mounts: 12, disposals: 12 });
    expect(performance.resourceDerivation.objectStates.at(-1)).toMatchObject({ phase: "remove", archiveBytes: 0 });
  }, 30_000);

  it("uses invocation-owned evidence output without mutating tracked evidence", async () => {
    const benchmarkPath = join(process.cwd(), benchmarkRelativePath);
    const committedBytes = execFileSync("git", ["show", `HEAD:${benchmarkRelativePath}`]);
    const committed = JSON.parse(committedBytes.toString("utf8"));
    const expectedScores = committed.candidates.map(({ id, score }) => ({ id, score }));
    const trackedMtime = (await stat(benchmarkPath, { bigint: true })).mtimeNs;
    const temporaryPhysical = await realpath(tmpdir());
    const boundary = await mkdtemp(join(temporaryPhysical, "gym-local-animation-pilot-evidence-"));
    const sentinelPath = join(boundary, "foreign-sentinel.txt");
    await writeFile(sentinelPath, "foreign pre-existing sibling\n", { flag: "wx" });
    const sentinel = await readFile(sentinelPath);
    const invocationRoots = [];
    try {
      for (let rerun = 1; rerun <= 2; rerun += 1) {
        const timingDiagnostics = [];
        let invocationRoot;
        await withBenchmarkEvidenceOutputRoot(boundary, async (evidenceOutputRoot) => {
          invocationRoot = evidenceOutputRoot.root;
          invocationRoots.push(invocationRoot);
          const containment = relative(boundary, invocationRoot);
          expect(containment).not.toBe("");
          expect(containment).not.toBe("..");
          expect(containment.startsWith(`..${sep}`)).toBe(false);
          expect(isAbsolute(containment)).toBe(false);
          const report = await runRendererBenchmark({
            writeEvidence: true,
            evidenceOutputRoot,
            onTimingDiagnostic: (diagnostic) => timingDiagnostics.push(diagnostic)
          });
          const temporaryBytes = await readFile(join(invocationRoot, "renderer-benchmark.json"));
          expect(temporaryBytes, `rerun ${rerun} changed benchmark bytes`).toEqual(committedBytes);
          expect(report.candidates.map(({ id, score }) => ({ id, score }))).toEqual(expectedScores);
          expect(report.selected).toBe("three-direct");
          expect(timingDiagnostics).toHaveLength(3);
          expect(timingDiagnostics.every(({ durationMs, averageAssetMs }) => durationMs > 0 && averageAssetMs > 0)).toBe(true);
          expect(JSON.stringify(report)).not.toContain('"timing"');
          await expect(lstat(invocationRoot)).resolves.toMatchObject({});
        });
        await expect(lstat(invocationRoot), `rerun ${rerun} leaked its invocation output root`).rejects.toMatchObject({ code: "ENOENT" });
      }

      let failedRoot;
      await expect(withBenchmarkEvidenceOutputRoot(boundary, async (evidenceOutputRoot) => {
        failedRoot = evidenceOutputRoot.root;
        invocationRoots.push(failedRoot);
        await runRendererBenchmark({ writeEvidence: true, evidenceOutputRoot });
        expect(await readFile(join(failedRoot, "renderer-benchmark.json"))).toEqual(committedBytes);
        throw new Error("injected failure after final benchmark report read");
      })).rejects.toThrow("injected failure after final benchmark report read");
      await expect(lstat(failedRoot), "injected failure leaked its invocation output root").rejects.toMatchObject({ code: "ENOENT" });

      expect(new Set(invocationRoots).size).toBe(3);
      expect(await readFile(sentinelPath)).toEqual(sentinel);
      expect(await readFile(benchmarkPath)).toEqual(committedBytes);
      expect((await stat(benchmarkPath, { bigint: true })).mtimeNs).toBe(trackedMtime);
      expect(gitStatus()).toBe("");
    } finally {
      await rm(boundary, { recursive: true });
    }
  }, 60_000);
});
