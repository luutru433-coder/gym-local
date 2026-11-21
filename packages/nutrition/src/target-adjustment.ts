import type { Goal, MealEntry, NutritionTarget } from "@gym/contracts";

/** Energy stored in or released from one kilogram of body weight change. */
export const KCAL_PER_KG_BODY_WEIGHT = 7700;
export const TARGET_ADJUSTMENT_WINDOW_DAYS = 21;
export const TARGET_ADJUSTMENT_MIN_SPAN_DAYS = 14;
export const TARGET_ADJUSTMENT_MIN_WEIGH_INS = 3;
export const TARGET_ADJUSTMENT_MIN_LOGGED_DAYS = 10;
/** Largest change one suggestion makes, so a noisy fortnight cannot swing the target. */
export const TARGET_ADJUSTMENT_MAX_STEP_KCAL = 300;
export const TARGET_ADJUSTMENT_MIN_STEP_KCAL = 50;
export const TARGET_ADJUSTMENT_MIN_CALORIES = 1200;

/** Same goal factors as the formula estimate, applied to measured expenditure instead. */
export const GOAL_CALORIE_FACTOR: Record<Goal, number> = {
  fat_loss: 0.9,
  general: 1,
  strength: 1.05,
  hypertrophy: 1.05
};

export interface TargetAdjustmentTrendPoint {
  date: string;
  trend: number;
}

export interface TargetAdjustmentInput {
  /** Smoothed weight per weigh-in day, oldest first. */
  trend: TargetAdjustmentTrendPoint[];
  meals: MealEntry[];
  target: NutritionTarget | undefined;
  goal: Goal;
  /** Local calendar day, YYYY-MM-DD. Today itself is ignored because its diary is still open. */
  today: string;
}

export interface TargetAdjustmentEvidence {
  weighIns: number;
  spanDays: number;
  loggedDays: number;
}

export type TargetAdjustment =
  | ({ status: "insufficient"; reason: "no_target" | "weigh_ins" | "intake" | "implausible" } & TargetAdjustmentEvidence)
  | ({
    status: "on_track" | "adjust";
    fromDate: string;
    toDate: string;
    averageIntake: number;
    trendChangeKg: number;
    weeklyChangeKg: number;
    estimatedExpenditure: number;
    currentCalories: number;
    suggestedCalories: number;
    /** True when the step limit or the calorie floor held the suggestion back. */
    limited: boolean;
    suggestedTarget: NutritionTarget;
  } & TargetAdjustmentEvidence);

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/**
 * Compares logged intake with the smoothed weight change over the last three weeks
 * to estimate real expenditure, then suggests a calorie target for the profile goal.
 * It never changes anything by itself: the caller saves `suggestedTarget` only when the user accepts.
 */
export function suggestCalorieTarget(input: TargetAdjustmentInput): TargetAdjustment {
  const today = dayNumber(input.today);
  const window = input.trend.filter((point) => {
    const day = dayNumber(point.date);
    return day >= today - TARGET_ADJUSTMENT_WINDOW_DAYS && day <= today;
  });
  const first = window[0];
  const last = window.at(-1);
  const spanDays = first && last ? dayNumber(last.date) - dayNumber(first.date) : 0;
  const intakeByDay = new Map<number, number>();
  if (first && last) {
    input.meals.forEach((entry) => {
      const day = dayNumber(entry.date);
      if (day < dayNumber(first.date) || day > dayNumber(last.date) || day >= today) return;
      intakeByDay.set(day, (intakeByDay.get(day) ?? 0) + entry.nutrientsSnapshot.calories);
    });
  }
  const loggedIntake = [...intakeByDay.values()].filter((calories) => calories > 0);
  const evidence: TargetAdjustmentEvidence = { weighIns: window.length, spanDays, loggedDays: loggedIntake.length };

  if (!input.target) return { status: "insufficient", reason: "no_target", ...evidence };
  if (!first || !last || window.length < TARGET_ADJUSTMENT_MIN_WEIGH_INS || spanDays < TARGET_ADJUSTMENT_MIN_SPAN_DAYS) {
    return { status: "insufficient", reason: "weigh_ins", ...evidence };
  }
  if (loggedIntake.length < TARGET_ADJUSTMENT_MIN_LOGGED_DAYS) return { status: "insufficient", reason: "intake", ...evidence };

  const averageIntake = loggedIntake.reduce((sum, calories) => sum + calories, 0) / loggedIntake.length;
  const trendChangeKg = last.trend - first.trend;
  const estimatedExpenditure = averageIntake - (trendChangeKg * KCAL_PER_KG_BODY_WEIGHT) / spanDays;
  if (estimatedExpenditure < 1000 || estimatedExpenditure > 6000) return { status: "insufficient", reason: "implausible", ...evidence };

  const currentCalories = input.target.calories;
  const ideal = Math.round((estimatedExpenditure * GOAL_CALORIE_FACTOR[input.goal]) / 10) * 10;
  const stepped = Math.min(currentCalories + TARGET_ADJUSTMENT_MAX_STEP_KCAL, Math.max(currentCalories - TARGET_ADJUSTMENT_MAX_STEP_KCAL, ideal));
  // The floor never pushes a target that is already lower back up.
  const suggestedCalories = stepped < currentCalories ? Math.max(stepped, Math.min(currentCalories, TARGET_ADJUSTMENT_MIN_CALORIES)) : stepped;
  const fat = Math.round((suggestedCalories * 0.25) / 9);
  const suggestedTarget: NutritionTarget = {
    calories: suggestedCalories,
    protein: input.target.protein,
    carbs: Math.max(0, Math.round((suggestedCalories - input.target.protein * 4 - fat * 9) / 4)),
    fat,
    waterMl: input.target.waterMl,
    formulaVersion: input.target.formulaVersion,
    source: "manual"
  };
  return {
    status: Math.abs(suggestedCalories - currentCalories) < TARGET_ADJUSTMENT_MIN_STEP_KCAL ? "on_track" : "adjust",
    fromDate: first.date.slice(0, 10),
    toDate: last.date.slice(0, 10),
    averageIntake: Math.round(averageIntake),
    trendChangeKg: Math.round(trendChangeKg * 100) / 100,
    weeklyChangeKg: Math.round((trendChangeKg / spanDays) * 7 * 100) / 100,
    estimatedExpenditure: Math.round(estimatedExpenditure),
    currentCalories,
    suggestedCalories,
    limited: suggestedCalories !== ideal,
    suggestedTarget,
    ...evidence
  };
}
