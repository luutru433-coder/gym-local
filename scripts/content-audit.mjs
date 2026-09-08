import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const catalogPath = fileURLToPath(new URL("../packages/catalog/src/index.ts", import.meta.url));
const videoManifestPath = fileURLToPath(new URL("../content/exercise-video-guides.json", import.meta.url));
const pilotSourcePath = fileURLToPath(new URL("../content/animation-packs/animation-pilot-01/source.json", import.meta.url));
const pilotReleasesPath = fileURLToPath(new URL("../content/animation-packs/animation-pilot-01/releases.json", import.meta.url));
const dependencyClosurePath = fileURLToPath(new URL("../docs/licenses/animation-pilot-01/dependency-closure.json", import.meta.url));
const lockfilePath = fileURLToPath(new URL("../pnpm-lock.yaml", import.meta.url));
const noticesPath = fileURLToPath(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url));
const source = await readFile(catalogPath, "utf8");
const videoGuides = JSON.parse(await readFile(videoManifestPath, "utf8"));
const pilotSource = JSON.parse(await readFile(pilotSourcePath, "utf8"));
const pilotReleases = JSON.parse(await readFile(pilotReleasesPath, "utf8"));
const dependencyClosure = JSON.parse(await readFile(dependencyClosurePath, "utf8"));
const lockfile = await readFile(lockfilePath, "utf8");
const notices = await readFile(noticesPath, "utf8");
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
  ["Video source attribution", videoGuides.every((guide) => guide.creator && guide.title && guide.reviewMethod === "title-and-equipment-match")],
  ["Pilot exact source matrix", pilotSource.packId === "gym-local.animation-pilot-01" && pilotSource.variants.length === 12 && new Set(pilotSource.variants.map((item) => item.exerciseVariantId)).size === 12],
  ["Pilot authored provenance", pilotSource.author === "Gym Local contributors" && pilotSource.licenseId === "license.mit-gym-local" && pilotSource.sourcePath.endsWith("source.json") && /^automation\./.test(pilotSource.automationId)],
  ["Pilot release sentinels", JSON.stringify(pilotReleases.releases.map((item) => item.version)) === JSON.stringify(["1.0.0", "1.0.1"]) && pilotReleases.redistributionScope === "offline"],
  ["Pinned renderer closure", dependencyClosure.selected === "three-direct" && dependencyClosure.packages.length === 1 && dependencyClosure.packages[0].version === "0.185.1" && dependencyClosure.packages[0].license === "MIT" && dependencyClosure.packages[0].dependencies.length === 0],
  ["Renderer lock integrity", lockfile.includes("three@0.185.1:") && lockfile.includes(dependencyClosure.packages[0].integrity)],
  ["Renderer NOTICE closure", notices.includes("three@0.185.1") && notices.includes("https://github.com/mrdoob/three.js")]
];

for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
