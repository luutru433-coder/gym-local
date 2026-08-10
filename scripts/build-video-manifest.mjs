import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] ?? "work/sources/youtube-candidates.json";
const outputPath = process.argv[3] ?? "content/exercise-video-guides.json";
const candidatesByVariant = JSON.parse(await readFile(inputPath, "utf8"));

const manualCandidateIndex = {
  "chest_press__barbell": 3,
  "deadlift__dumbbell": 1,
  "glute_kickback__machine": 1,
  "leg_raise__cable": 3,
  "overhead_triceps_extension__machine": 3,
  "step_up__resistance_band": 1
};

const equipmentTerms = {
  bodyweight: ["bodyweight", "body weight", "no equipment"],
  dumbbell: ["dumbbell", "db "],
  barbell: ["barbell", "bench press"],
  smith: ["smith"],
  cable: ["cable", "pulley"],
  machine: ["machine", "selectorized", "plate loaded"],
  resistance_band: ["resistance band", "banded", " band "],
  kettlebell: ["kettlebell"],
  trap_bar: ["trap bar", "hex bar"]
};

function durationSeconds(value = "") {
  return value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

function equipmentScore(variantId, candidate) {
  const equipment = variantId.slice(variantId.lastIndexOf("__") + 2);
  const title = ` ${candidate.title.toLowerCase()} `;
  const expected = equipmentTerms[equipment] ?? [];
  let score = expected.some((term) => title.includes(term)) ? 12 : 0;
  for (const [otherEquipment, terms] of Object.entries(equipmentTerms)) {
    if (otherEquipment !== equipment && terms.some((term) => title.includes(term))) score -= 7;
  }
  if (/mistake|don.t do|stop doing|versus|\bvs\b|workout|\d+ exercises/.test(title)) score -= 6;
  const length = durationSeconds(candidate.length);
  if (length >= 20 && length <= 600) score += 2;
  if (length > 0 && length < 10) score -= 1;
  return candidate.score + score;
}

const guides = candidatesByVariant.map((entry) => {
  if (!entry.candidates?.length) throw new Error(`Missing candidates for ${entry.variantId}`);
  const manualIndex = manualCandidateIndex[entry.variantId];
  const selected = manualIndex === undefined
    ? [...entry.candidates].sort((a, b) => equipmentScore(entry.variantId, b) - equipmentScore(entry.variantId, a))[0]
    : entry.candidates[manualIndex];
  if (!selected) throw new Error(`Invalid manual candidate for ${entry.variantId}`);
  return {
    variantId: entry.variantId,
    provider: "youtube",
    demonstrationType: selected.channel.toLowerCase().includes("muscle & motion") ? "3d" : "human",
    videoId: selected.videoId,
    title: selected.title,
    creator: selected.channel || "YouTube creator",
    duration: selected.length,
    reviewMethod: "title-and-equipment-match",
    reviewedAt: "2026-08-10",
    lastVerifiedAt: "2026-08-10"
  };
});

const ids = new Set();
for (const guide of guides) {
  if (ids.has(guide.variantId)) throw new Error(`Duplicate guide for ${guide.variantId}`);
  if (!/^[A-Za-z0-9_-]{11}$/.test(guide.videoId)) throw new Error(`Invalid YouTube id for ${guide.variantId}`);
  ids.add(guide.variantId);
}

await writeFile(outputPath, `${JSON.stringify(guides, null, 2)}\n`, "utf8");
console.log(`Wrote ${guides.length} direct video guides to ${outputPath}`);
