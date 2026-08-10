import { describe, expect, it } from "vitest";
import type { ExerciseVideoGuide, MediaAsset } from "@gym/contracts";
import { isSafeMediaUrl, isSafeVideoGuide, youtubeEmbedUrl } from "./index";

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
});
