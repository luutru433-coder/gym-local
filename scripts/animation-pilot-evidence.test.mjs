/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PILOT_EVIDENCE_ROOT } from "./animation-pilot-assets.mjs";
import { generateEvidence, validateEvidence } from "./animation-pilot-evidence.mjs";

describe("animation pilot evidence", () => {
  it("materializes seven finite schema-valid reports without optional review claims", async () => {
    await generateEvidence();
    await expect(validateEvidence()).resolves.toBeUndefined();
    for (const name of ["offline-rollback.json", "personal-data-isolation.json", "accessibility-automation.json", "performance-report.json"]) {
      const report = JSON.parse(await readFile(join(PILOT_EVIDENCE_ROOT, name), "utf8"));
      expect(report.status).toBe("pass");
      expect(report.optionalManualEvidence).toEqual([]);
      expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
    }
  }, 30_000);
});
