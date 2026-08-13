/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const online = process.argv.includes("--online");
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const reportPath = resolve(outputArgument?.slice("--output=".length) || "reports/media-health-report.json");
const server = await createServer({ configFile: false, root: process.cwd(), appType: "custom", server: { middlewareMode: true } });

let catalog;
let auditExerciseMedia;
try {
  catalog = await server.ssrLoadModule("/packages/catalog/src/index.ts");
  ({ auditExerciseMedia } = await server.ssrLoadModule("/packages/media/src/index.ts"));
} finally {
  await server.close();
}

const staticAudit = auditExerciseMedia(catalog.EXERCISE_VARIANTS, catalog.CONTENT_SOURCES);
const guides = catalog.EXERCISE_VARIANTS
  .filter((variant) => variant.reviewStatus === "reviewed")
  .flatMap((variant) => variant.videoGuides);

async function checkGuide(guide) {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", guide.watchUrl);
  endpoint.searchParams.set("format", "json");
  try {
    const response = await fetch(endpoint, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    return response.ok
      ? { variantId: guide.variantId, videoId: guide.videoId, status: "healthy", httpStatus: response.status }
      : { variantId: guide.variantId, videoId: guide.videoId, status: "unavailable", httpStatus: response.status };
  } catch (error) {
    return { variantId: guide.variantId, videoId: guide.videoId, status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

const onlineResults = online ? await mapConcurrent(guides, 6, checkGuide) : [];
const onlineFailures = onlineResults.filter((result) => result.status !== "healthy");
const report = {
  generatedAt: new Date().toISOString(),
  static: {
    status: staticAudit.issues.length ? "fail" : "pass",
    ...staticAudit
  },
  online: online
    ? { status: onlineFailures.length ? "fail" : "pass", checked: onlineResults.length, healthy: onlineResults.length - onlineFailures.length, failures: onlineFailures }
    : { status: "not_run", checked: 0, healthy: 0, failures: [] },
  policy: {
    onlineOnly: true,
    availabilityCheck: "YouTube oEmbed metadata only; no video or thumbnail is downloaded",
    offlineFallbackRequired: true
  }
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`${report.static.status.toUpperCase()} media metadata: ${staticAudit.reviewedVariantCount} reviewed variants, ${staticAudit.directVideoCount} direct videos, ${staticAudit.issues.length} issue(s)`);
console.log(online ? `${report.online.status.toUpperCase()} media availability: ${report.online.healthy}/${report.online.checked} healthy` : "SKIP online availability (run with --online for the release report)");
console.log(`Report: ${reportPath}`);
if (staticAudit.issues.length || onlineFailures.length) process.exit(1);
