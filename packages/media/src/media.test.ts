import { describe, expect, it } from "vitest";
import { CONTENT_SOURCES, EXERCISE_VARIANTS } from "@gym/catalog";
import type { ExerciseVariant, ExerciseVideoGuide, MediaAsset } from "@gym/contracts";
import { auditExerciseMedia, isSafeMediaUrl, isSafeVideoGuide, youtubeEmbedUrl } from "./index";

function asset(type: MediaAsset["type"], url: string): MediaAsset {
  return { id: "test", type, url, sourceId: "source", title: { vi: "Test", en: "Test" }, onlineOnly: true, reviewStatus: "reviewed" };
}

describe("media allowlist", () => {
  it("accepts declared exercise images and YouTube links", () => {
    expect(isSafeMediaUrl(asset("image", "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Plank/0.jpg"))).toBe(true);
    expect(isSafeMediaUrl(asset("youtube", "https://www.youtube.com/watch?v=A2b2EmIg0dA"))).toBe(true);
    expect(isSafeMediaUrl(asset("youtube", "https://www.youtube.com/results?search_query=plank"))).toBe(false);
  });

  it("rejects insecure or unknown hosts", () => {
    expect(isSafeMediaUrl(asset("image", "http://raw.githubusercontent.com/example/image.jpg"))).toBe(false);
    expect(isSafeMediaUrl(asset("image", "https://example.com/image.jpg"))).toBe(false);
  });

  it("rejects a guide whose direct URLs do not match its reviewed video ID", () => {
    const guide = structuredClone(EXERCISE_VARIANTS[0].videoGuides[0]);
    guide.watchUrl = "https://www.youtube.com/watch?v=AAAAAAAAAAA";
    expect(isSafeVideoGuide(guide)).toBe(false);
  });

  it("builds privacy-enhanced embeds only for direct reviewed guides", () => {
    const guide: ExerciseVideoGuide = {
      id: "video_plank",
      variantId: "plank__bodyweight",
      provider: "youtube",
      demonstrationType: "human",
      videoId: "A2b2EmIg0dA",
      watchUrl: "https://www.youtube.com/watch?v=A2b2EmIg0dA",
      thumbnailUrl: "https://i.ytimg.com/vi/A2b2EmIg0dA/hqdefault.jpg",
      sourceId: "youtube-video-guides",
      title: { vi: "Plank", en: "Plank" },
      creator: "E3 Rehab",
      onlineOnly: true,
      reviewStatus: "reviewed",
      reviewMethod: "title-and-equipment-match",
      reviewedAt: "2026-08-10",
      lastVerifiedAt: "2026-08-10"
    };
    expect(isSafeVideoGuide(guide)).toBe(true);
    expect(youtubeEmbedUrl(guide)).toContain("https://www.youtube-nocookie.com/embed/A2b2EmIg0dA");
  });

  it("audits complete direct-video coverage, attribution, and offline fallbacks", () => {
    const report = auditExerciseMedia(EXERCISE_VARIANTS, CONTENT_SOURCES, { asOf: new Date("2026-08-13T00:00:00Z") });
    expect(report).toMatchObject({
      reviewedVariantCount: EXERCISE_VARIANTS.length,
      directVideoCount: EXERCISE_VARIANTS.length,
      issues: []
    });
    expect(report.oldestVerificationAgeDays).toBeLessThanOrEqual(3);
  });

  it("reports missing offline guidance and stale or unsafe videos", () => {
    const broken = structuredClone(EXERCISE_VARIANTS[0]) as ExerciseVariant;
    broken.instructions = [];
    broken.videoGuides[0].watchUrl = "http://example.com/watch";
    broken.videoGuides[0].lastVerifiedAt = "2025-01-01";

    const report = auditExerciseMedia([broken], CONTENT_SOURCES, { asOf: new Date("2026-08-13T00:00:00Z"), maximumVerificationAgeDays: 180 });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "missing_offline_fallback",
      "invalid_video_guide",
      "stale_video_review"
    ]));
  });
});
