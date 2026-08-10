import type { ExerciseVideoGuide, MediaAsset } from "@gym/contracts";

export function isSafeMediaUrl(asset: MediaAsset): boolean {
  try {
    const url = new URL(asset.url);
    if (url.protocol !== "https:") return false;
    if (asset.type === "youtube") {
      return ["youtube.com", "www.youtube.com", "youtu.be", "www.youtube-nocookie.com"].includes(url.hostname)
        && url.pathname !== "/results";
    }
    if (asset.type === "image") return ["raw.githubusercontent.com", "upload.wikimedia.org", "commons.wikimedia.org"].includes(url.hostname);
    if (asset.type === "model3d") return ["sketchfab.com", "www.sketchfab.com"].includes(url.hostname);
    return false;
  } catch {
    return false;
  }
}

export function isSafeVideoGuide(guide: ExerciseVideoGuide): boolean {
  if (guide.provider !== "youtube" || !/^[A-Za-z0-9_-]{11}$/.test(guide.videoId)) return false;
  try {
    const watchUrl = new URL(guide.watchUrl);
    const thumbnailUrl = new URL(guide.thumbnailUrl);
    return watchUrl.protocol === "https:"
      && ["youtube.com", "www.youtube.com", "youtu.be"].includes(watchUrl.hostname)
      && watchUrl.pathname !== "/results"
      && thumbnailUrl.protocol === "https:"
      && ["i.ytimg.com", "img.youtube.com"].includes(thumbnailUrl.hostname);
  } catch {
    return false;
  }
}

export function youtubeEmbedUrl(guide: ExerciseVideoGuide): string {
  if (!isSafeVideoGuide(guide)) throw new Error("Unsafe exercise video guide");
  const params = new URLSearchParams({ playsinline: "1", rel: "0", modestbranding: "1" });
  return `https://www.youtube-nocookie.com/embed/${guide.videoId}?${params}`;
}

export function openExternalVideoGuide(guide: ExerciseVideoGuide): void {
  if (!isSafeVideoGuide(guide)) throw new Error("Unsafe exercise video guide");
  window.open(guide.watchUrl, "_blank", "noopener,noreferrer");
}

export function openExternalMedia(asset: MediaAsset): void {
  if (!isSafeMediaUrl(asset)) throw new Error("Unsafe media URL");
  window.open(asset.url, "_blank", "noopener,noreferrer");
}

export function mediaFallback(locale: "vi" | "en") {
  return locale === "vi"
    ? "Media cần Internet. Hãy dùng hướng dẫn chữ và các cue kỹ thuật ở trên."
    : "Media needs an Internet connection. Use the written steps and form cues above.";
}
