import { describe, expect, it } from "vitest";
import { weightTrend } from "./index";

describe("weightTrend", () => {
  it("starts at the first weigh-in and moves 10% per day toward later ones", () => {
    const trend = weightTrend([
      { date: "2026-08-01", value: 80 },
      { date: "2026-08-02", value: 81 },
      { date: "2026-08-03", value: 79 }
    ]);
    expect(trend.map((point) => point.trend)).toEqual([80, 80.1, 79.99]);
    expect(trend.map((point) => point.value)).toEqual([80, 81, 79]);
  });

  it("weights a weigh-in after a gap by the days elapsed", () => {
    const trend = weightTrend([{ date: "2026-08-01", value: 80 }, { date: "2026-08-08", value: 78 }]);
    expect(trend[1]!.trend).toBeCloseTo(80 - 2 * (1 - 0.9 ** 7), 2);
  });

  it("sorts entries, averages same-day entries, and skips invalid ones", () => {
    const trend = weightTrend([
      { date: "2026-08-02T07:00:00.000Z", value: 82 },
      { date: "2026-08-01", value: 80 },
      { date: "2026-08-02", value: 80 },
      { date: "not-a-date", value: 70 },
      { date: "2026-08-03", value: 0 }
    ]);
    expect(trend).toEqual([
      { date: "2026-08-01", value: 80, trend: 80 },
      { date: "2026-08-02", value: 81, trend: 80.1 }
    ]);
  });

  it("stays flat while the scale only bounces around one weight", () => {
    const trend = weightTrend(Array.from({ length: 20 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      value: 80 + (index % 2 ? 0.8 : -0.8)
    })));
    expect(Math.abs(trend.at(-1)!.trend - 80)).toBeLessThan(0.5);
  });
});
