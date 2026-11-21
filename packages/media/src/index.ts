import type { ContentSource, ExerciseAnimation, ExerciseVariant, ExerciseVideoGuide, MediaAsset } from "@gym/contracts";

export interface MediaAuditIssue {
  code:
    | "missing_offline_fallback"
    | "invalid_media_url"
    | "invalid_video_guide"
    | "invalid_source"
    | "missing_video_guide"
    | "multiple_video_guides"
    | "stale_video_review"
    | "missing_animation"
    | "invalid_animation";
  variantId?: string;
  sourceId?: string;
  message: string;
}

export interface MediaCatalogAudit {
  reviewedVariantCount: number;
  directVideoCount: number;
  imageCount: number;
  oldestVerificationAgeDays: number;
  issues: MediaAuditIssue[];
}

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
    const watchMatchesId = watchUrl.hostname === "youtu.be"
      ? watchUrl.pathname === `/${guide.videoId}`
      : watchUrl.pathname === "/watch" && watchUrl.searchParams.get("v") === guide.videoId;
    return watchUrl.protocol === "https:"
      && ["youtube.com", "www.youtube.com", "youtu.be"].includes(watchUrl.hostname)
      && watchMatchesId
      && thumbnailUrl.protocol === "https:"
      && ["i.ytimg.com", "img.youtube.com"].includes(thumbnailUrl.hostname)
      && thumbnailUrl.pathname.startsWith(`/vi/${guide.videoId}/`);
  } catch {
    return false;
  }
}

function sourceIsTraceable(source: ContentSource): boolean {
  if (!source.id || !source.label || !source.author || !source.licenseId || !source.attribution) return false;
  if (Number.isNaN(Date.parse(source.reviewedAt))) return false;
  if (source.sourcePath) return !source.sourceUrl && !source.licenseUrl;
  try {
    return new URL(source.sourceUrl ?? "").protocol === "https:"
      && new URL(source.licenseUrl ?? "").protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Audits the catalog without fetching rich media. Link availability is a
 * separate online release check so core verification stays deterministic.
 */
export function auditExerciseMedia(
  variants: readonly ExerciseVariant[],
  sources: readonly ContentSource[],
  options: { asOf?: Date; maximumVerificationAgeDays?: number } = {}
): MediaCatalogAudit {
  const asOf = options.asOf ?? new Date();
  const maximumAge = options.maximumVerificationAgeDays ?? 180;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const issues: MediaAuditIssue[] = [];
  let directVideoCount = 0;
  let imageCount = 0;
  let oldestVerificationAgeDays = 0;

  for (const source of sources) {
    if (!sourceIsTraceable(source)) {
      issues.push({ code: "invalid_source", sourceId: source.id, message: "Source attribution or license metadata is incomplete" });
    }
  }

  const reviewed = variants.filter((variant) => variant.reviewStatus === "reviewed");
  for (const variant of reviewed) {
    if (![variant.instructions, variant.cues, variant.commonMistakes, variant.safety].every((items) => items.length > 0)) {
      issues.push({ code: "missing_offline_fallback", variantId: variant.id, message: "Reviewed variant needs setup, cues, mistakes, and safety text offline" });
    }

    if (variant.videoGuides.length === 0) {
      issues.push({ code: "missing_video_guide", variantId: variant.id, message: "Reviewed variant has no direct instructional video" });
    } else if (variant.videoGuides.length > 1) {
      issues.push({ code: "multiple_video_guides", variantId: variant.id, message: "Reviewed variant must have exactly one primary video" });
    }

    for (const sourceId of variant.sourceIds) {
      if (!sourceById.has(sourceId)) {
        issues.push({ code: "invalid_source", variantId: variant.id, sourceId, message: "Variant references an unknown source" });
      }
    }

    for (const asset of variant.media) {
      if (asset.type === "image") imageCount += 1;
      if (!isSafeMediaUrl(asset) || !sourceById.has(asset.sourceId) || !asset.onlineOnly) {
        issues.push({ code: "invalid_media_url", variantId: variant.id, sourceId: asset.sourceId, message: "Media must be online-only, allowlisted, and source-traceable" });
      }
    }

    for (const guide of variant.videoGuides) {
      directVideoCount += 1;
      if (
        !isSafeVideoGuide(guide)
        || guide.variantId !== variant.id
        || guide.reviewStatus !== "reviewed"
        || !guide.onlineOnly
        || !guide.creator.trim()
        || !guide.title.vi.trim()
        || !guide.title.en.trim()
        || !sourceById.has(guide.sourceId)
        || guide.reviewMethod !== "title-and-equipment-match"
        || Number.isNaN(Date.parse(guide.reviewedAt))
      ) {
        issues.push({ code: "invalid_video_guide", variantId: variant.id, sourceId: guide.sourceId, message: "Direct video metadata or attribution is invalid" });
      }

      const verifiedAt = Date.parse(guide.lastVerifiedAt);
      const ageDays = Number.isFinite(verifiedAt) ? Math.max(0, Math.floor((asOf.getTime() - verifiedAt) / 86_400_000)) : Number.POSITIVE_INFINITY;
      oldestVerificationAgeDays = Math.max(oldestVerificationAgeDays, ageDays);
      if (!Number.isFinite(ageDays) || ageDays > maximumAge) {
        issues.push({ code: "stale_video_review", variantId: variant.id, message: `Video verification is older than ${maximumAge} days` });
      }
    }
  }

  return { reviewedVariantCount: reviewed.length, directVideoCount, imageCount, oldestVerificationAgeDays, issues };
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

const bundledAnimationFrame = /^exercise-animations\/[a-z0-9-]+\/frame-[1-9]\.svg$/;

/**
 * Bundled animations are the offline illustration for every reviewed variant:
 * local same-origin frames only, never a remote URL, with a traceable source.
 */
export function auditExerciseAnimations(
  variants: ExerciseVariant[],
  animations: ExerciseAnimation[],
  sources: ContentSource[]
): MediaAuditIssue[] {
  const issues: MediaAuditIssue[] = [];
  const byVariant = new Map(animations.map((animation) => [animation.variantId, animation]));
  const sourceIds = new Set(sources.map((source) => source.id));
  for (const variant of variants.filter((item) => item.reviewStatus === "reviewed")) {
    const animation = byVariant.get(variant.id);
    if (!animation) {
      issues.push({ code: "missing_animation", variantId: variant.id, message: "Reviewed variant has no bundled animation" });
      continue;
    }
    const valid = animation.frames.length >= 2
      && animation.frames.every((frame) => bundledAnimationFrame.test(frame))
      && animation.onlineOnly === false
      && animation.frameDurationMs >= 200
      && Boolean(animation.shownExercise.vi && animation.shownExercise.en)
      && sourceIds.has(animation.sourceId);
    if (!valid) issues.push({ code: "invalid_animation", variantId: variant.id, sourceId: animation.sourceId, message: "Animation must use bundled local frames from a declared source" });
  }
  return issues;
}
