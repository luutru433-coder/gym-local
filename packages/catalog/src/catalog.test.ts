import { describe, expect, it } from "vitest";
import { CONTENT_SOURCES, EXERCISE_VARIANTS, MOVEMENTS, getVariantsForMovement, rankVariantsForEquipment } from "./index";

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
  });
});
