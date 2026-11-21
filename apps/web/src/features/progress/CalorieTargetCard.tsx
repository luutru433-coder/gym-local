import { useState } from "react";
import { Flame } from "lucide-react";
import { Button, Card, Notice, SectionTitle } from "@gym/ui";
import type { WeightTrendPoint } from "@gym/progress";
import { confirmNutritionTarget, suggestCalorieTarget } from "@gym/nutrition";
import { calorieCheckSnoozedUntil, snoozeCalorieCheck } from "@gym/storage/device";
import { formatNumber } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";
import "./CalorieTargetCard.css";

const SNOOZE_DAYS = 7;

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortDate(date: string, locale: "vi" | "en"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { day: "2-digit", month: "2-digit" }).format(new Date(`${date}T12:00:00`));
}

function signed(value: number, locale: "vi" | "en", digits: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatNumber(Math.abs(value), locale, digits)}`;
}

export function CalorieTargetCard({ trend }: { trend: WeightTrendPoint[] }) {
  const profile = useGymStore((state) => state.profile)!;
  const meals = useGymStore((state) => state.meals);
  const updateProfile = useGymStore((state) => state.updateProfile);
  const locale = profile.locale;
  const vi = locale === "vi";
  const [today] = useState(() => localDateKey(new Date()));
  const [snoozedUntil, setSnoozedUntil] = useState(() => calorieCheckSnoozedUntil());
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState<number>();
  const [failed, setFailed] = useState(false);

  const result = suggestCalorieTarget({
    trend,
    meals,
    target: profile.nutritionTarget?.confirmedAt ? profile.nutritionTarget : undefined,
    goal: profile.goal,
    today
  });
  const snoozed = Boolean(snoozedUntil && snoozedUntil > today);

  const snooze = () => {
    const until = new Date(`${today}T12:00:00`);
    until.setDate(until.getDate() + SNOOZE_DAYS);
    const key = localDateKey(until);
    snoozeCalorieCheck(key);
    setSnoozedUntil(key);
  };

  const accept = async () => {
    if (result.status !== "adjust") return;
    setSaving(true);
    setFailed(false);
    try {
      await updateProfile({ ...profile, nutritionTarget: confirmNutritionTarget(result.suggestedTarget), updatedAt: new Date().toISOString() });
      setAccepted(result.suggestedCalories);
      snooze();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  let body;
  if (result.status === "insufficient") {
    const have = vi
      ? `Hiện có ${result.weighIns} lần cân trải trên ${result.spanDays} ngày và ${result.loggedDays} ngày có nhật ký ăn.`
      : `So far: ${result.weighIns} weigh-ins across ${result.spanDays} days and ${result.loggedDays} days with a food diary.`;
    body = <p className="calorie-check__text">{result.reason === "no_target"
      ? (vi ? "Hãy lưu và xác nhận mục tiêu dinh dưỡng trong Cài đặt trước; sau đó app sẽ so sánh lượng ăn với xu hướng cân nặng." : "Save and confirm a nutrition target in Settings first; the app then compares your intake with your weight trend.")
      : result.reason === "implausible"
        ? (vi ? "Số liệu 3 tuần gần đây cho kết quả không hợp lý (có thể nhật ký ăn còn thiếu), nên app chưa gợi ý thay đổi." : "The last 3 weeks of data give an unrealistic result (the food diary may be incomplete), so there is no suggestion yet.")
        : (vi
          ? `Cần ít nhất 3 lần cân trải trên 14 ngày và 10 ngày ghi bữa ăn trong 3 tuần gần nhất. ${have}`
          : `Needs at least 3 weigh-ins across 14 days and 10 days of logged meals in the last 3 weeks. ${have}`)}</p>;
  } else {
    body = <>
      <dl className="chart-facts">
        <div><dt>{vi ? "Ăn trung bình" : "Average intake"}</dt><dd>{formatNumber(result.averageIntake, locale, 0)} kcal</dd></div>
        <div><dt>{vi ? "Xu hướng cân" : "Weight trend"}</dt><dd>{signed(result.weeklyChangeKg, locale, 2)} {vi ? "kg/tuần" : "kg/wk"}</dd></div>
        <div><dt>{vi ? "Tiêu hao ước tính" : "Est. expenditure"}</dt><dd>{formatNumber(result.estimatedExpenditure, locale, 0)} kcal</dd></div>
      </dl>
      {accepted !== undefined
        ? <Notice tone="success">{vi ? `Đã đổi mục tiêu thành ${formatNumber(accepted, locale, 0)} kcal/ngày.` : `Target changed to ${formatNumber(accepted, locale, 0)} kcal/day.`}</Notice>
        : result.status === "on_track"
          ? <p className="calorie-check__text">{vi ? `Mục tiêu hiện tại ${formatNumber(result.currentCalories, locale, 0)} kcal/ngày vẫn phù hợp với số liệu của bạn.` : `Your current target of ${formatNumber(result.currentCalories, locale, 0)} kcal/day still fits your data.`}</p>
          : snoozed
            ? <p className="calorie-check__text">{vi ? `Đã bỏ qua gợi ý. App sẽ gợi ý lại từ ${shortDate(snoozedUntil!, locale)}.` : `Suggestion ignored. The app will suggest again from ${shortDate(snoozedUntil!, locale)}.`}</p>
            : <div className="calorie-check__suggestion">
              <p><span>{vi ? "Gợi ý mục tiêu" : "Suggested target"}</span><strong>{formatNumber(result.currentCalories, locale, 0)} → {formatNumber(result.suggestedCalories, locale, 0)} kcal</strong></p>
              <small>{vi
                ? `Đạm ${result.suggestedTarget.protein} g (giữ nguyên) · bột đường ${result.suggestedTarget.carbs} g · béo ${result.suggestedTarget.fat} g`
                : `Protein ${result.suggestedTarget.protein} g (unchanged) · carbs ${result.suggestedTarget.carbs} g · fat ${result.suggestedTarget.fat} g`}</small>
              <div className="calorie-check__actions">
                <Button size="sm" disabled={saving} onClick={() => void accept()}>{vi ? "Dùng mục tiêu mới" : "Use new target"}</Button>
                <Button size="sm" variant="secondary" disabled={saving} onClick={snooze}>{vi ? "Bỏ qua" : "Ignore"}</Button>
              </div>
              {failed ? <Notice tone="warning">{vi ? "Không thể lưu mục tiêu mới." : "Could not save the new target."}</Notice> : null}
            </div>}
      <p className="fine-print">{vi
        ? `Tính từ ${result.loggedDays} ngày có nhật ký và ${result.weighIns} lần cân, ${shortDate(result.fromDate, locale)}–${shortDate(result.toDate, locale)}. Ngày không ghi bữa ăn bị bỏ qua, nên ghi thiếu sẽ làm kết quả thấp hơn thực tế. Mỗi lần gợi ý đổi tối đa 300 kcal. Đây là ước tính, không phải tư vấn y tế.`
        : `Based on ${result.loggedDays} logged days and ${result.weighIns} weigh-ins, ${shortDate(result.fromDate, locale)}–${shortDate(result.toDate, locale)}. Days without meals are skipped, so under-logging makes the result too low. Each suggestion changes at most 300 kcal. This is an estimate, not medical advice.`}</p>
    </>;
  }

  return (
    <Card className="chart-card calorie-check">
      <SectionTitle eyebrow={vi ? "Ăn vào so với cân nặng · 3 tuần" : "Intake vs weight · 3 weeks"} title={vi ? "Kiểm tra mục tiêu calo" : "Calorie target check"} action={<Flame size={18} aria-hidden="true" />} />
      {body}
    </Card>
  );
}
