import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTENT_SOURCES,
  EXERCISE_ANIMATIONS,
  EXERCISE_TRACKING_PROFILES,
  EXERCISE_VARIANTS,
  MOVEMENTS,
  getExerciseAnimation,
  getMovementAnimation,
  getTrackingProfile,
  getVariantsForMovement,
  rankVariantsForEquipment,
  searchCatalog
} from "./index";
import { TECHNIQUE_GROUPS, blendPose, loadExerciseTechnique, measureAngle, resolvePose, shownAngle } from "./technique";
import { EXERCISE_TECHNIQUES } from "./technique/records";
import type { TechniqueFigure, TechniqueMark } from "@gym/contracts";

describe("exercise catalog", () => {
  it("ships the agreed core breadth", () => {
    expect(MOVEMENTS.length).toBeGreaterThanOrEqual(50);
    expect(EXERCISE_VARIANTS.length).toBeGreaterThanOrEqual(180);
  });

  it("bundles an offline animation for every reviewed variant", () => {
    const reviewed = EXERCISE_VARIANTS.filter((variant) => variant.reviewStatus === "reviewed");
    expect(EXERCISE_ANIMATIONS).toHaveLength(reviewed.length);
    for (const variant of reviewed) {
      const animation = getExerciseAnimation(variant.id);
      expect(animation, variant.id).toBeDefined();
      expect(animation?.frames.length).toBeGreaterThanOrEqual(2);
      expect(animation?.onlineOnly).toBe(false);
      for (const frame of animation?.frames ?? []) {
        expect(["public", "../../public"].some((base) => existsSync(resolve(base, frame))), frame).toBe(true);
      }
    }
    expect(MOVEMENTS.every((movement) => getMovementAnimation(movement.id))).toBe(true);
    expect(getExerciseAnimation("chest_press__barbell")).toMatchObject({ match: "exact", frames: { length: 3 } });
    expect(CONTENT_SOURCES.some((source) => source.id === "workout-guide" && source.licenseId === "cc-by-sa-4.0")).toBe(true);
  });

  it("contains the required chest press equipment alternatives", () => {
    const variants = getVariantsForMovement("chest_press");
    const equipment = variants.flatMap((variant) => variant.equipment);
    expect(equipment).toEqual(expect.arrayContaining(["machine", "cable", "dumbbell", "smith"]));
    expect(EXERCISE_VARIANTS.every((variant) => variant.media.length === 0)).toBe(true);
    expect(CONTENT_SOURCES.every((source) => source.sourcePath || source.sourceUrl?.startsWith("https://"))).toBe(true);
  });

  it("ships a direct reviewed video for every reviewed equipment variant", () => {
    const reviewed = EXERCISE_VARIANTS.filter((variant) => variant.reviewStatus === "reviewed");
    expect(reviewed).toHaveLength(EXERCISE_VARIANTS.length);
    expect(reviewed.every((variant) => variant.videoGuides.length >= 1)).toBe(true);
    expect(reviewed.flatMap((variant) => variant.videoGuides)).toHaveLength(reviewed.length);
    expect(reviewed.every((variant) => variant.videoGuides.every((guide) =>
      guide.variantId === variant.id
      && /^[A-Za-z0-9_-]{11}$/.test(guide.videoId)
      && guide.watchUrl === `https://www.youtube.com/watch?v=${guide.videoId}`
      && !guide.watchUrl.includes("/results")
      && guide.reviewStatus === "reviewed"
    ))).toBe(true);
    expect(CONTENT_SOURCES.some((source) => source.id === "youtube-video-guides" && source.licenseId === "provider-terms")).toBe(true);
  });

  it("ranks variants available at the active gym first", () => {
    const ranked = rankVariantsForEquipment("chest_press", ["cable", "dumbbell", "bench"]);
    expect(ranked.slice(0, 2).map((variant) => variant.id)).toEqual(expect.arrayContaining([
      "chest_press__cable",
      "chest_press__dumbbell"
    ]));
  });

  it("uses distance/duration logging for loaded carries", () => {
    expect(EXERCISE_VARIANTS.find((variant) => variant.id === "farmer_carry__dumbbell")?.loadEntryMode).toBe("duration_distance");
    expect(getTrackingProfile("farmer_carry__dumbbell")?.effortKind).toBe("distance_duration");
  });

  it("reviews assisted, timed, and per-hand tracking semantics explicitly", () => {
    const assistedPullUp = EXERCISE_VARIANTS.find((variant) => variant.id === "pull_up__machine");
    expect(assistedPullUp).toMatchObject({ loadEntryMode: "assisted", equipment: ["machine"] });
    expect(getTrackingProfile("pull_up__machine")).toMatchObject({
      loadEntryMode: "assisted",
      progressDirection: "lower_assistance",
      volumeMetric: "none",
      e1rmMetric: "none"
    });
    expect(getTrackingProfile("plank__bodyweight")).toMatchObject({ effortKind: "duration", volumeMetric: "none" });
    expect(getTrackingProfile("chest_press__dumbbell")).toMatchObject({
      laterality: "bilateral",
      volumeMetric: "external_load",
      volumeMultiplier: 2
    });
    expect(getTrackingProfile("one_arm_row__dumbbell")).toMatchObject({
      laterality: "unilateral",
      volumeMetric: "none"
    });
    expect(EXERCISE_VARIANTS.find((variant) => variant.id === "chest_press__cable")?.equipment).toEqual(["cable"]);
    expect(EXERCISE_VARIANTS.find((variant) => variant.id === "deadlift__barbell")?.difficulty).toBe("intermediate");
    expect(EXERCISE_VARIANTS.find((variant) => variant.id === "nordic_curl__bodyweight")?.difficulty).toBe("advanced");
    expect(new Set(EXERCISE_VARIANTS.map((variant) => variant.difficulty))).toEqual(new Set(["beginner", "intermediate", "advanced"]));
  });

  it("defines exactly one immutable tracking profile for every variant", () => {
    expect(EXERCISE_TRACKING_PROFILES).toHaveLength(EXERCISE_VARIANTS.length);
    expect(new Set(EXERCISE_TRACKING_PROFILES.map((profile) => profile.variantId)).size).toBe(EXERCISE_VARIANTS.length);
    expect(EXERCISE_VARIANTS.every((variant) => getTrackingProfile(variant.id)?.variantId === variant.id)).toBe(true);
  });

  it("matches Vietnamese search queries with or without diacritics", () => {
    const ids = (query: string) => searchCatalog(query).map((movement) => movement.id);
    expect(ids("Kéo xà")).toContain("pull_up");
    expect(ids("keo xa")).toEqual(ids("Kéo xà"));
    expect(ids("KEO XA")).toEqual(ids("Kéo xà"));
    expect(ids("keo")).toEqual(ids("kéo"));
    expect(ids("day nguc")).toContain("chest_press");
    expect(ids("  pull-up ")).toContain("pull_up");
  });
});

describe("exercise technique figures", () => {
  const variantIds = new Set(EXERCISE_VARIANTS.map((variant) => variant.id));
  const figuresOf = (technique: (typeof EXERCISE_TECHNIQUES)[number]): [TechniqueFigure, TechniqueMark[]][] => [
    [technique.setup.figure, technique.setup.cues],
    ...technique.phases.map((phase): [TechniqueFigure, TechniqueMark[]] => [phase.figure, phase.cues]),
    ...technique.mistakes.flatMap((mistake): [TechniqueFigure, TechniqueMark[]][] => [
      [mistake.wrong, mistake.mark ? [mistake.mark] : []],
      [mistake.right, mistake.mark ? [mistake.mark] : []]
    ])
  ];

  it("covers the 30 main movements and only existing variants, each once", async () => {
    expect(new Set(EXERCISE_TECHNIQUES.map((technique) => technique.movementId)).size).toBeGreaterThanOrEqual(30);
    const keys = EXERCISE_TECHNIQUES.flatMap((technique) => technique.equipment.map((equipment) => `${technique.movementId}__${equipment}`));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(variantIds.has(key), key).toBe(true);
    expect(Object.keys(TECHNIQUE_GROUPS).sort()).toEqual([...new Set(EXERCISE_TECHNIQUES.map((technique) => technique.movementId))].sort());
    for (const key of keys) expect((await loadExerciseTechnique(key))?.movementId, key).toBe(key.split("__")[0]);
    expect(await loadExerciseTechnique("chest_press__cable")).toBeUndefined();
    expect(await loadExerciseTechnique("custom-123")).toBeUndefined();
  });

  it("gives every technique bilingual setup, phase and wrong-versus-right content with a source", () => {
    const sourceIds = new Set(CONTENT_SOURCES.map((source) => source.id));
    for (const technique of EXERCISE_TECHNIQUES) {
      const id = `${technique.movementId}/${technique.equipment[0]}`;
      expect(sourceIds.has(technique.sourceId), id).toBe(true);
      expect(technique.setup.cues.length, id).toBeGreaterThanOrEqual(3);
      expect(technique.phases.length, id).toBeGreaterThanOrEqual(1);
      expect(technique.mistakes.length, id).toBeGreaterThanOrEqual(2);
      const texts = [
        technique.setup.title,
        ...technique.setup.cues.map((cue) => cue.text),
        ...technique.phases.flatMap((phase) => [phase.title, ...phase.cues.map((cue) => cue.text)]),
        ...technique.mistakes.flatMap((mistake) => [mistake.title, mistake.fix])
      ];
      for (const text of texts) {
        expect(text.vi.trim().length, id).toBeGreaterThan(0);
        expect(text.en.trim().length, id).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every pose and every mark to finite joint positions", () => {
    for (const technique of EXERCISE_TECHNIQUES) {
      for (const [figure, marks] of figuresOf(technique)) {
        expect(figure.poses.length).toBeGreaterThanOrEqual(1);
        const joints = figure.poses.map((pose) => resolvePose(pose, figure.view));
        for (const resolved of joints) {
          for (const point of Object.values(resolved)) expect(point.every(Number.isFinite), technique.movementId).toBe(true);
        }
        const last = joints[joints.length - 1];
        for (const mark of marks) {
          if (mark.at) expect(last[mark.at], `${technique.movementId} ${mark.at}`).toBeDefined();
          if (mark.angle) {
            expect(last[mark.angle[1]], `${technique.movementId} ${mark.angle[1]}`).toBeDefined();
            expect(Number.isFinite(measureAngle(last, mark.angle)), `${technique.movementId} ${mark.angle.join("-")}`).toBe(true);
          }
        }
      }
    }
  });

  it("shows a wrong pose that differs from the right one", () => {
    for (const technique of EXERCISE_TECHNIQUES) {
      for (const mistake of technique.mistakes) {
        expect(JSON.stringify(mistake.wrong), `${technique.movementId}: ${mistake.title.en}`).not.toBe(JSON.stringify(mistake.right));
      }
    }
  });

  it("measures angles from the pose instead of storing them", () => {
    const straight = resolvePose({ hip: [100, 100], torso: 90, arm: [-90, -90], leg: [-90, -90] }, "side");
    const bent = resolvePose({ hip: [100, 100], torso: 90, arm: [-90, 0], leg: [0, -90] }, "side");
    expect(shownAngle(measureAngle(straight, ["shoulder", "elbow", "wrist"]))).toBe(180);
    expect(shownAngle(measureAngle(bent, ["shoulder", "elbow", "wrist"]))).toBe(90);
    expect(shownAngle(measureAngle(bent, ["hip", "knee", "ankle"]))).toBe(90);
    const halfway = resolvePose(blendPose({ hip: [100, 100], torso: 90, arm: [-90, -90], leg: [-90, -90] }, { hip: [100, 100], torso: 90, arm: [-90, 0], leg: [0, -90] }, 0.5), "side");
    expect(shownAngle(measureAngle(halfway, ["shoulder", "elbow", "wrist"]))).toBe(135);
    expect(shownAngle(92.4)).toBe(90);
  });
});
