import { useState } from "react";
import { Card, SectionTitle } from "@gym/ui";
import type { WorkoutSession } from "@gym/contracts";
import { muscleRecoveryMap, type MuscleRecovery, type MuscleRecoveryStatus } from "@gym/progress";
import { MuscleMap } from "../../components/ExerciseAnimation";
import { muscleLabels } from "../../lib/exercise-visuals";
import "./RecoveryMapCard.css";

const statusLabels: Record<MuscleRecoveryStatus, { vi: string; en: string }> = {
  fatigued: { vi: "Đang mỏi", en: "Fatigued" },
  recovering: { vi: "Đang hồi phục", en: "Recovering" },
  ready: { vi: "Sẵn sàng", en: "Ready" }
};
const statusOrder: MuscleRecoveryStatus[] = ["fatigued", "recovering", "ready"];

function waitLabel(item: MuscleRecovery, locale: "vi" | "en") {
  if (item.status === "ready") return statusLabels.ready[locale];
  const hours = item.hoursUntilReady;
  const amount = hours >= 24 ? `${Math.round(hours / 24)} ${locale === "vi" ? "ngày" : "d"}` : `${hours} ${locale === "vi" ? "giờ" : "h"}`;
  return locale === "vi" ? `còn ~${amount}` : `~${amount} left`;
}

export function RecoveryMapCard({ locale, sessions }: { locale: "vi" | "en"; sessions: WorkoutSession[] }) {
  const [now] = useState(() => new Date());
  const recovery = muscleRecoveryMap(sessions, now);
  const muscles = (status: MuscleRecoveryStatus) => recovery.filter((item) => item.status === status).map((item) => item.muscle);
  const sorted = [...recovery].sort((left, right) => statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) || left.recoveryPercent - right.recoveryPercent);
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
              <small>{item.weeklySets} {locale === "vi" ? "set/tuần" : "sets/wk"}</small>
            </li>
          ))}
        </ul>
        <p className="fine-print recovery-map__note">{locale === "vi"
          ? "Ước tính từ số set chính đã hoàn tất: 36 giờ + 4 giờ mỗi set (cơ phụ tính nửa set), tối đa 96 giờ. Chỉ để tham khảo, hãy nghe cơ thể."
          : "Estimated from completed working sets: 36 h + 4 h per set (secondary muscles count half), capped at 96 h. A guide only; listen to your body."}</p>
      </Card>
    </section>
  );
}
