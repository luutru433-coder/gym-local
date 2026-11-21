/** A file the owner picked: `name` may carry folders (from a ZIP), `blob` is its content. */
export interface PackFile {
  name: string;
  blob: Blob;
}

export interface PackImage {
  id: string;
  name: string;
  fileName: string;
  type: string;
  size: number;
  blob: Blob;
}

export interface PackVariant {
  id: string;
  movementId: string;
  equipment: string[];
}

const IMAGE_TYPES: Record<string, string> = {
  gif: "image/gif",
  webp: "image/webp",
  png: "image/png",
  apng: "image/apng",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  avif: "image/avif"
};

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const extension = (path: string) => /\.([a-z0-9]+)$/i.exec(baseName(path))?.[1]?.toLowerCase() ?? "";
const stem = (path: string) => baseName(path).split(/[?#]/)[0].replace(/\.[a-z0-9]+$/i, "").toLowerCase();
const isJunk = (path: string) => /(^|[\\/])(__MACOSX[\\/]|\._|\.DS_Store$)/.test(path);

/** Opens every ZIP in the selection and returns its files beside the loose ones. */
export async function expandPackFiles(files: PackFile[]): Promise<PackFile[]> {
  const expanded: PackFile[] = [];
  for (const file of files) {
    if (extension(file.name) !== "zip") {
      expanded.push(file);
      continue;
    }
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
    for (const entry of Object.values(zip.files)) {
      if (entry.dir || isJunk(entry.name)) continue;
      const kind = extension(entry.name);
      if (!IMAGE_TYPES[kind] && kind !== "json") continue;
      expanded.push({ name: entry.name, blob: new Blob([await entry.async("arraybuffer")], { type: IMAGE_TYPES[kind] ?? "application/json" }) });
    }
  }
  return expanded;
}

function collectRecords(value: unknown, records: Record<string, unknown>[], depth = 0): void {
  if (depth > 4 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, records, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  if (["name", "exerciseName", "title"].some((key) => typeof record[key] === "string")) records.push(record);
  // A named wrapper ({ name: "My pack", exercises: [...] }) still holds the exercise records below it.
  for (const item of Object.values(record)) collectRecords(item, records, depth + 1);
}

/** Maps an image file stem to the exercise name a pack's JSON data gives it (by file reference or by id). */
function labelsFromData(json: unknown, stems: Set<string>): Map<string, string> {
  const records: Record<string, unknown>[] = [];
  collectRecords(json, records);
  const labels = new Map<string, string>();
  for (const record of records) {
    const label = [record.name, record.exerciseName, record.title].find((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (!label) continue;
    for (const value of Object.values(record)) {
      if (typeof value !== "string" && typeof value !== "number") continue;
      const key = stem(String(value));
      if (key && stems.has(key) && !labels.has(key)) labels.set(key, label.trim());
    }
  }
  return labels;
}

/**
 * Turns the picked files into one image per exercise. The same file name in several folders (a pack's
 * size variants) counts as one image and the largest file wins. Names come from the pack's JSON data
 * when it has any, otherwise from the file name.
 */
export async function readExercisePack(files: PackFile[]): Promise<{ images: PackImage[]; ignored: number }> {
  const byStem = new Map<string, PackFile>();
  let ignored = 0;
  const dataFiles: PackFile[] = [];
  for (const file of files) {
    const kind = extension(file.name);
    if (isJunk(file.name)) continue;
    if (kind === "json") dataFiles.push(file);
    else if (IMAGE_TYPES[kind]) {
      const key = stem(file.name);
      const current = byStem.get(key);
      if (!current || file.blob.size > current.blob.size) byStem.set(key, file);
    } else ignored += 1;
  }
  const stems = new Set(byStem.keys());
  const labels = new Map<string, string>();
  for (const file of dataFiles) {
    try {
      for (const [key, label] of labelsFromData(JSON.parse(await file.blob.text()), stems)) if (!labels.has(key)) labels.set(key, label);
    } catch {
      ignored += 1;
    }
  }
  const images = [...byStem.entries()].map(([id, file]) => ({
    id,
    name: (labels.get(id) ?? id.replace(/[-_]+/g, " ")).toLowerCase(),
    fileName: baseName(file.name),
    type: IMAGE_TYPES[extension(file.name)],
    size: file.blob.size,
    blob: file.blob.type === IMAGE_TYPES[extension(file.name)] ? file.blob : new Blob([file.blob], { type: IMAGE_TYPES[extension(file.name)] })
  }));
  return { images: images.sort((a, b) => a.name.localeCompare(b.name)), ignored };
}

const EQUIPMENT_WORDS: Record<string, string[]> = {
  barbell: ["barbell"],
  dumbbell: ["dumbbell", "dumbbells"],
  smith: ["smith"],
  machine: ["lever", "machine", "sled"],
  cable: ["cable"],
  resistance_band: ["band", "resistance"],
  kettlebell: ["kettlebell"],
  trap_bar: ["trap"],
  bodyweight: []
};
const LOADED_WORDS = new Set([...Object.values(EQUIPMENT_WORDS).flat(), "weighted", "assisted", "ez", "olympic", "roller", "ball", "suspension", "bosu"]);
const FILLER_WORDS = new Set(["grip", "with", "on", "the", "a", "an", "of", "medium", "normal", "standard", "male", "female", "version", "v", "ii", "2", "3"]);

/** How a pack is likely to name each movement; `avoid` words mark a different exercise that shares the phrase. */
const MOVEMENT_NAMES: Record<string, { any: string[]; avoid?: string[] }> = {
  chest_press: { any: ["bench press", "chest press"], avoid: ["incline", "decline", "close", "reverse", "one", "single"] },
  incline_chest_press: { any: ["incline bench press", "incline chest press", "incline press"], avoid: ["reverse", "close", "one", "single"] },
  chest_fly: { any: ["chest fly", "fly", "flye", "crossover"], avoid: ["incline", "decline", "rear", "reverse", "one", "low", "high"] },
  push_up: { any: ["push up", "pushup"], avoid: ["incline", "decline", "diamond", "clap", "one", "wide", "close", "pike"] },
  dip: { any: ["chest dip", "triceps dip", "dip"], avoid: ["bench"] },
  lat_pulldown: { any: ["lat pulldown", "pulldown", "pull down"], avoid: ["close", "reverse", "behind", "one", "straight", "underhand"] },
  pull_up: { any: ["pull up", "pullup"], avoid: ["wide", "close", "one", "archer", "muscle"] },
  horizontal_row: { any: ["bent over row", "seated row", "row"], avoid: ["one", "single", "upright", "reverse", "incline", "high"] },
  one_arm_row: { any: ["one arm bent over row", "one arm row", "single arm row"], avoid: ["upright"] },
  pullover: { any: ["pullover"] },
  face_pull: { any: ["face pull"] },
  back_extension: { any: ["back extension", "hyperextension"] },
  overhead_press: { any: ["overhead press", "shoulder press", "military press"], avoid: ["one", "single", "behind", "arnold", "alternate"] },
  lateral_raise: { any: ["lateral raise"], avoid: ["one", "single", "front", "rear", "bent"] },
  rear_delt_fly: { any: ["rear delt fly", "rear delt raise", "rear lateral raise", "reverse fly", "rear fly"] },
  front_raise: { any: ["front raise"], avoid: ["one", "single", "alternate"] },
  upright_row: { any: ["upright row"] },
  shrug: { any: ["shrug"] },
  biceps_curl: { any: ["biceps curl", "curl"], avoid: ["hammer", "preacher", "reverse", "concentration", "leg", "wrist", "incline", "one", "single", "alternate", "lying", "drag", "zottman", "nordic", "cross"] },
  hammer_curl: { any: ["hammer curl"], avoid: ["one", "single", "alternate", "preacher", "incline"] },
  preacher_curl: { any: ["preacher curl"], avoid: ["hammer", "reverse", "one", "single"] },
  reverse_curl: { any: ["reverse curl"], avoid: ["preacher", "wrist"] },
  triceps_pushdown: { any: ["pushdown", "push down", "pressdown"], avoid: ["one", "single", "reverse"] },
  overhead_triceps_extension: { any: ["overhead triceps extension", "overhead extension", "triceps extension"], avoid: ["lying", "one", "single", "kickback"] },
  triceps_press: { any: ["close grip bench press", "close grip press"] },
  triceps_kickback: { any: ["triceps kickback", "kickback"], avoid: ["glute", "leg", "hip", "donkey"] },
  squat: { any: ["full squat", "squat"], avoid: ["split", "front", "hack", "sumo", "jump", "one", "single", "overhead", "goblet", "bulgarian", "pistol", "zercher", "sissy"] },
  leg_press: { any: ["leg press"], avoid: ["calf", "one", "single"] },
  split_squat: { any: ["split squat"], avoid: ["jump"] },
  lunge: { any: ["lunge"], avoid: ["side", "lateral", "reverse", "walking", "jump", "curtsy"] },
  step_up: { any: ["step up"] },
  leg_extension: { any: ["leg extension"], avoid: ["one", "single"] },
  hip_thrust: { any: ["hip thrust", "glute bridge"], avoid: ["one", "single"] },
  glute_kickback: { any: ["glute kickback", "donkey kick", "hip extension"] },
  hip_abduction: { any: ["hip abduction"] },
  hip_adduction: { any: ["hip adduction"] },
  romanian_deadlift: { any: ["romanian deadlift"], avoid: ["one", "single"] },
  leg_curl: { any: ["leg curl"], avoid: ["one", "single"] },
  good_morning: { any: ["good morning"] },
  nordic_curl: { any: ["nordic"] },
  standing_calf_raise: { any: ["standing calf raise", "calf raise"], avoid: ["seated", "one", "single", "donkey"] },
  seated_calf_raise: { any: ["seated calf raise"] },
  crunch: { any: ["crunch"], avoid: ["reverse", "bicycle", "oblique", "twisting", "side", "cross", "decline"] },
  leg_raise: { any: ["leg raise"], avoid: ["side"] },
  plank: { any: ["plank"], avoid: ["side"] },
  rotation: { any: ["wood chop", "woodchop", "twist", "rotation"] },
  anti_rotation: { any: ["pallof"] },
  side_bend: { any: ["side bend"] },
  deadlift: { any: ["deadlift"], avoid: ["romanian", "stiff", "straight", "sumo", "single", "one"] },
  farmer_carry: { any: ["farmer"] }
};

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/**
 * Suggests one image per catalog variant from the image names. A suggestion needs the movement's phrase,
 * the variant's equipment and no word that marks a different exercise; among several, the most specific
 * phrase with the fewest other words wins. It is a starting point the owner can change per exercise.
 */
export function suggestExerciseImageLinks(images: Pick<PackImage, "id" | "name">[], variants: PackVariant[]): Record<string, string> {
  const named = images.map((image) => ({ id: image.id, name: image.name, tokens: words(image.name) }));
  const suggestions: Record<string, string> = {};
  for (const variant of variants) {
    const movement = MOVEMENT_NAMES[variant.movementId];
    if (!movement) continue;
    const own = new Set(variant.equipment.flatMap((equipment) => EQUIPMENT_WORDS[equipment] ?? []));
    let best: { id: string; name: string; phrase: number; extra: number } | undefined;
    for (const image of named) {
      const tokens = new Set(image.tokens);
      if (movement.avoid?.some((word) => tokens.has(word))) continue;
      if (own.size ? ![...own].some((word) => tokens.has(word)) : false) continue;
      if (image.tokens.some((word) => LOADED_WORDS.has(word) && !own.has(word))) continue;
      const text = ` ${image.tokens.join(" ")} `;
      const phrase = movement.any.map(words).filter((phraseWords) => text.includes(` ${phraseWords.join(" ")} `)).sort((a, b) => b.length - a.length)[0];
      if (!phrase) continue;
      const extra = image.tokens.filter((word) => !phrase.includes(word) && !own.has(word) && !FILLER_WORDS.has(word)).length;
      if (extra > 2) continue;
      const candidate = { id: image.id, name: image.name, phrase: phrase.length, extra };
      if (!best || candidate.phrase > best.phrase || (candidate.phrase === best.phrase && (candidate.extra < best.extra || (candidate.extra === best.extra && candidate.name.localeCompare(best.name) < 0)))) best = candidate;
    }
    if (best) suggestions[variant.id] = best.id;
  }
  return suggestions;
}
