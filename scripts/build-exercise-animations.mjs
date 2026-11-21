// Regenerates content/exercise-animations.json and public/exercise-animations/ from a local
// checkout of https://github.com/bryllim/workout-guide (artwork: CC BY-SA 4.0).
// Usage: node scripts/build-exercise-animations.mjs <path-to-workout-guide-checkout> <upstream-commit>
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const upstream = process.argv[2];
const upstreamCommit = process.argv[3];
if (!upstream || !upstreamCommit) {
  console.error("Usage: node scripts/build-exercise-animations.mjs <workout-guide checkout> <upstream commit>");
  process.exit(1);
}

// variant id -> upstream slug. A leading "~" marks the closest available drawing when upstream
// has no figure for that exact equipment; the app labels those as "closest illustration".
const mapping = {
  chest_press: { dumbbell: "dumbbell-bench-press", barbell: "bench-press", smith: "smith-machine-bench-press", machine: "machine-chest-press", cable: "~machine-chest-press", resistance_band: "~machine-chest-press" },
  incline_chest_press: { dumbbell: "incline-dumbbell-press", barbell: "incline-bench-press", smith: "~incline-bench-press", machine: "~incline-bench-press", cable: "~incline-dumbbell-press" },
  chest_fly: { dumbbell: "dumbbell-fly", cable: "cable-fly", machine: "pec-deck", resistance_band: "~cable-fly" },
  push_up: { bodyweight: "push-up", resistance_band: "~push-up", smith: "~incline-push-up" },
  dip: { bodyweight: "chest-dip", machine: "assisted-dip", resistance_band: "~assisted-dip" },
  lat_pulldown: { cable: "lat-pulldown", machine: "~lat-pulldown", resistance_band: "banded-lat-pulldown" },
  pull_up: { bodyweight: "pull-up", machine: "assisted-pull-up", resistance_band: "~assisted-pull-up" },
  horizontal_row: { cable: "seated-row", machine: "machine-row", barbell: "barbell-row", dumbbell: "dumbbell-bent-over-row", resistance_band: "banded-row", smith: "~barbell-row" },
  one_arm_row: { dumbbell: "one-arm-dumbbell-row", cable: "single-arm-cable-row", machine: "~machine-row", resistance_band: "~single-arm-cable-row" },
  pullover: { cable: "straight-arm-pulldown", dumbbell: "~straight-arm-pulldown", machine: "~straight-arm-pulldown", resistance_band: "~straight-arm-pulldown" },
  face_pull: { cable: "face-pull", resistance_band: "banded-face-pull" },
  back_extension: { bodyweight: "back-extension", machine: "~back-extension", barbell: "~back-extension" },
  overhead_press: { dumbbell: "standing-dumbbell-press", barbell: "overhead-press", smith: "~overhead-press", machine: "machine-shoulder-press", cable: "~standing-dumbbell-press", resistance_band: "~standing-dumbbell-press" },
  lateral_raise: { dumbbell: "lateral-raise", cable: "cable-lateral-raise", machine: "machine-lateral-raise", resistance_band: "~lateral-raise" },
  rear_delt_fly: { dumbbell: "rear-delt-fly", cable: "cable-rear-delt-fly", machine: "reverse-pec-deck", resistance_band: "band-pull-apart" },
  front_raise: { dumbbell: "front-raise", cable: "cable-front-raise", barbell: "~plate-front-raise", resistance_band: "~front-raise" },
  upright_row: { barbell: "upright-row", cable: "~upright-row", dumbbell: "~upright-row", smith: "~upright-row", resistance_band: "~upright-row" },
  shrug: { dumbbell: "dumbbell-shrug", barbell: "shrug", smith: "~shrug", machine: "~shrug", cable: "~shrug" },
  biceps_curl: { dumbbell: "bicep-curl", barbell: "ez-bar-curl", cable: "cable-curl", machine: "~preacher-curl", resistance_band: "~bicep-curl" },
  hammer_curl: { dumbbell: "hammer-curl", cable: "rope-hammer-curl", resistance_band: "~hammer-curl" },
  preacher_curl: { barbell: "~preacher-curl", dumbbell: "~preacher-curl", cable: "~preacher-curl", machine: "preacher-curl" },
  reverse_curl: { barbell: "reverse-curl", dumbbell: "~reverse-curl", cable: "~reverse-curl", resistance_band: "~reverse-curl" },
  triceps_pushdown: { cable: "tricep-pushdown", resistance_band: "~tricep-pushdown", machine: "~tricep-pushdown" },
  overhead_triceps_extension: { dumbbell: "dumbbell-overhead-tricep-extension", cable: "overhead-tricep-extension", barbell: "~dumbbell-overhead-tricep-extension", resistance_band: "~overhead-tricep-extension", machine: "~overhead-tricep-extension" },
  triceps_press: { barbell: "close-grip-bench-press", dumbbell: "~close-grip-bench-press", smith: "~close-grip-bench-press", machine: "~assisted-dip", bodyweight: "diamond-push-up" },
  triceps_kickback: { dumbbell: "tricep-kickback", cable: "~tricep-kickback", resistance_band: "~tricep-kickback" },
  squat: { bodyweight: "bodyweight-squat", barbell: "squat", dumbbell: "goblet-squat", smith: "smith-machine-squat", machine: "hack-squat", resistance_band: "banded-squat" },
  leg_press: { machine: "leg-press" },
  split_squat: { bodyweight: "~split-squat", dumbbell: "split-squat", barbell: "~split-squat", smith: "smith-machine-split-squat", resistance_band: "~split-squat" },
  lunge: { bodyweight: "forward-lunge", dumbbell: "walking-lunge", barbell: "~forward-lunge", smith: "smith-machine-reverse-lunge", resistance_band: "~forward-lunge" },
  step_up: { bodyweight: "~step-up", dumbbell: "step-up", barbell: "~step-up", resistance_band: "~step-up" },
  leg_extension: { machine: "leg-extension", resistance_band: "~leg-extension", cable: "~leg-extension" },
  hip_thrust: { bodyweight: "~glute-bridge", barbell: "hip-thrust", dumbbell: "dumbbell-hip-thrust", smith: "smith-machine-hip-thrust", machine: "~hip-thrust", resistance_band: "banded-hip-thrust" },
  glute_kickback: { cable: "cable-kickback", machine: "machine-glute-kickback", resistance_band: "banded-kickback", bodyweight: "donkey-kick" },
  hip_abduction: { machine: "hip-abduction-machine", cable: "cable-standing-hip-abduction", resistance_band: "banded-standing-hip-abduction", bodyweight: "side-lying-hip-abduction" },
  hip_adduction: { machine: "hip-adduction-machine", cable: "cable-standing-hip-adduction", resistance_band: "~cable-standing-hip-adduction", bodyweight: "~cable-standing-hip-adduction" },
  romanian_deadlift: { barbell: "romanian-deadlift", dumbbell: "dumbbell-romanian-deadlift", smith: "smith-machine-romanian-deadlift", cable: "~cable-pull-through", resistance_band: "~romanian-deadlift" },
  leg_curl: { machine: "lying-leg-curl", cable: "~lying-leg-curl", resistance_band: "~lying-leg-curl", dumbbell: "~lying-leg-curl" },
  good_morning: { barbell: "good-morning", smith: "~good-morning", resistance_band: "~good-morning", bodyweight: "~good-morning" },
  nordic_curl: { bodyweight: "nordic-hamstring-curl", machine: "~nordic-hamstring-curl", resistance_band: "~nordic-hamstring-curl" },
  standing_calf_raise: { bodyweight: "calf-raise", dumbbell: "~calf-raise", barbell: "~calf-raise", smith: "~standing-calf-raise", machine: "standing-calf-raise" },
  seated_calf_raise: { machine: "seated-calf-raise", dumbbell: "~seated-calf-raise", barbell: "~seated-calf-raise", smith: "~seated-calf-raise" },
  crunch: { bodyweight: "crunch", cable: "cable-crunch", machine: "~crunch", resistance_band: "~cable-crunch" },
  leg_raise: { bodyweight: "lying-leg-raise", cable: "~lying-leg-raise", machine: "captains-chair-knee-raise" },
  plank: { bodyweight: "plank", resistance_band: "~plank" },
  rotation: { cable: "cable-woodchop", resistance_band: "banded-woodchop", machine: "~cable-woodchop", dumbbell: "weighted-russian-twist" },
  anti_rotation: { cable: "pallof-press", resistance_band: "banded-pallof-press" },
  side_bend: { dumbbell: "dumbbell-side-bend", cable: "~dumbbell-side-bend", machine: "~dumbbell-side-bend" },
  deadlift: { barbell: "deadlift", dumbbell: "~dumbbell-sumo-deadlift", smith: "~deadlift", trap_bar: "trap-bar-deadlift" },
  farmer_carry: { dumbbell: "farmer-carry", kettlebell: "~farmer-carry", trap_bar: "~farmer-carry", barbell: "~farmer-carry" }
};

const upstreamManifest = JSON.parse(await readFile(join(upstream, "packages/workout-guide/manifest.json"), "utf8"));
const bySlug = new Map(upstreamManifest.map((entry) => [entry.slug, entry]));
const outputDirectory = "public/exercise-animations";
await rm(outputDirectory, { recursive: true, force: true });

// Compact shape (the catalog ships in the entry chunk): drawings maps slug -> exercise drawn,
// variants maps variant id -> slug, prefixed with "~" for a closest match.
// Upstream frames whose vector trace is broken (dotted, near-invisible); the loop plays the remaining poses.
const unusableFrames = { "pallof-press": [2] };
const frameOverrides = {};
// Vietnamese name of each drawing, shown in the closest-match caption and the image alt text.
const viNames = {
  "dumbbell-bench-press": "Đẩy ngực ngang với tạ đơn",
  "bench-press": "Đẩy ngực ngang với tạ đòn",
  "smith-machine-bench-press": "Đẩy ngực ngang trên máy Smith",
  "machine-chest-press": "Đẩy ngực trên máy",
  "incline-dumbbell-press": "Đẩy ngực trên với tạ đơn",
  "incline-bench-press": "Đẩy ngực trên với tạ đòn",
  "dumbbell-fly": "Ép ngực với tạ đơn",
  "cable-fly": "Ép ngực với cáp",
  "pec-deck": "Ép ngực trên máy",
  "push-up": "Chống đẩy",
  "incline-push-up": "Chống đẩy tay kê cao",
  "chest-dip": "Chống xà kép",
  "assisted-dip": "Chống xà kép có trợ lực",
  "lat-pulldown": "Kéo xô trên máy cáp",
  "banded-lat-pulldown": "Kéo xô với dây kháng lực",
  "pull-up": "Hít xà",
  "assisted-pull-up": "Hít xà có trợ lực",
  "seated-row": "Ngồi kéo cáp ngang",
  "machine-row": "Kéo ngang trên máy",
  "barbell-row": "Gập người kéo tạ đòn",
  "dumbbell-bent-over-row": "Gập người kéo tạ đơn",
  "banded-row": "Kéo ngang với dây kháng lực",
  "one-arm-dumbbell-row": "Kéo tạ đơn một tay",
  "single-arm-cable-row": "Kéo cáp một tay",
  "straight-arm-pulldown": "Kéo cáp tay thẳng",
  "face-pull": "Kéo cáp về mặt",
  "banded-face-pull": "Kéo dây kháng lực về mặt",
  "back-extension": "Duỗi lưng trên ghế",
  "standing-dumbbell-press": "Đứng đẩy vai với tạ đơn",
  "overhead-press": "Đẩy vai với tạ đòn",
  "machine-shoulder-press": "Đẩy vai trên máy",
  "lateral-raise": "Nâng tạ đơn sang ngang",
  "cable-lateral-raise": "Nâng cáp sang ngang",
  "machine-lateral-raise": "Nâng vai ngang trên máy",
  "rear-delt-fly": "Dang tay vai sau với tạ đơn",
  "cable-rear-delt-fly": "Dang tay vai sau với cáp",
  "reverse-pec-deck": "Ép ngược vai sau trên máy",
  "band-pull-apart": "Kéo giãn dây kháng lực",
  "front-raise": "Nâng tạ đơn ra trước",
  "cable-front-raise": "Nâng cáp ra trước",
  "plate-front-raise": "Nâng bánh tạ ra trước",
  "upright-row": "Kéo tạ đòn dọc thân",
  "dumbbell-shrug": "Nhún vai với tạ đơn",
  "shrug": "Nhún vai với tạ đòn",
  "bicep-curl": "Cuốn tay trước với tạ đơn",
  "ez-bar-curl": "Cuốn tay trước với thanh EZ",
  "cable-curl": "Cuốn tay trước với cáp",
  "preacher-curl": "Cuốn tay trước trên ghế tì",
  "hammer-curl": "Cuốn tạ đơn kiểu búa",
  "rope-hammer-curl": "Cuốn cáp dây thừng kiểu búa",
  "reverse-curl": "Cuốn tay nắm sấp",
  "tricep-pushdown": "Đẩy cáp tay sau",
  "dumbbell-overhead-tricep-extension": "Duỗi tay sau qua đầu với tạ đơn",
  "overhead-tricep-extension": "Duỗi tay sau qua đầu với cáp",
  "close-grip-bench-press": "Đẩy tạ đòn tay hẹp",
  "diamond-push-up": "Chống đẩy kim cương",
  "tricep-kickback": "Đá tạ đơn tay sau",
  "bodyweight-squat": "Squat không tạ",
  "squat": "Squat với tạ đòn",
  "goblet-squat": "Squat ôm tạ trước ngực",
  "smith-machine-squat": "Squat trên máy Smith",
  "hack-squat": "Hack squat",
  "banded-squat": "Squat với dây kháng lực",
  "leg-press": "Đạp đùi",
  "split-squat": "Squat chẻ chân",
  "smith-machine-split-squat": "Squat chẻ chân trên máy Smith",
  "forward-lunge": "Chùng chân bước tới",
  "walking-lunge": "Chùng chân bước đi",
  "smith-machine-reverse-lunge": "Chùng chân lùi trên máy Smith",
  "step-up": "Bước lên bục",
  "leg-extension": "Duỗi đùi trên máy",
  "glute-bridge": "Nâng hông nằm sàn",
  "hip-thrust": "Đẩy hông với tạ đòn",
  "dumbbell-hip-thrust": "Đẩy hông với tạ đơn",
  "smith-machine-hip-thrust": "Đẩy hông trên máy Smith",
  "banded-hip-thrust": "Đẩy hông với dây kháng lực",
  "cable-kickback": "Đá mông với cáp",
  "machine-glute-kickback": "Đá mông trên máy",
  "banded-kickback": "Đá mông với dây kháng lực",
  "donkey-kick": "Quỳ đá mông",
  "hip-abduction-machine": "Dạng hông trên máy",
  "cable-standing-hip-abduction": "Đứng dạng hông với cáp",
  "banded-standing-hip-abduction": "Đứng dạng hông với dây kháng lực",
  "side-lying-hip-abduction": "Nằm nghiêng dạng hông",
  "hip-adduction-machine": "Khép hông trên máy",
  "cable-standing-hip-adduction": "Đứng khép hông với cáp",
  "romanian-deadlift": "Romanian deadlift với tạ đòn",
  "dumbbell-romanian-deadlift": "Romanian deadlift với tạ đơn",
  "smith-machine-romanian-deadlift": "Romanian deadlift trên máy Smith",
  "cable-pull-through": "Kéo cáp qua háng",
  "lying-leg-curl": "Nằm cuốn đùi sau",
  "good-morning": "Good morning với tạ đòn",
  "nordic-hamstring-curl": "Nordic curl",
  "calf-raise": "Nhón bắp chân không tạ",
  "standing-calf-raise": "Nhón bắp chân đứng trên máy",
  "seated-calf-raise": "Nhón bắp chân ngồi trên máy",
  "crunch": "Gập bụng",
  "cable-crunch": "Gập bụng với cáp",
  "lying-leg-raise": "Nằm nâng chân",
  "captains-chair-knee-raise": "Nâng gối trên ghế treo",
  "plank": "Plank",
  "cable-woodchop": "Xoay thân chặt cáp",
  "banded-woodchop": "Xoay thân chặt dây kháng lực",
  "weighted-russian-twist": "Russian twist có tạ",
  "pallof-press": "Pallof press với cáp",
  "banded-pallof-press": "Pallof press với dây kháng lực",
  "dumbbell-side-bend": "Nghiêng lườn với tạ đơn",
  "deadlift": "Deadlift với tạ đòn",
  "dumbbell-sumo-deadlift": "Sumo deadlift với tạ đơn",
  "trap-bar-deadlift": "Deadlift với thanh lục giác",
  "farmer-carry": "Xách tạ đi bộ"
};
const drawings = {};
const variantSlugs = {};
for (const [movementId, variants] of Object.entries(mapping)) {
  for (const [equipment, target] of Object.entries(variants)) {
    const slug = target.replace(/^~/, "");
    const entry = bySlug.get(slug);
    if (!entry) throw new Error(`Unknown upstream slug ${slug}`);
    if (entry.frames.length !== 3) throw new Error(`${slug} does not have 3 frames`);
    if (!drawings[slug]) {
      await mkdir(join(outputDirectory, slug), { recursive: true });
      const skipped = unusableFrames[slug] ?? [];
      if (skipped.length) frameOverrides[slug] = entry.frames.map((frame) => frame.index).filter((index) => !skipped.includes(index));
      for (const frame of entry.frames.filter((item) => !skipped.includes(item.index))) {
        await cp(join(upstream, "packages/workout-guide", frame.path), join(outputDirectory, slug, `frame-${frame.index}.svg`));
      }
      if (!viNames[slug]) throw new Error(`Missing Vietnamese name for ${slug}`);
      drawings[slug] = { vi: viNames[slug], en: entry.name };
    }
    variantSlugs[`${movementId}__${equipment}`] = target;
  }
}

await writeFile("content/exercise-animations.json", `${JSON.stringify({
  sourceId: "workout-guide",
  upstreamRepository: "https://github.com/bryllim/workout-guide",
  upstreamCommit,
  frameCount: 3,
  reviewedAt: new Date().toISOString().slice(0, 10),
  frameOverrides,
  drawings,
  variants: variantSlugs
}, null, 2)}\n`);
const targets = Object.values(variantSlugs);
console.log(`${targets.length} variants, ${Object.keys(drawings).length} drawings, ${targets.filter((target) => target.startsWith("~")).length} closest matches`);
