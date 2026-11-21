import type { BodyMetricPoint } from "./index";

export interface WeightTrendPoint {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Scale weight for the day; several entries on one day are averaged. */
  value: number;
  /** Exponentially smoothed weight for the day. */
  trend: number;
}

/** Share of the gap between scale weight and trend that closes per day. */
export const WEIGHT_TREND_DAILY_SMOOTHING = 0.1;

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/**
 * Smooths scale weight so day-to-day water and food swings do not hide the direction.
 * Each weigh-in moves the trend 10% of the way per elapsed day, so sparse logs still converge.
 */
export function weightTrend(points: BodyMetricPoint[]): WeightTrendPoint[] {
  const byDay = new Map<string, number[]>();
  points.forEach((point) => {
    const date = point.date.slice(0, 10);
    if (!(point.value > 0) || !Number.isFinite(dayNumber(date))) return;
    byDay.set(date, [...(byDay.get(date) ?? []), point.value]);
  });
  const days = [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right));
  const result: WeightTrendPoint[] = [];
  let trend: number | undefined;
  let previousDay = 0;
  days.forEach(([date, values]) => {
    const value = values.reduce((sum, item) => sum + item, 0) / values.length;
    const day = dayNumber(date);
    if (trend === undefined) trend = value;
    else trend += (1 - (1 - WEIGHT_TREND_DAILY_SMOOTHING) ** (day - previousDay)) * (value - trend);
    previousDay = day;
    result.push({ date, value: Math.round(value * 100) / 100, trend: Math.round(trend * 100) / 100 });
  });
  return result;
}
