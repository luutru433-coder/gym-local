import { useState } from "react";
import { Card, SectionTitle } from "@gym/ui";
import type { SorenessScore, WorkoutSession } from "@gym/contracts";
import { muscleRecoveryMap } from "@gym/progress";
import { recoveryOverview, sorenessPrompt, type MuscleRecoveryView, type RecoveryStatus as MuscleRecoveryStatus } from "@gym/workouts/autoregulation-plan";
import { updatePastSession } from "../progress/history-actions";
import { MuscleMap } from "../../components/ExerciseAnimation";
import { muscleLabels } from "../../lib/exercise-visuals";
import "./RecoveryMapCard.css";

const statusLabels: Record<MuscleRecoveryStatus, { vi: string; en: string }> = {
  fatigued: { vi: "Đang mỏi", en: "Fatigued" },
  recovering: { vi: "Đang hồi phục", en: "Recovering" },
  ready: { vi: "Sẵn sàng", en: "Ready" }
};
const statusOrder: MuscleRecoveryStatus[] = ["fatigued", "recovering", "ready"];

const sorenessLabels: Array<{ score: SorenessScore; vi: string; en: string }> = [
  { score: 1, vi: "Không đau", en: "Not sore" },
  { score: 2, vi: "Hết sớm", en: "Gone early" },
  { score: 3, vi: "Vừa kịp hết", en: "Gone just in time" },
  { score: 4, vi: "Vẫn còn đau", en: "Still sore" }
];

function waitLabel(item: MuscleRecoveryView, locale: "vi" | "en") {
  if (item.status === "ready") return statusLabels.ready[locale];
  const hours = item.hoursUntilReady;
  const amount = hours >= 24 ? `${Math.round(hours / 24)} ${locale === "vi" ? "ngày" : "d"}` : `${hours} ${locale === "vi" ? "giờ" : "h"}`;
  return locale === "vi" ? `còn ~${amount}` : `~${amount} left`;
}

export function RecoveryMapCard({ locale, sessions }: { locale: "vi" | "en"; sessions: WorkoutSession[] }) {
  const [now] = useState(() => new Date());
  const finished = sessions.filter((session) => session.finishedAt);
  const recovery = recoveryOverview(finished, now);
  const weeklySets = new Map(muscleRecoveryMap(sessions, now).map((item) => [item.muscle, item.weeklySets]));
  const prompt = sorenessPrompt(finished, now);
  const [saveError, setSaveError] = useState(false);
  const rate = async (muscle: MuscleRecoveryView["muscle"], score: SorenessScore) => {
    const session = sessions.find((item) => item.id === prompt?.sessionId);
    if (!session) return;
    const soreness = { ...session.soreness };
    if (soreness[muscle] === score) delete soreness[muscle];
    else soreness[muscle] = score;
    try {
      await updatePastSession({ ...session, soreness });
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };
  const muscles = (status: MuscleRecoveryStatus) => recovery.filter((item) => item.status === status).map((item) => item.muscle);
  const sorted = [...recovery].sort((left, right) => statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) || left.recovery - right.recovery);
  const summary = statusOrder
    .map((status) => `${statusLabels[status][locale]}: ${muscles(status).map((muscle) => muscleLabels[muscle][locale]).join(", ") || (locale === "vi" ? "không có" : "none")}`)
    .join("; ");

  return (
    <section className="recovery-map">
      <SectionTitle eyebrow={locale === "vi" ? "Phục hồi" : "Recovery"} title={locale === "vi" ? "Bản đồ phục hồi cơ" : "Muscle recovery map"} />
      <Card className="recovery-map__card">
        <div className="recovery-map__figure">
          <MuscleMap primaryMuscles={muscles("fatigued")} secondaryMuscles={muscles("recovering")} title={summary} />
          <ul className="recovery-map__legend" aria-hidden="true">
            {statusOrder.map((status) => <li key={status}><i className={`recovery-map__dot recovery-map__dot--${status}`} />{statusLabels[status][locale]}</li>)}
          </ul>
        </div>
        <ul className="recovery-map__list">
          {sorted.map((item) => (
            <li key={item.muscle} className={`recovery-map__row recovery-map__row--${item.status}`}>
              <i className={`recovery-map__dot recovery-map__dot--${item.status}`} aria-hidden="true" />
              <strong>{muscleLabels[item.muscle][locale]}</strong>
              <span>{waitLabel(item, locale)}</span>
              <small>{weeklySets.get(item.muscle) ?? 0} {locale === "vi" ? "set/tuần" : "sets/wk"}</small>
            </li>
          ))}
        </ul>
        <p className="fine-print recovery-map__note">{locale === "vi"
          ? "Ước tính từ các set chính 10 ngày qua: set càng sát giới hạn càng mỏi, cơ phụ tính một nửa, độ mỏi giảm dần theo giờ. Câu trả lời đau cơ của bạn chỉnh tốc độ hồi phục của từng nhóm cơ. Chỉ để tham khảo, hãy nghe cơ thể."
          : "Estimated from the working sets of the last 10 days: sets closer to failure cost more, secondary muscles count half, and fatigue fades by the hour. Your soreness answers tune how fast each muscle recovers. A guide only; listen to your body."}</p>
        {prompt ? (
          <div className="recovery-map__soreness">
            <strong>{locale === "vi" ? "Sau buổi tập gần nhất, cơ có đau không?" : "After your last workout, how sore did these get?"}</strong>
            <small>{new Date(prompt.finishedAt).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-GB", { weekday: "long", day: "numeric", month: "numeric" })} · {locale === "vi" ? "Vẫn còn đau: lần sau cơ đó được tính hồi phục chậm hơn 10%. Không đau: nhanh hơn 5%." : "Still sore: that muscle is given 10% longer to recover next time. Not sore: 5% less."}</small>
            {prompt.muscles.map((muscle) => (
              <div className="recovery-map__soreness-row" role="group" aria-label={muscleLabels[muscle][locale]} key={muscle}>
                <span>{muscleLabels[muscle][locale]}</span>
                <div>
                  {sorenessLabels.map((option) => (
                    <button type="button" key={option.score} aria-pressed={prompt.answers[muscle] === option.score} onClick={() => void rate(muscle, option.score)}>{option[locale]}</button>
                  ))}
                </div>
              </div>
            ))}
            {saveError ? <p role="alert" className="fine-print">{locale === "vi" ? "Chưa lưu được câu trả lời. Hãy thử lại." : "Could not save your answer. Try again."}</p> : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
