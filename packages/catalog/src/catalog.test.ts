import { describe, expect, it } from "vitest";
import {
  CONTENT_SOURCES,
  EXERCISE_TRACKING_PROFILES,
  EXERCISE_VARIANTS,
  MOVEMENTS,
  getTrackingProfile,
  getVariantsForMovement,
  rankVariantsForEquipment,
  searchCatalog
} from "./index";

describe("exercise catalog", () => {
  it("ships the agreed core breadth", () => {
    expect(MOVEMENTS.length).toBeGreaterThanOrEqual(50);
    expect(EXERCISE_VARIANTS.length).toBeGreaterThanOrEqual(180);
  });

  it("contains the required chest press equipment alternatives", () => {
    const variants = getVariantsForMovement("chest_press");
    const equipment = variants.flatMap((variant) => variant.equipment);
    expect(equipment).toEqual(expect.arrayContaining(["machine", "cable", "dumbbell", "smith"]));
    expect(variants.filter((variant) => variant.media.some((media) => media.type === "image"))).toHaveLength(5);
    expect(CONTENT_SOURCES.some((source) => source.id === "free-exercise-db" && source.licenseId === "unlicense")).toBe(true);
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
