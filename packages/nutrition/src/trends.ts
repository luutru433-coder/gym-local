import type { MealEntry } from "@gym/contracts";

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionTrendDay {
  date: string;
  logged: boolean;
  calories: number;
}

export interface NutritionWeekTrend {
  /** Monday, as a local `YYYY-MM-DD` diary date. */
  weekStart: string;
  /** Sunday, as a local `YYYY-MM-DD` diary date. */
  weekEnd: string;
  loggedDays: number;
  /** Mean over days with at least one diary entry; undefined when nothing was logged. */
  average?: MacroTotals;
  days: NutritionTrendDay[];
}

const DAY_MS = 86_400_000;

function parseDiaryDate(date: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return undefined;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(time) ? undefined : time;
}

function formatDiaryDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Monday of the week containing `date`; diary dates are calendar days, so the math stays in UTC. */
export function nutritionWeekStart(date: string): string | undefined {
  const time = parseDiaryDate(date);
  if (time === undefined) return undefined;
  const weekday = new Date(time).getUTCDay() || 7;
  return formatDiaryDate(time - (weekday - 1) * DAY_MS);
}

/**
 * Weekly averages for the `weeks` Monday–Sunday weeks ending with the week of `anchorDate`, oldest first.
 * Days without diary entries are skipped rather than counted as zero.
 */
export function weeklyNutritionTrends(entries: MealEntry[], anchorDate: string, weeks = 6): NutritionWeekTrend[] {
  const anchorStart = nutritionWeekStart(anchorDate);
  if (!anchorStart || weeks < 1) return [];
  const lastStart = parseDiaryDate(anchorStart)!;
  const firstStart = lastStart - (weeks - 1) * 7 * DAY_MS;
  const firstDate = formatDiaryDate(firstStart);
  const lastDate = formatDiaryDate(lastStart + 6 * DAY_MS);

  const byDate = new Map<string, MacroTotals>();
  for (const entry of entries) {
    if (entry.date < firstDate || entry.date > lastDate) continue;
    const total = byDate.get(entry.date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    total.calories += entry.nutrientsSnapshot.calories;
    total.protein += entry.nutrientsSnapshot.protein;
    total.carbs += entry.nutrientsSnapshot.carbs;
    total.fat += entry.nutrientsSnapshot.fat;
    byDate.set(entry.date, total);
  }

  return Array.from({ length: weeks }, (_, weekIndex) => {
    const start = firstStart + weekIndex * 7 * DAY_MS;
    const sum: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    let loggedDays = 0;
    const days = Array.from({ length: 7 }, (_, dayIndex): NutritionTrendDay => {
      const date = formatDiaryDate(start + dayIndex * DAY_MS);
      const total = byDate.get(date);
      if (!total) return { date, logged: false, calories: 0 };
      loggedDays += 1;
      sum.calories += total.calories;
      sum.protein += total.protein;
      sum.carbs += total.carbs;
      sum.fat += total.fat;
      return { date, logged: true, calories: Math.round(total.calories) };
    });
    return {
      weekStart: formatDiaryDate(start),
      weekEnd: formatDiaryDate(start + 6 * DAY_MS),
      loggedDays,
      average: loggedDays ? {
        calories: Math.round(sum.calories / loggedDays),
        protein: round1(sum.protein / loggedDays),
        carbs: round1(sum.carbs / loggedDays),
        fat: round1(sum.fat / loggedDays)
      } : undefined,
      days
    };
  });
}
