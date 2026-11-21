import type { SessionRecordKind } from "@gym/progress";

const recordKindLabels: Record<SessionRecordKind, { vi: string; en: string }> = {
  e1rm: { vi: "1RM ước tính", en: "Estimated 1RM" },
  load: { vi: "Mức tạ nặng nhất", en: "Heaviest load" },
  assistance: { vi: "Trợ lực thấp nhất", en: "Least assistance" }
};

export function recordKindsLabel(kinds: SessionRecordKind[], locale: "vi" | "en"): string {
  return kinds.map((kind) => recordKindLabels[kind][locale]).join(" · ");
}
