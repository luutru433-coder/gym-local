import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card, ProgressBar, SectionTitle } from "@gym/ui";
import type { MealEntry, NutritionTarget } from "@gym/contracts";
import { weeklyNutritionTrends } from "@gym/nutrition/trends";
import { formatNumber, type Locale } from "../../lib/i18n";
import "./NutritionTrendsSection.css";

const WEEKS = 6;

const macros = [
  { key: "protein", vi: "Chất đạm", en: "Protein", tone: "coral" },
  { key: "carbs", vi: "Chất bột đường", en: "Carbs", tone: "sky" },
  { key: "fat", vi: "Chất béo", en: "Fat", tone: "gold" }
] as const;

function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function signed(value: number, locale: Locale, digits = 0): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatNumber(Math.abs(value), locale, digits)}`;
}

export function NutritionTrendsSection({ meals, date, target, locale }: { meals: MealEntry[]; date: string; target?: NutritionTarget; locale: Locale }) {
  const weeks = useMemo(() => weeklyNutritionTrends(meals, date, WEEKS), [date, meals]);
  const [selectedStart, setSelectedStart] = useState<string>();
  const vi = locale === "vi";
  const selected = weeks.find((week) => week.weekStart === selectedStart) ?? weeks.at(-1);
  if (!selected) return null;

  const hasData = weeks.some((week) => week.average);
  const scaleMax = Math.max(target?.calories ?? 0, ...weeks.map((week) => week.average?.calories ?? 0), 1) * 1.12;
  const range = (week: { weekStart: string; weekEnd: string }) => `${shortDate(week.weekStart)}–${shortDate(week.weekEnd)}`;
  const average = selected.average;
  const calorieDelta = average && target ? average.calories - target.calories : undefined;

  return (
    <section className="nutrition-trends" aria-label={vi ? "Xu hướng theo tuần" : "Weekly trends"}>
      <SectionTitle eyebrow={vi ? `${WEEKS} tuần gần nhất` : `Last ${WEEKS} weeks`} title={vi ? "Xu hướng theo tuần" : "Weekly trends"} />
      <Card className="nutrition-trends__card">
        {hasData ? (
          <>
            <div className="nutrition-trends__chart" role="group" aria-label={vi ? "Calo trung bình mỗi ngày theo tuần" : "Average daily calories by week"}>
              {target ? <span className="nutrition-trends__target" style={{ bottom: `calc(26px + (100% - 26px) * ${target.calories / scaleMax})` }}><em>{vi ? "Mục tiêu" : "Target"} {formatNumber(target.calories, locale, 0)}</em></span> : null}
              {weeks.map((week) => {
                const calories = week.average?.calories;
                const label = calories === undefined
                  ? (vi ? `Tuần ${range(week)}: chưa ghi` : `Week ${range(week)}: nothing logged`)
                  : (vi ? `Tuần ${range(week)}: trung bình ${formatNumber(calories, locale, 0)} kcal mỗi ngày` : `Week ${range(week)}: ${formatNumber(calories, locale, 0)} kcal per day on average`);
                const over = calories !== undefined && target ? calories > target.calories * 1.05 : false;
                return (
                  <button key={week.weekStart} type="button" className="nutrition-trends__week" aria-pressed={week.weekStart === selected.weekStart} aria-label={label} onClick={() => setSelectedStart(week.weekStart)}>
                    <span className="nutrition-trends__bar-area"><span className={`nutrition-trends__bar${over ? " is-over" : ""}${calories === undefined ? " is-empty" : ""}`} style={{ height: calories === undefined ? undefined : `${Math.max(3, (calories / scaleMax) * 100)}%` }} /></span>
                    <small>{shortDate(week.weekStart)}</small>
                  </button>
                );
              })}
            </div>

            <div className="nutrition-trends__detail" aria-live="polite">
              <header>
                <span className="nutrition-trends__icon"><TrendingUp size={20} /></span>
                <div>
                  <span>{vi ? `Tuần ${range(selected)}` : `Week ${range(selected)}`} · {vi ? `${selected.loggedDays}/7 ngày có ghi` : `${selected.loggedDays}/7 days logged`}</span>
                  {average
                    ? <strong>{formatNumber(average.calories, locale, 0)} <small>{target ? `/ ${formatNumber(target.calories, locale, 0)} ` : ""}{vi ? "kcal mỗi ngày" : "kcal per day"}</small></strong>
                    : <strong className="is-empty">{vi ? "Chưa ghi món nào trong tuần này" : "Nothing logged this week"}</strong>}
                </div>
                {calorieDelta !== undefined ? <em className={Math.abs(calorieDelta) <= target!.calories * 0.05 ? "is-on-target" : undefined}>{signed(calorieDelta, locale)}<small>{vi ? "so với mục tiêu" : "vs target"}</small></em> : null}
              </header>
              {average ? (
                <ul className="nutrition-trends__macros">
                  {macros.map((macro) => {
                    const value = average[macro.key];
                    const goal = target?.[macro.key];
                    const name = vi ? macro.vi : macro.en;
                    return (
                      <li key={macro.key} className={`nutrition-trends__macro nutrition-trends__macro--${macro.tone}`}>
                        <span>{name}</span>
                        <strong>{formatNumber(value, locale, 0)}{goal ? <small> / {formatNumber(goal, locale, 0)}</small> : null} g</strong>
                        {goal ? <><ProgressBar value={(value / goal) * 100} label={name} valueText={`${formatNumber(value, locale, 0)} / ${formatNumber(goal, locale, 0)} g`} /><small>{signed(value - goal, locale)} g</small></> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <p className="nutrition-trends__note">{vi ? "Trung bình chỉ tính những ngày có ghi món; ngày bỏ trống không bị tính là 0." : "Averages count only days with logged food; empty days are not counted as zero."}{target ? "" : (vi ? " Chưa có mục tiêu đã xác nhận để so sánh." : " No confirmed target to compare against yet.")}</p>
          </>
        ) : <p className="nutrition-trends__empty">{vi ? "Ghi món ăn vài ngày để xem mức trung bình mỗi tuần so với mục tiêu." : "Log food for a few days to see weekly averages against your target."}</p>}
      </Card>
    </section>
  );
}
