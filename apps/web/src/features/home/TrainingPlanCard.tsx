import { ArrowDown, ArrowUp, Check, Equal, Sparkles } from "lucide-react";
import { Card, SectionTitle } from "@gym/ui";
import { getVariant } from "@gym/catalog";
import type { Routine } from "@gym/contracts";
import type { PlanAdjustmentAction, TrainingWeekPlan } from "@gym/workouts/plan";
import type { EngineSessionPlan } from "@gym/workouts/autoregulation-week";
import { localize } from "../../lib/i18n";
import { muscleLabels } from "../../lib/exercise-visuals";
import "./TrainingPlanCard.css";

interface TrainingPlanCardProps {
  locale: "vi" | "en";
  routines: Routine[];
  weekPlan: TrainingWeekPlan;
  sessionPlan: EngineSessionPlan;
  applyAdjustments: boolean;
  onApplyAdjustmentsChange: (value: boolean) => void;
}

const actionLabels: Record<PlanAdjustmentAction, { vi: string; en: string }> = {
  start: { vi: "Mới", en: "New" },
  progress: { vi: "Tăng", en: "Up" },
  hold: { vi: "Giữ", en: "Hold" },
  reduce: { vi: "Giảm", en: "Down" },
  ease_back: { vi: "Vào lại", en: "Ease back" }
};

const statusLabels = {
  done: { vi: "Đã tập", en: "Done" },
  planned: { vi: "Tập", en: "Train" },
  rest: { vi: "Nghỉ", en: "Rest" }
};

function weekday(date: string, locale: "vi" | "en"): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { weekday: "short" }).format(new Date(year, month - 1, day));
}

export function TrainingPlanCard({ locale, routines, weekPlan, sessionPlan, applyAdjustments, onApplyAdjustmentsChange }: TrainingPlanCardProps) {
  const routineName = (routineId?: string) => {
    const routine = routines.find((item) => item.id === routineId);
    return routine ? localize(routine.name, locale) : undefined;
  };
  const hasPrefill = sessionPlan.items.some((item) => item.loadKg !== undefined || item.action === "progress" || item.action === "ease_back") || Boolean(sessionPlan.engine);
  const engine = sessionPlan.engine;
  const changed = engine?.muscles.filter((item) => item.action !== "hold") ?? [];
  const unanswered = engine?.muscles.some((item) => item.soreness === undefined) ?? false;

  return (
    <section className="training-plan" aria-label={locale === "vi" ? "Kế hoạch tự điều chỉnh" : "Self-adjusting plan"}>
      <SectionTitle eyebrow={locale === "vi" ? "Tự điều chỉnh" : "Self-adjusting"} title={locale === "vi" ? "Kế hoạch tuần này" : "This week's plan"} />
      <Card className="training-plan__card">
        <ol className="training-plan__week" aria-label={locale === "vi" ? "Lịch tuần này" : "This week's schedule"}>
          {weekPlan.days.map((day) => (
            <li
              key={day.date}
              className={`training-plan__day training-plan__day--${day.status}${day.isToday ? " training-plan__day--today" : ""}${day.isPast ? " training-plan__day--past" : ""}`}
              aria-current={day.isToday ? "date" : undefined}
            >
              <small>{weekday(day.date, locale)}</small>
              <strong>{Number(day.date.slice(8))}</strong>
              {day.status === "done"
                ? <span role="img" aria-label={statusLabels.done[locale]}><Check size={14} aria-hidden="true" /></span>
                : <span>{statusLabels[day.status][locale]}</span>}
              {day.status === "planned" && routineName(day.routineId) ? <em>{routineName(day.routineId)}</em> : null}
            </li>
          ))}
        </ol>
        <p className="training-plan__note">{weekPlan.completedSessions}/{weekPlan.targetSessions} {locale === "vi" ? "ngày tập" : "training days"} · {weekPlan.note[locale]}</p>

        <div className="training-plan__session">
          <header>
            <Sparkles size={17} aria-hidden="true" />
            <div>
              <strong>{locale === "vi" ? "Buổi tiếp theo" : "Next session"}{routineName(sessionPlan.routineId) ? `: ${routineName(sessionPlan.routineId)}` : ""}</strong>
              <p>{sessionPlan.summary[locale]}</p>
            </div>
          </header>
          {engine ? (
            <div className="training-plan__engine">
              <strong>{engine.block.deload
                ? (locale === "vi" ? `Tuần xả tải${engine.block.early ? " sớm" : ""}: nửa số set, dừng khi còn khoảng ${engine.block.targetRir} lần` : `${engine.block.early ? "Early deload" : "Deload week"}: half the sets, stop with about ${engine.block.targetRir} reps left`)
                : (locale === "vi" ? `Tuần ${engine.block.week}/${engine.block.totalWeeks} của chu kỳ: dừng mỗi set khi còn khoảng ${engine.block.targetRir} lần (RIR ${engine.block.targetRir})` : `Week ${engine.block.week} of ${engine.block.totalWeeks} in the block: stop each set with about ${engine.block.targetRir} reps left (RIR ${engine.block.targetRir})`)}</strong>
              {engine.block.early ? <small>{locale === "vi" ? "Hai tuần liền không giữ được mục tiêu ở cùng nhóm cơ, hoặc hai nhóm cơ trong một tuần." : "Targets were missed for the same muscle two weeks running, or for two muscles in one week."}</small> : null}
              {changed.map((item) => (
                <small key={item.muscle}><b>{muscleLabels[item.muscle][locale]} {item.sessionSetDelta > 0 ? "+" : ""}{item.sessionSetDelta} set</b> · {item.reason[locale]}</small>
              ))}
              {!engine.block.deload && unanswered ? <small>{locale === "vi" ? "Số set chỉ đổi khi bạn trả lời câu hỏi đau cơ ở bản đồ phục hồi bên dưới." : "Set counts only change once you answer the soreness question on the recovery map below."}</small> : null}
            </div>
          ) : null}
          <ul className="training-plan__items">
            {sessionPlan.items.map((item) => {
              const variant = getVariant(item.variantId);
              const workingSets = item.sets.filter((set) => set.type === "working").length;
              return (
                <li key={item.itemId} className={`training-plan__item training-plan__item--${item.action}`}>
                  <span className="training-plan__badge">
                    {item.action === "progress" ? <ArrowUp size={13} aria-hidden="true" /> : item.action === "reduce" || item.action === "ease_back" ? <ArrowDown size={13} aria-hidden="true" /> : <Equal size={13} aria-hidden="true" />}
                    {actionLabels[item.action][locale]}
                  </span>
                  <div>
                    <strong>{variant ? localize(variant.name, locale) : item.variantId}</strong>
                    <b>{workingSets} {locale === "vi" ? "set" : "sets"}{item.loadKg !== undefined ? ` · ${item.previousLoadKg !== undefined && item.previousLoadKg !== item.loadKg ? `${item.previousLoadKg} → ` : ""}${item.loadKg} kg` : ""}</b>
                    <small>{item.reason[locale]}</small>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasPrefill ? (
            <label className="training-plan__toggle">
              <input type="checkbox" checked={applyAdjustments} onChange={(event) => onApplyAdjustmentsChange(event.target.checked)} />
              <span>
                <strong>{locale === "vi" ? "Áp dụng điều chỉnh khi bắt đầu" : "Apply adjustments on start"}</strong>
                <small>{locale === "vi" ? "Điền sẵn mức tạ và mục tiêu cho buổi mới. Lịch tập gốc và lịch sử không đổi; bạn vẫn sửa được từng set." : "Prefills loads and targets for the new session only. Your routine and history stay unchanged, and every set remains editable."}</small>
              </span>
            </label>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
