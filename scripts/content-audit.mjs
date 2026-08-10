import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const catalogPath = fileURLToPath(new URL("../packages/catalog/src/index.ts", import.meta.url));
const videoManifestPath = fileURLToPath(new URL("../content/exercise-video-guides.json", import.meta.url));
const source = await readFile(catalogPath, "utf8");
const videoGuides = JSON.parse(await readFile(videoManifestPath, "utf8"));
const httpsUrls = [...source.matchAll(/https:\/\/[^`"'\s]+/g)].map((match) => match[0]);
const insecure = [...source.matchAll(/http:\/\/[^`"'\s]+/g)].map((match) => match[0]);
const sourceIds = [...source.matchAll(/id:\s*"(gym-local-original|free-exercise-db|youtube-video-guides)"/g)].map((match) => match[1]);
const licenseIds = [...source.matchAll(/licenseId:\s*"([^"]+)"/g)].map((match) => match[1]);
const reviewedDates = [...source.matchAll(/reviewedAt:\s*"([^"]+)"/g)].map((match) => match[1]);
const invalidDates = reviewedDates.filter((value) => Number.isNaN(Date.parse(value)));

const checks = [
  ["HTTPS URLs", httpsUrls.length > 0],
  ["No insecure media URLs", insecure.length === 0],
  ["Declared source IDs", new Set(sourceIds).size >= 3],
  ["Declared licenses", licenseIds.length >= 3 && licenseIds.every(Boolean)],
  ["Valid review dates", reviewedDates.length >= 3 && invalidDates.length === 0],
  ["Direct video coverage", videoGuides.length >= 180 && videoGuides.every((guide) => /^[A-Za-z0-9_-]{11}$/.test(guide.videoId))],
  ["Unique variant video IDs", new Set(videoGuides.map((guide) => guide.variantId)).size === videoGuides.length],
  ["No search-result media", !source.includes("youtube.com/results") && !JSON.stringify(videoGuides).includes("/results")],
  ["Video source attribution", videoGuides.every((guide) => guide.creator && guide.title && guide.reviewMethod === "title-and-equipment-match")]
];

for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
