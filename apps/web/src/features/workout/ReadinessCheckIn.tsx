import { useState } from "react";
import type { ReadinessCheckIn, WarmupFeel } from "@gym/contracts";

type Locale = "vi" | "en";

const questions: Array<{ key: keyof ReadinessCheckIn; vi: string; en: string; low: { vi: string; en: string }; high: { vi: string; en: string } }> = [
  { key: "sleep", vi: "Giấc ngủ đêm qua", en: "Last night's sleep", low: { vi: "rất kém", en: "very poor" }, high: { vi: "rất tốt", en: "very good" } },
  { key: "energy", vi: "Năng lượng lúc này", en: "Energy right now", low: { vi: "kiệt sức", en: "drained" }, high: { vi: "sung sức", en: "full" } },
  { key: "soreness", vi: "Đau mỏi cơ", en: "Muscle soreness", low: { vi: "rất đau", en: "very sore" }, high: { vi: "không đau", en: "none" } }
];

const NORMAL: ReadinessCheckIn = { sleep: 3, energy: 3, soreness: 3 };

/** Percent the answers move today's estimated strength, as the engine applies it (1.5% per point of the mean away from 3). */
function effectPercent(value: ReadinessCheckIn): number {
  return Math.round(((value.sleep + value.energy + value.soreness) / 3 - 3) * 1.5 * 10) / 10;
}

export function ReadinessCheckInCard({ locale, value, onChange }: { locale: Locale; value?: ReadinessCheckIn; onChange: (value: ReadinessCheckIn | undefined) => void }) {
  const vi = locale === "vi";
  const [skipped, setSkipped] = useState(false);
  const [draft, setDraft] = useState<ReadinessCheckIn>();
  const editing = draft ?? (value || skipped ? undefined : NORMAL);

  if (!editing) {
    const effect = value ? effectPercent(value) : 0;
    return (
      <div className="readiness-summary">
        <span>{value
          ? `${vi ? "Hôm nay" : "Today"}: ${vi ? "ngủ" : "sleep"} ${value.sleep}/5 · ${vi ? "năng lượng" : "energy"} ${value.energy}/5 · ${vi ? "cơ hết mỏi" : "muscles fresh"} ${value.soreness}/5 · ${vi ? "gợi ý tạ" : "suggested loads"} ${effect > 0 ? "+" : ""}${effect}%`
          : (vi ? "Chưa trả lời câu hỏi đầu buổi." : "Pre-workout check-in skipped.")}</span>
        <button type="button" onClick={() => setDraft(value ?? NORMAL)}>{value ? (vi ? "Sửa" : "Edit") : (vi ? "Trả lời" : "Answer")}</button>
      </div>
    );
  }

  return (
    <section className="readiness-card" aria-label={vi ? "Câu hỏi đầu buổi" : "Pre-workout check-in"}>
      <header>
        <strong>{vi ? "Hôm nay bạn thế nào?" : "How are you today?"}</strong>
        <small>{vi ? "3 là ngày bình thường. Câu trả lời chỉnh gợi ý tạ của buổi này tối đa 3%." : "3 is a normal day. Your answers move this workout's suggested loads by at most 3%."}</small>
      </header>
      {questions.map((question) => (
        <div className="readiness-card__row" role="group" aria-label={question[locale]} key={question.key}>
          <span>{question[locale]}<small>1 {question.low[locale]} · 5 {question.high[locale]}</small></span>
          <div>
            {[1, 2, 3, 4, 5].map((score) => (
              <button type="button" key={score} aria-pressed={editing[question.key] === score} aria-label={`${question[locale]}: ${score}`} onClick={() => setDraft({ ...editing, [question.key]: score })}>{score}</button>
            ))}
          </div>
        </div>
      ))}
      <footer>
        <button type="button" className="readiness-card__save" onClick={() => { onChange(editing); setDraft(undefined); }}>{vi ? "Lưu" : "Save"}</button>
        <button type="button" onClick={() => { if (value) onChange(undefined); setDraft(undefined); setSkipped(true); }}>{value ? (vi ? "Xoá câu trả lời" : "Clear answers") : (vi ? "Bỏ qua" : "Skip")}</button>
      </footer>
    </section>
  );
}

const feelLabels: Record<WarmupFeel, { vi: string; en: string }> = {
  worse: { vi: "Nặng hơn", en: "Heavier" },
  expected: { vi: "Như thường", en: "As usual" },
  better: { vi: "Nhẹ hơn", en: "Lighter" }
};

export function WarmupFeelPicker({ locale, value, onChange }: { locale: Locale; value?: WarmupFeel; onChange: (value: WarmupFeel | undefined) => void }) {
  const vi = locale === "vi";
  return (
    <div className="warmup-feel" role="group" aria-label={vi ? "Cảm giác khởi động" : "Warm-up feel"}>
      <span>{vi ? "Khởi động hôm nay thấy" : "Today's warm-up felt"}<small>{vi ? "Nhẹ hơn: gợi ý tạ +1,3%. Nặng hơn: −2,6%." : "Lighter: suggested loads +1.3%. Heavier: −2.6%."}</small></span>
      <div>
        {(["worse", "expected", "better"] as const).map((feel) => (
          <button type="button" key={feel} aria-pressed={value === feel} onClick={() => onChange(value === feel ? undefined : feel)}>{feelLabels[feel][locale]}</button>
        ))}
      </div>
    </div>
  );
}
