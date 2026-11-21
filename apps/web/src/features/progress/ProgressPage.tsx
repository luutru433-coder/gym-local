import { useState } from "react";
import { Activity, BarChart3, CalendarDays, ChevronDown, Dumbbell, Pencil, Plus, Scale, Target, Trash2, TrendingUp, Trophy } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, Chip, EmptyState, Field, Modal, SectionTitle } from "@gym/ui";
import { createId, type BodyMetric, type MuscleGroup, type SessionExercise, type WorkoutSession } from "@gym/contracts";
import { EQUIPMENT_OPTIONS, getTrackingProfile, getVariant, trackingProfileForLoadMode } from "@gym/catalog";
import {
  bodyMetricSeries,
  weightTrend,
  exactVariantTrend,
  personalRecord,
  sessionExternalVolume,
  variantVolumeSummary,
  weeklyMuscleSets,
  weeklyTrainingSummary,
  workoutCalendar,
  type BodyMetricKey,
  type VariantTrendPoint,
  type WeeklyTrainingSummary,
  type WorkoutCalendarDay
} from "@gym/progress";
import { formatDate, formatNumber, localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";
import { removePastSession } from "./history-actions";
import { CalorieTargetCard } from "./CalorieTargetCard";
import { BodyMetricLog, ConfirmDeleteModal, SessionEditModal } from "./HistoryEditors";
import "./ProgressPage.css";

const muscleLabels: Record<MuscleGroup, { vi: string; en: string }> = {
  chest: { vi: "Ngực", en: "Chest" }, back: { vi: "Lưng", en: "Back" }, shoulders: { vi: "Vai", en: "Shoulders" }, biceps: { vi: "Tay trước", en: "Biceps" }, triceps: { vi: "Tay sau", en: "Triceps" }, quadriceps: { vi: "Đùi trước", en: "Quads" }, hamstrings: { vi: "Đùi sau", en: "Hamstrings" }, glutes: { vi: "Mông", en: "Glutes" }, calves: { vi: "Bắp chân", en: "Calves" }, core: { vi: "Core", en: "Core" }, forearms: { vi: "Cẳng tay", en: "Forearms" }, full_body: { vi: "Toàn thân", en: "Full body" }
};

function weekStart(): Date {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
}

function completedPerformanceLabel(exercise: SessionExercise, locale: "vi" | "en"): string {
  const sets = exercise.sets.filter((set) => set.completedAt && set.type !== "warmup");
  const profile = exercise.trackingProfileSnapshot
    ?? getTrackingProfile(exercise.variantId)
    ?? trackingProfileForLoadMode(exercise.variantId, exercise.loadEntryModeSnapshot);
  if (profile.effortKind === "duration") return `${Math.max(0, ...sets.map((set) => set.durationSeconds ?? 0))}s`;
  if (profile.effortKind === "distance_duration") {
    const distance = Math.max(0, ...sets.map((set) => set.distanceMeters ?? 0));
    return distance > 0 ? `${distance}m` : `${Math.max(0, ...sets.map((set) => set.durationSeconds ?? 0))}s`;
  }
  if (profile.loadEntryMode === "assisted") {
    const values = sets.map((set) => set.weightKg).filter((value): value is number => value !== undefined);
    return values.length ? `${locale === "vi" ? "trợ lực" : "assist"} ${Math.min(...values)} kg` : "—";
  }
  if (profile.loadEntryMode === "reps_only" || !sets.some((set) => set.weightKg !== undefined)) {
    return `${Math.max(0, ...sets.map((set) => set.reps ?? 0))} reps`;
  }
  const suffix = profile.loadEntryMode === "per_hand" ? (locale === "vi" ? " kg/tay" : " kg/hand") : " kg";
  return `${Math.max(0, ...sets.map((set) => set.weightKg ?? 0))}${suffix}`;
}

function optionalPositiveMetric(raw: string): number | undefined {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function rollingCalendar(days: WorkoutCalendarDay[], count = 28): WorkoutCalendarDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - index - 1));
    const key = localDateKey(date);
    return byDate.get(key) ?? { date: key, sessions: 0, completedWorkingSets: 0, externalLoadVolumeKg: 0, durationMinutes: 0 };
  });
}

type Text = { vi: string; en: string };

type TrendMetric = {
  key: keyof Pick<VariantTrendPoint, "bestE1rmKg" | "bestLoadKg" | "minAssistanceKg" | "bestReps" | "bestDurationSeconds" | "bestDistanceMeters" | "externalLoadVolumeKg" | "totalReps">;
  label: Text;
  short: Text;
  unit: string;
  lowerIsBetter?: boolean;
};

const TREND_METRICS: TrendMetric[] = [
  { key: "bestE1rmKg", label: { vi: "e1RM tốt nhất", en: "Best e1RM" }, short: { vi: "e1RM", en: "e1RM" }, unit: "kg" },
  { key: "minAssistanceKg", label: { vi: "Trợ lực thấp nhất", en: "Lowest assistance" }, short: { vi: "Trợ lực", en: "Assistance" }, unit: "kg", lowerIsBetter: true },
  { key: "bestLoadKg", label: { vi: "Mức tạ tốt nhất", en: "Best load" }, short: { vi: "Mức tạ", en: "Load" }, unit: "kg" },
  { key: "bestDurationSeconds", label: { vi: "Thời gian tốt nhất", en: "Best duration" }, short: { vi: "Thời gian", en: "Duration" }, unit: "s" },
  { key: "bestDistanceMeters", label: { vi: "Quãng đường tốt nhất", en: "Best distance" }, short: { vi: "Quãng đường", en: "Distance" }, unit: "m" },
  { key: "externalLoadVolumeKg", label: { vi: "Volume mỗi buổi", en: "Session volume" }, short: { vi: "Volume", en: "Volume" }, unit: "kg·reps" },
  { key: "bestReps", label: { vi: "Số lần tốt nhất", en: "Best reps" }, short: { vi: "Reps tốt nhất", en: "Best reps" }, unit: "reps" },
  { key: "totalReps", label: { vi: "Tổng số lần", en: "Total reps" }, short: { vi: "Tổng reps", en: "Total reps" }, unit: "reps" }
];

function availableTrendMetrics(points: VariantTrendPoint[]): TrendMetric[] {
  const available = TREND_METRICS.filter((metric) => points.some((point) => {
    const value = point[metric.key];
    return value !== undefined && (value > 0 || metric.key === "minAssistanceKg");
  }));
  return available.length ? available : [TREND_METRICS.find((metric) => metric.key === "bestReps")!];
}

type RangeKey = "4w" | "3m" | "1y" | "all";

const RANGES: { key: RangeKey; label: Text; days?: number; weeks?: number }[] = [
  { key: "4w", label: { vi: "4 tuần", en: "4 weeks" }, days: 28, weeks: 4 },
  { key: "3m", label: { vi: "3 tháng", en: "3 months" }, days: 91, weeks: 13 },
  { key: "1y", label: { vi: "1 năm", en: "1 year" }, days: 365, weeks: 52 },
  { key: "all", label: { vi: "Tất cả", en: "All time" } }
];

function rangeStartDate(days: number | undefined): Date | undefined {
  if (!days) return undefined;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return date;
}

function weeksSince(isoDate: string | undefined): number {
  if (!isoDate) return 4;
  const weeks = Math.ceil((Date.now() - new Date(isoDate).getTime()) / (7 * 86_400_000)) + 1;
  return Math.max(4, weeks);
}

type WeeklyMetricKey = keyof Pick<WeeklyTrainingSummary, "sessions" | "completedWorkingSets" | "externalLoadVolumeKg" | "durationMinutes">;

const WEEKLY_METRICS: { key: WeeklyMetricKey; label: Text; unit: Text }[] = [
  { key: "externalLoadVolumeKg", label: { vi: "Volume", en: "Volume" }, unit: { vi: "kg·reps", en: "kg·reps" } },
  { key: "completedWorkingSets", label: { vi: "Set chính", en: "Working sets" }, unit: { vi: "set", en: "sets" } },
  { key: "sessions", label: { vi: "Số buổi", en: "Workouts" }, unit: { vi: "buổi", en: "workouts" } },
  { key: "durationMinutes", label: { vi: "Thời gian", en: "Duration" }, unit: { vi: "phút", en: "min" } }
];

const BODY_METRICS: { key: BodyMetricKey; label: Text; unit: string }[] = [
  { key: "weightKg", label: { vi: "Cân nặng", en: "Weight" }, unit: "kg" },
  { key: "waistCm", label: { vi: "Eo", en: "Waist" }, unit: "cm" },
  { key: "chestCm", label: { vi: "Ngực", en: "Chest" }, unit: "cm" },
  { key: "hipsCm", label: { vi: "Hông", en: "Hips" }, unit: "cm" },
  { key: "armCm", label: { vi: "Bắp tay", en: "Arm" }, unit: "cm" },
  { key: "thighCm", label: { vi: "Đùi", en: "Thigh" }, unit: "cm" }
];

function signed(value: number, locale: "vi" | "en", digits = 1): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatNumber(Math.abs(value), locale, digits)}`;
}

const tooltipStyle = { borderRadius: 12, border: "1px solid #d7d4ca", background: "#fffdf8" };
const axisTick = { fontSize: 10, fill: "#77786f" };

function markMetricRecords(points: VariantTrendPoint[], metric: TrendMetric) {
  let record: number | undefined;
  const marked = points.map((point) => {
    const value = point[metric.key];
    const counts = value !== undefined && (value > 0 || Boolean(metric.lowerIsBetter));
    const isMetricPr = counts && (record === undefined || (metric.lowerIsBetter ? value < record : value > record));
    if (isMetricPr) record = value;
    return { ...point, value, isMetricPr };
  });
  return { points: marked, record };
}

function PrDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: { isMetricPr?: boolean } }) {
  if (cx === undefined || cy === undefined) return null;
  return payload?.isMetricPr
    ? <circle cx={cx} cy={cy} r={6} fill="#ff6c4a" stroke="#1d2018" strokeWidth={1.5} />
    : <circle cx={cx} cy={cy} r={4} fill="#d9ff58" stroke="#1d2018" strokeWidth={1.5} />;
}

export function ProgressPage() {
  const profile = useGymStore((state) => state.profile)!;
  const sessions = useGymStore((state) => state.sessions).filter((session) => session.finishedAt);
  const bodyMetrics = useGymStore((state) => state.bodyMetrics);
  const addBodyMetric = useGymStore((state) => state.addBodyMetric);
  const locale = profile.locale;
  const [metricOpen, setMetricOpen] = useState(false);
  const [editingMetricId, setEditingMetricId] = useState<string>();
  const [editingSession, setEditingSession] = useState<WorkoutSession>();
  const [deletingSession, setDeletingSession] = useState<WorkoutSession>();
  const [historyLimit, setHistoryLimit] = useState(8);
  const [expandedSession, setExpandedSession] = useState<string>();
  const variantSummaries = variantVolumeSummary(sessions);
  const [requestedVariantId, setRequestedVariantId] = useState(variantSummaries[0]?.variantId ?? "");
  const [rangeKey, setRangeKey] = useState<RangeKey>("3m");
  const [requestedTrendMetric, setRequestedTrendMetric] = useState<TrendMetric["key"]>();
  const [weeklyMetricKey, setWeeklyMetricKey] = useState<WeeklyMetricKey>("externalLoadVolumeKg");
  const [requestedMuscle, setRequestedMuscle] = useState<MuscleGroup>();
  const [bodyMetricKey, setBodyMetricKey] = useState<BodyMetricKey>("weightKg");
  const range = RANGES.find((item) => item.key === rangeKey)!;
  const rangeStart = rangeStartDate(range.days);
  const inRange = (date: string) => !rangeStart || new Date(date.length === 10 ? `${date}T12:00:00` : date) >= rangeStart;
  const dateFormat = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", rangeKey === "1y" || rangeKey === "all" ? { day: "2-digit", month: "2-digit", year: "2-digit" } : { day: "2-digit", month: "2-digit" });
  const [metric, setMetric] = useState({ date: new Date().toISOString().slice(0, 10), weightKg: profile.weightKg ? String(profile.weightKg) : "", waistCm: "", chestCm: "", hipsCm: "", armCm: "", thighCm: "" });

  const selectedVariantId = variantSummaries.some((summary) => summary.variantId === requestedVariantId)
    ? requestedVariantId
    : (variantSummaries[0]?.variantId ?? "");
  const selectedVariant = getVariant(selectedVariantId);
  const selectedVariantSnapshot = sessions.flatMap((session) => session.exercises).find((exercise) => exercise.variantId === selectedVariantId);
  const selectedVariantLabel = selectedVariant
    ? localize(selectedVariant.name, locale)
    : selectedVariantSnapshot
      ? localize(selectedVariantSnapshot.variantNameSnapshot, locale)
      : selectedVariantId;
  const selectedSummary = variantSummaries.find((summary) => summary.variantId === selectedVariantId);
  const variantTrend = selectedVariantId ? exactVariantTrend(sessions, selectedVariantId) : [];
  const trendMetrics = availableTrendMetrics(variantTrend);
  const selectedTrendMetric = trendMetrics.find((item) => item.key === requestedTrendMetric) ?? trendMetrics[0];
  const { points: markedTrend, record: variantRecordValue } = markMetricRecords(variantTrend, selectedTrendMetric);
  const variantTrendAll = markedTrend.map((point) => ({ ...point, dateLabel: dateFormat.format(new Date(point.date)) }));
  const showVolumeColumn = selectedTrendMetric.key !== "externalLoadVolumeKg";
  const variantTrendData = variantTrendAll.filter((point) => inRange(point.date));
  const latestVariantValue = variantTrendData.at(-1)?.value;
  const firstVariantValue = variantTrendData.find((point) => point.value !== undefined)?.value;
  const variantChange = latestVariantValue !== undefined && firstVariantValue !== undefined && variantTrendData.length > 1
    ? latestVariantValue - firstVariantValue
    : undefined;
  const variantChangePercent = variantChange !== undefined && firstVariantValue ? (variantChange / firstVariantValue) * 100 : undefined;
  const rangePrCount = variantTrendData.filter((point) => point.isMetricPr).length;

  const weekly = weeklyTrainingSummary(
    sessions.filter((session) => session.finishedAt && inRange(session.finishedAt)),
    range.weeks ? range.weeks + 1 : weeksSince(sessions.flatMap((session) => session.finishedAt ?? []).sort()[0])
  ).filter((week) => {
    if (!rangeStart) return true;
    const weekEnd = new Date(`${week.weekStart}T12:00:00`);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return weekEnd >= rangeStart;
  });
  const weeklyMetric = WEEKLY_METRICS.find((item) => item.key === weeklyMetricKey)!;
  const weeklyData = weekly.map((week) => ({
    ...week,
    label: dateFormat.format(new Date(`${week.weekStart}T12:00:00`)),
    value: week[weeklyMetric.key]
  }));
  const weeklyHasData = weekly.some((week) => week.sessions > 0);
  const weeklyAverage = weeklyData.reduce((sum, week) => sum + week.value, 0) / weeklyData.length;
  const thisWeekValue = weeklyData.at(-1)?.value ?? 0;
  const previousWeekValue = weeklyData.at(-2)?.value ?? 0;
  const muscleTotals = weekly.reduce<Partial<Record<MuscleGroup, number>>>((totals, week) => {
    Object.entries(week.muscleSets).forEach(([muscle, count]) => {
      totals[muscle as MuscleGroup] = (totals[muscle as MuscleGroup] ?? 0) + Number(count);
    });
    return totals;
  }, {});
  const rankedMuscles = (Object.entries(muscleTotals) as [MuscleGroup, number][]).sort(([, left], [, right]) => right - left);
  const selectedMuscle = rankedMuscles.some(([muscle]) => muscle === requestedMuscle) ? requestedMuscle! : rankedMuscles[0]?.[0];
  const muscleWeeklyData = weeklyData.map((week) => ({ label: week.label, weekStart: week.weekStart, sets: selectedMuscle ? week.muscleSets[selectedMuscle] ?? 0 : 0 }));
  const muscleWeeklyAverage = selectedMuscle ? (muscleTotals[selectedMuscle] ?? 0) / weekly.length : 0;

  const bodyMetric = BODY_METRICS.find((item) => item.key === bodyMetricKey)!;
  const weightTrendPoints = weightTrend(bodyMetricSeries(bodyMetrics, "weightKg"));
  const showWeightTrend = bodyMetricKey === "weightKg";
  const bodyData: { date: string; value: number; trend?: number; label: string }[] = (showWeightTrend ? weightTrendPoints : bodyMetricSeries(bodyMetrics, bodyMetricKey))
    .filter((point) => inRange(point.date))
    .map((point) => ({ ...point, label: dateFormat.format(new Date(`${point.date.slice(0, 10)}T12:00:00`)) }));
  const latestTrend = showWeightTrend ? bodyData.at(-1)?.trend : undefined;
  const bodyChange = bodyData.length > 1 ? bodyData.at(-1)!.value - bodyData[0].value : undefined;
  const calendarDays = rollingCalendar(workoutCalendar(sessions));
  const maxCalendarSets = Math.max(1, ...calendarDays.map((day) => day.completedWorkingSets));

  const totalSets = sessions.reduce((total, session) => total + session.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completedAt && set.type !== "warmup").length, 0);
  const totalVolume = sessions.reduce((sum, session) => sum + sessionExternalVolume(session), 0);
  const uniqueVariants = [...new Set(sessions.flatMap((session) => session.exercises.map((exercise) => exercise.variantId)))];
  const e1rmVariantCount = uniqueVariants.filter((variantId) => personalRecord(sessions, variantId).maxE1rm > 0).length;
  const muscleSets = weeklyMuscleSets(sessions, weekStart());
  const maxMuscleSets = Math.max(1, ...Object.values(muscleSets).map(Number));

  const volumeData = [...sessions].reverse().slice(-10).map((session) => ({
    date: new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { day: "2-digit", month: "2-digit" }).format(new Date(session.finishedAt!)),
    volume: sessionExternalVolume(session)
  }));
  const hasValidMetric = [metric.weightKg, metric.waistCm, metric.chestCm, metric.hipsCm, metric.armCm, metric.thighCm]
    .some((value) => optionalPositiveMetric(value) !== undefined);

  const saveMetric = async () => {
    const bodyMetric: BodyMetric = {
      id: editingMetricId ?? createId("metric"), date: metric.date,
      weightKg: optionalPositiveMetric(metric.weightKg),
      waistCm: optionalPositiveMetric(metric.waistCm),
      chestCm: optionalPositiveMetric(metric.chestCm),
      hipsCm: optionalPositiveMetric(metric.hipsCm),
      armCm: optionalPositiveMetric(metric.armCm),
      thighCm: optionalPositiveMetric(metric.thighCm)
    };
    await addBodyMetric(bodyMetric);
    setMetricOpen(false);
  };

  const metricText = (value: number | undefined) => value === undefined ? "" : String(value);
  const openNewMetric = () => {
    setEditingMetricId(undefined);
    setMetric({ date: new Date().toISOString().slice(0, 10), weightKg: profile.weightKg ? String(profile.weightKg) : "", waistCm: "", chestCm: "", hipsCm: "", armCm: "", thighCm: "" });
    setMetricOpen(true);
  };
  const openMetricEdit = (entry: BodyMetric) => {
    setEditingMetricId(entry.id);
    setMetric({ date: entry.date, weightKg: metricText(entry.weightKg), waistCm: metricText(entry.waistCm), chestCm: metricText(entry.chestCm), hipsCm: metricText(entry.hipsCm), armCm: metricText(entry.armCm), thighCm: metricText(entry.thighCm) });
    setMetricOpen(true);
  };

  return (
    <div className="page progress-page">
      <header className="page-header">
        <div><span className="eyebrow">{locale === "vi" ? "Dữ liệu của riêng bạn" : "Your data, your trend"}</span><h1>{locale === "vi" ? "Tiến độ" : "Progress"}</h1><p>{locale === "vi" ? "Mức tạ và PR được tách riêng theo đúng máy hoặc dụng cụ bạn đã dùng." : "Loads and PRs stay separate for the exact machine or equipment used."}</p></div>
        <Button onClick={openNewMetric}><Plus size={18} />{locale === "vi" ? "Thêm số đo" : "Add measurement"}</Button>
      </header>

      <div className="progress-stats">
        <Card><span className="progress-stat__icon"><CalendarDays size={20} /></span><div><span>{locale === "vi" ? "Buổi đã tập" : "Workouts"}</span><strong>{sessions.length}</strong></div><small>{locale === "vi" ? "toàn thời gian" : "all time"}</small></Card>
        <Card><span className="progress-stat__icon"><Activity size={20} /></span><div><span>{locale === "vi" ? "Set chính" : "Working sets"}</span><strong>{totalSets}</strong></div><small>{locale === "vi" ? "đã hoàn tất" : "completed"}</small></Card>
        <Card><span className="progress-stat__icon"><Dumbbell size={20} /></span><div><span>{locale === "vi" ? "Volume tải ngoài" : "External-load volume"}</span><strong>{formatNumber(totalVolume, locale, 0)}</strong></div><small>{locale === "vi" ? "kg·reps · không tính warm-up" : "kg·reps · warm-ups excluded"}</small></Card>
        <Card className="progress-stat--accent"><span className="progress-stat__icon"><Trophy size={20} /></span><div><span>{locale === "vi" ? "Biến thể có e1RM" : "Variants with e1RM"}</span><strong>{e1rmVariantCount || "—"}</strong></div><small>{locale === "vi" ? "PR được tách theo đúng biến thể" : "PRs stay exact-variation only"}</small></Card>
      </div>

      <div className="progress-range" role="group" aria-label={locale === "vi" ? "Khoảng thời gian của biểu đồ" : "Chart time range"}>
        <span>{locale === "vi" ? "Khoảng thời gian" : "Time range"}</span>
        <div>{RANGES.map((item) => <Chip key={item.key} active={item.key === rangeKey} onClick={() => setRangeKey(item.key)}>{item.label[locale]}</Chip>)}</div>
      </div>

      <div className="progress-insights-grid">
        <Card className="activity-calendar-card">
          <SectionTitle eyebrow={locale === "vi" ? "28 ngày gần nhất" : "Last 28 days"} title={locale === "vi" ? "Lịch hoạt động" : "Activity calendar"} />
          <ol className="activity-calendar" aria-label={locale === "vi" ? "Hoạt động tập luyện trong 28 ngày gần nhất" : "Workout activity over the last 28 days"}>
            {calendarDays.map((day) => {
              const date = new Date(`${day.date}T12:00:00`);
              const level = day.completedWorkingSets === 0 ? 0 : Math.max(1, Math.ceil((day.completedWorkingSets / maxCalendarSets) * 4));
              const readableDate = formatDate(day.date, locale, { weekday: "short", day: "numeric", month: "short" });
              const activityLabel = locale === "vi"
                ? `${readableDate}: ${day.sessions} buổi, ${day.completedWorkingSets} set chính, ${day.durationMinutes} phút, ${formatNumber(day.externalLoadVolumeKg, locale, 0)} kg·reps`
                : `${readableDate}: ${day.sessions} workouts, ${day.completedWorkingSets} working sets, ${day.durationMinutes} minutes, ${formatNumber(day.externalLoadVolumeKg, locale, 0)} kg·reps`;
              return (
                <li key={day.date} className={`activity-day activity-day--${level}`} title={activityLabel} aria-label={activityLabel}>
                  <span>{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { weekday: "narrow" }).format(date)}</span>
                  <time dateTime={day.date}>{date.getDate()}</time>
                  {day.sessions > 0 ? <i aria-hidden="true">{day.sessions}</i> : null}
                </li>
              );
            })}
          </ol>
          <div className="activity-calendar__legend" aria-hidden="true"><span>{locale === "vi" ? "Ít" : "Less"}</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`activity-day--${level}`} />)}<span>{locale === "vi" ? "Nhiều" : "More"}</span></div>
          <p className="fine-print">{locale === "vi" ? "Màu đậm hơn thể hiện nhiều set chính đã hoàn tất hơn trong ngày." : "Darker cells represent more completed working sets that day."}</p>
        </Card>

        <Card className="variant-trend-card">
          <div className="variant-trend-card__header">
            <SectionTitle eyebrow={locale === "vi" ? "Không trộn thiết bị" : "No equipment mixing"} title={locale === "vi" ? "Xu hướng đúng biến thể" : "Exact-variation trend"} />
            <label className="variant-trend-picker">
              <span>{locale === "vi" ? "Biến thể" : "Variation"}</span>
              <select value={selectedVariantId} onChange={(event) => setRequestedVariantId(event.target.value)} disabled={!variantSummaries.length}>
                {variantSummaries.map((summary) => {
                  const variant = getVariant(summary.variantId);
                  const snapshot = sessions.flatMap((session) => session.exercises).find((exercise) => exercise.variantId === summary.variantId);
                  const name = variant ? localize(variant.name, locale) : snapshot ? localize(snapshot.variantNameSnapshot, locale) : summary.variantId;
                  return <option key={summary.variantId} value={summary.variantId}>{name}</option>;
                })}
              </select>
            </label>
          </div>

          {selectedVariantId && variantTrend.length ? (
            <>
              <div className="chart-chips" role="group" aria-label={locale === "vi" ? "Chỉ số của biểu đồ bài tập" : "Exercise chart metric"}>
                {trendMetrics.map((item) => <Chip key={item.key} active={item.key === selectedTrendMetric.key} onClick={() => setRequestedTrendMetric(item.key)}>{item.short[locale]}</Chip>)}
              </div>
              <div className="variant-trend-summary">
                <div><span>{selectedTrendMetric.label[locale]}</span><strong>{latestVariantValue !== undefined ? `${formatNumber(latestVariantValue, locale, 1)} ${selectedTrendMetric.unit}` : "—"}</strong><small>{locale === "vi" ? "buổi gần nhất" : "latest session"}</small></div>
                <div><span>{locale === "vi" ? "Kỷ lục cá nhân" : "Personal record"}</span><strong>{variantRecordValue !== undefined ? `${formatNumber(variantRecordValue, locale, 1)} ${selectedTrendMetric.unit}` : "—"}</strong><small>{locale === "vi" ? `chỉ biến thể này · ${rangePrCount} PR trong kỳ` : `this variation only · ${rangePrCount} PRs in range`}</small></div>
                <div><span>{locale === "vi" ? "Thay đổi trong kỳ" : "Change in range"}</span><strong>{variantChange !== undefined ? `${signed(variantChange, locale)} ${selectedTrendMetric.unit}` : "—"}</strong><small>{variantChangePercent !== undefined ? `${signed(variantChangePercent, locale)}% · ` : ""}{variantTrendData.length} {locale === "vi" ? "buổi" : "sessions"}</small></div>
              </div>
              <p className="variant-trend-card__identity"><strong>{selectedVariantLabel}</strong>{selectedVariant?.equipment.length ? <span>{selectedVariant.equipment.map((equipment) => EQUIPMENT_OPTIONS.find((option) => option.id === equipment)?.name[locale]).filter(Boolean).join(" + ")}</span> : null}<span>{locale === "vi" ? "Toàn thời gian" : "All time"}: {formatNumber(selectedSummary?.externalLoadVolumeKg ?? 0, locale, 0)} kg·reps · {selectedSummary?.completedWorkingSets ?? 0} sets</span></p>
              {variantTrendData.length ? <>
                <p className="sr-only">{locale === "vi" ? `Xu hướng ${selectedTrendMetric.label.vi} của ${selectedVariantLabel} gồm ${variantTrendData.length} buổi.` : `${selectedTrendMetric.label.en} trend for ${selectedVariantLabel} contains ${variantTrendData.length} sessions.`}</p>
                <div className="variant-trend-chart" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%"><LineChart data={variantTrendData} margin={{ left: -15, right: 14, top: 12 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#d7d4ca" /><XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={axisTick} minTickGap={18} /><YAxis domain={["auto", "auto"]} axisLine={false} tickLine={false} tick={axisTick} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="value" name={`${selectedTrendMetric.label[locale]} (${selectedTrendMetric.unit})`} stroke="#708713" strokeWidth={2.5} dot={(props) => <PrDot key={props.key} cx={props.cx} cy={props.cy} payload={props.payload as { isMetricPr?: boolean }} />} connectNulls isAnimationActive={false} /></LineChart></ResponsiveContainer>
                </div>
                <p className="chart-legend" aria-hidden="true"><i className="chart-legend__pr" />{locale === "vi" ? "Kỷ lục mới của chỉ số đang chọn" : "New record for the selected metric"}</p>
              </> : <p className="chart-range-empty">{locale === "vi" ? "Không có buổi nào của biến thể này trong khoảng thời gian đã chọn." : "No sessions for this variation in the selected time range."}</p>}
              <div className="variant-trend-table-wrap">
                <table className="variant-trend-table">
                  <caption>{locale === "vi" ? `Dữ liệu từng buổi của ${selectedVariantLabel}` : `Per-session data for ${selectedVariantLabel}`}</caption>
                  <thead><tr><th scope="col">{locale === "vi" ? "Ngày" : "Date"}</th><th scope="col">{selectedTrendMetric.label[locale]}</th><th scope="col">Sets</th>{showVolumeColumn ? <th scope="col">Volume</th> : null}<th scope="col">PR</th></tr></thead>
                  <tbody>{[...variantTrendData].reverse().map((point) => {
                    const value = point.value;
                    const isPr = point.isMetricPr;
                    return <tr key={point.sessionId}><th scope="row">{formatDate(point.date, locale, { day: "2-digit", month: "short", year: "numeric" })}</th><td>{value !== undefined ? `${formatNumber(Number(value), locale, 1)} ${selectedTrendMetric.unit}` : "—"}</td><td>{point.completedWorkingSets}</td>{showVolumeColumn ? <td>{formatNumber(point.externalLoadVolumeKg, locale, 0)} kg·reps</td> : null}<td>{isPr ? <span className="pr-badge"><Trophy size={12} />PR</span> : "—"}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            </>
          ) : <EmptyState icon={<TrendingUp />} title={locale === "vi" ? "Chưa có xu hướng biến thể" : "No variation trend yet"} body={locale === "vi" ? "Hoàn tất set chính để theo dõi đúng máy hoặc dụng cụ đã dùng." : "Complete working sets to track the exact machine or equipment used."} />}
        </Card>
      </div>

      <div className="chart-grid chart-grid--weekly">
        <Card className="chart-card">
          <SectionTitle eyebrow={locale === "vi" ? `${weekly.length} tuần · ${range.label.vi}` : `${weekly.length} weeks · ${range.label.en}`} title={locale === "vi" ? "Tổng quan theo tuần" : "Weekly overview"} />
          {weeklyHasData ? <>
            <div className="chart-chips" role="group" aria-label={locale === "vi" ? "Chỉ số theo tuần" : "Weekly metric"}>
              {WEEKLY_METRICS.map((item) => <Chip key={item.key} active={item.key === weeklyMetricKey} onClick={() => setWeeklyMetricKey(item.key)}>{item.label[locale]}</Chip>)}
            </div>
            <dl className="chart-facts">
              <div><dt>{locale === "vi" ? "Tuần này" : "This week"}</dt><dd>{formatNumber(thisWeekValue, locale, 0)} {weeklyMetric.unit[locale]}</dd></div>
              <div><dt>{locale === "vi" ? "So với tuần trước" : "vs last week"}</dt><dd>{signed(thisWeekValue - previousWeekValue, locale, 0)}</dd></div>
              <div><dt>{locale === "vi" ? "Trung bình/tuần" : "Weekly average"}</dt><dd>{formatNumber(weeklyAverage, locale, 1)}</dd></div>
            </dl>
            <div className="chart-wrap chart-wrap--compact" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={weeklyData} margin={{ left: -15, right: 8, top: 12 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#d7d4ca" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} minTickGap={12} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={axisTick} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(24, 26, 21, .06)" }} /><Bar dataKey="value" name={`${weeklyMetric.label[locale]} (${weeklyMetric.unit[locale]})`} fill="#1d2018" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
            <table className="sr-only"><caption>{locale === "vi" ? `Dữ liệu ${weeklyMetric.label.vi} theo tuần` : `Weekly ${weeklyMetric.label.en} data`}</caption><thead><tr><th scope="col">{locale === "vi" ? "Tuần bắt đầu" : "Week starting"}</th><th scope="col">{weeklyMetric.label[locale]} ({weeklyMetric.unit[locale]})</th></tr></thead><tbody>{weeklyData.map((week) => <tr key={week.weekStart}><th scope="row">{week.label}</th><td>{formatNumber(week.value, locale, 0)}</td></tr>)}</tbody></table>
          </> : <EmptyState icon={<BarChart3 />} title={locale === "vi" ? "Chưa có buổi tập trong kỳ" : "No workouts in range"} body={locale === "vi" ? "Chọn khoảng thời gian dài hơn hoặc hoàn tất một buổi tập." : "Pick a longer time range or finish a workout."} />}
        </Card>
        <Card className="chart-card">
          <SectionTitle eyebrow={locale === "vi" ? "Set chính mỗi tuần" : "Working sets per week"} title={locale === "vi" ? "Nhóm cơ theo tuần" : "Muscle groups by week"} action={selectedMuscle ? <label className="variant-trend-picker"><span>{locale === "vi" ? "Nhóm cơ" : "Muscle"}</span><select value={selectedMuscle} onChange={(event) => setRequestedMuscle(event.target.value as MuscleGroup)}>{rankedMuscles.map(([muscle, count]) => <option key={muscle} value={muscle}>{muscleLabels[muscle][locale]} ({count})</option>)}</select></label> : undefined} />
          {selectedMuscle ? <>
            <dl className="chart-facts">
              <div><dt>{locale === "vi" ? "Tổng trong kỳ" : "Total in range"}</dt><dd>{muscleTotals[selectedMuscle]} sets</dd></div>
              <div><dt>{locale === "vi" ? "Tuần này" : "This week"}</dt><dd>{muscleWeeklyData.at(-1)?.sets ?? 0} sets</dd></div>
              <div><dt>{locale === "vi" ? "Trung bình/tuần" : "Weekly average"}</dt><dd>{formatNumber(muscleWeeklyAverage, locale, 1)}</dd></div>
            </dl>
            <div className="chart-wrap chart-wrap--compact" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={muscleWeeklyData} margin={{ left: -15, right: 8, top: 12 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#d7d4ca" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} minTickGap={12} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={axisTick} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(24, 26, 21, .06)" }} /><Bar dataKey="sets" name={`${muscleLabels[selectedMuscle][locale]} (sets)`} fill="#708713" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
            <table className="sr-only"><caption>{locale === "vi" ? `Số set ${muscleLabels[selectedMuscle].vi} theo tuần` : `Weekly ${muscleLabels[selectedMuscle].en} sets`}</caption><thead><tr><th scope="col">{locale === "vi" ? "Tuần bắt đầu" : "Week starting"}</th><th scope="col">Sets</th></tr></thead><tbody>{muscleWeeklyData.map((week) => <tr key={week.weekStart}><th scope="row">{week.label}</th><td>{week.sets}</td></tr>)}</tbody></table>
            <p className="fine-print">{locale === "vi" ? "Tính theo nhóm cơ chính của từng động tác; không phải khuyến nghị tập luyện." : "Counted by each movement's primary muscles; not programming advice."}</p>
          </> : <EmptyState icon={<Target />} title={locale === "vi" ? "Chưa có set trong kỳ" : "No sets in range"} body={locale === "vi" ? "Các set chính đã hoàn tất sẽ được gom theo nhóm cơ mỗi tuần." : "Completed working sets are grouped by muscle each week."} />}
        </Card>
      </div>

      <div className="chart-grid">
        <Card className="chart-card">
          <SectionTitle eyebrow={locale === "vi" ? "10 buổi gần nhất" : "Last 10 sessions"} title={locale === "vi" ? "Volume tải ngoài" : "External-load volume"} />
          {volumeData.length ? <>
            <p className="sr-only">{locale === "vi" ? `Biểu đồ gồm ${volumeData.length} buổi. Buổi gần nhất có volume tải ngoài ${formatNumber(volumeData.at(-1)?.volume ?? 0, locale, 0)} kg·reps.` : `Chart contains ${volumeData.length} sessions. The latest external-load volume is ${formatNumber(volumeData.at(-1)?.volume ?? 0, locale, 0)} kg·reps.`}</p>
            <div className="chart-wrap" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><AreaChart data={volumeData} margin={{ left: -15, right: 8, top: 12 }}><defs><linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d9ff58" stopOpacity={0.7} /><stop offset="100%" stopColor="#d9ff58" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#d7d4ca" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#77786f" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#77786f" }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #d7d4ca", background: "#fffdf8" }} /><Area type="monotone" dataKey="volume" stroke="#1d2018" strokeWidth={2.5} fill="url(#volumeFill)" /></AreaChart></ResponsiveContainer></div>
            <table className="sr-only"><caption>{locale === "vi" ? "Dữ liệu volume tải ngoài" : "External-load volume data"}</caption><thead><tr><th scope="col">{locale === "vi" ? "Ngày" : "Date"}</th><th scope="col">{locale === "vi" ? "Volume (kg·reps)" : "Volume (kg·reps)"}</th></tr></thead><tbody>{volumeData.map((entry, index) => <tr key={`${entry.date}-${index}`}><th scope="row">{entry.date}</th><td>{formatNumber(entry.volume, locale, 0)}</td></tr>)}</tbody></table>
          </> : <EmptyState icon={<BarChart3 />} title={locale === "vi" ? "Chưa có volume" : "No volume data"} body={locale === "vi" ? "Hoàn tất set có mức tạ và số lần để xem biểu đồ." : "Complete weighted sets to see this chart."} />}
        </Card>
        <Card className="chart-card">
          <SectionTitle eyebrow={locale === "vi" ? `Cơ thể · ${range.label.vi}` : `Body · ${range.label.en}`} title={locale === "vi" ? "Số đo cơ thể" : "Body measurements"} action={<button type="button" className="text-link" onClick={openNewMetric}><Plus size={15} />{locale === "vi" ? "Ghi số đo" : "Log"}</button>} />
          <div className="chart-chips" role="group" aria-label={locale === "vi" ? "Loại số đo" : "Measurement"}>
            {BODY_METRICS.map((item) => <Chip key={item.key} active={item.key === bodyMetricKey} onClick={() => setBodyMetricKey(item.key)}>{item.label[locale]}</Chip>)}
          </div>
          {bodyData.length ? <>
            <dl className={latestTrend !== undefined ? "chart-facts chart-facts--four" : "chart-facts"}>
              <div><dt>{locale === "vi" ? "Gần nhất" : "Latest"}</dt><dd>{formatNumber(bodyData.at(-1)!.value, locale, 1)} {bodyMetric.unit}</dd></div>
              {latestTrend !== undefined ? <div><dt>{locale === "vi" ? "Xu hướng" : "Trend"}</dt><dd>{formatNumber(latestTrend, locale, 1)} {bodyMetric.unit}</dd></div> : null}
              <div><dt>{locale === "vi" ? "Thay đổi trong kỳ" : "Change in range"}</dt><dd>{bodyChange !== undefined ? `${signed(bodyChange, locale)} ${bodyMetric.unit}` : "—"}</dd></div>
              <div><dt>{locale === "vi" ? "Thấp nhất – cao nhất" : "Low – high"}</dt><dd>{formatNumber(Math.min(...bodyData.map((point) => point.value)), locale, 1)} – {formatNumber(Math.max(...bodyData.map((point) => point.value)), locale, 1)}</dd></div>
            </dl>
            <p className="sr-only">{locale === "vi" ? `Biểu đồ ${bodyMetric.label.vi} gồm ${bodyData.length} số đo. Số đo gần nhất là ${formatNumber(bodyData.at(-1)!.value, locale, 1)} ${bodyMetric.unit}.` : `${bodyMetric.label.en} chart contains ${bodyData.length} measurements. The latest is ${formatNumber(bodyData.at(-1)!.value, locale, 1)} ${bodyMetric.unit}.`}</p>
            <div className="chart-wrap chart-wrap--compact" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={bodyData} margin={{ left: -15, right: 14, top: 12 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#d7d4ca" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} minTickGap={18} /><YAxis domain={["dataMin - 2", "dataMax + 2"]} axisLine={false} tickLine={false} tick={axisTick} /><Tooltip contentStyle={tooltipStyle} />{showWeightTrend
                ? <><Line type="linear" dataKey="value" name={locale === "vi" ? "Cân thực tế (kg)" : "Scale weight (kg)"} stroke="#c9c5b8" strokeWidth={1} dot={{ r: 3, fill: "#a9a595", strokeWidth: 0 }} isAnimationActive={false} /><Line type="monotone" dataKey="trend" name={locale === "vi" ? "Xu hướng (kg)" : "Trend (kg)"} stroke="#ff6c4a" strokeWidth={2.5} dot={false} isAnimationActive={false} /></>
                : <Line type="monotone" dataKey="value" name={`${bodyMetric.label[locale]} (${bodyMetric.unit})`} stroke="#ff6c4a" strokeWidth={2.5} dot={{ r: 4, fill: "#ff6c4a", strokeWidth: 0 }} isAnimationActive={false} />}</LineChart></ResponsiveContainer></div>
            <table className="sr-only"><caption>{locale === "vi" ? `Dữ liệu ${bodyMetric.label.vi}` : `${bodyMetric.label.en} data`}</caption><thead><tr><th scope="col">{locale === "vi" ? "Ngày" : "Date"}</th><th scope="col">{bodyMetric.label[locale]} ({bodyMetric.unit})</th>{showWeightTrend ? <th scope="col">{locale === "vi" ? "Xu hướng (kg)" : "Trend (kg)"}</th> : null}</tr></thead><tbody>{bodyData.map((entry, index) => <tr key={`${entry.date}-${index}`}><th scope="row">{entry.label}</th><td>{formatNumber(entry.value, locale, 1)}</td>{entry.trend !== undefined ? <td>{formatNumber(entry.trend, locale, 1)}</td> : null}</tr>)}</tbody></table>
            {showWeightTrend ? <p className="fine-print">{locale === "vi" ? "Đường cam là xu hướng đã làm mượt (mỗi ngày dịch 10% về phía số cân mới), giúp bỏ qua dao động nước và thức ăn hằng ngày. Chấm xám là số cân thực tế." : "The orange line is the smoothed trend (it moves 10% toward each new weigh-in per day), which filters out daily water and food swings. Grey dots are scale readings."}</p> : null}
          </> : <EmptyState icon={<Scale />} title={locale === "vi" ? `Chưa có số đo ${bodyMetric.label.vi.toLowerCase()} trong kỳ` : `No ${bodyMetric.label.en.toLowerCase()} entries in range`} body={locale === "vi" ? "Thêm số đo để tạo đường xu hướng." : "Add a measurement to start the trend."} />}
          <BodyMetricLog metrics={bodyMetrics} locale={locale} onEdit={openMetricEdit} />
        </Card>
        <CalorieTargetCard trend={weightTrendPoints} />
      </div>

      <div className="progress-detail-grid">
        <section>
          <SectionTitle eyebrow={locale === "vi" ? "Tuần hiện tại" : "Current week"} title={locale === "vi" ? "Working sets theo nhóm cơ" : "Working sets by muscle"} />
          <Card className="muscle-volume">
            {Object.keys(muscleSets).length ? Object.entries(muscleSets).sort(([, a], [, b]) => Number(b) - Number(a)).map(([muscle, count]) => <div className="muscle-row" key={muscle}><span>{muscleLabels[muscle as MuscleGroup][locale]}</span><div aria-hidden="true"><i style={{ width: `${(Number(count) / maxMuscleSets) * 100}%` }} /></div><strong><span className="sr-only">{locale === "vi" ? "Số set: " : "Sets: "}</span>{count}</strong></div>) : <EmptyState icon={<Target />} title={locale === "vi" ? "Tuần mới đang chờ" : "A fresh week"} body={locale === "vi" ? "Các set hoàn tất sẽ xuất hiện ở đây theo nhóm cơ chính." : "Completed sets will appear here by primary muscle."} />}
            <p className="fine-print">{locale === "vi" ? "Đây là số set, không phải khuyến nghị y tế hay giáo án cá nhân hóa." : "These are logged sets, not medical or individualized programming advice."}</p>
          </Card>
        </section>

        <section>
          <SectionTitle eyebrow={locale === "vi" ? "Lịch sử" : "History"} title={locale === "vi" ? "Các buổi gần đây" : "Recent workouts"} />
          <div className="history-list">
            {sessions.slice(0, historyLimit).map((session) => {
              const open = expandedSession === session.id;
              const sessionName = session.routineNameSnapshot ? localize(session.routineNameSnapshot, locale) : (locale === "vi" ? "Buổi tập" : "Workout");
              return <Card className={open ? "history-card history-card--open" : "history-card"} key={session.id}><button type="button" className="history-card__head" aria-expanded={open} aria-controls={`${session.id}-details`} onClick={() => setExpandedSession(open ? undefined : session.id)}><span className="history-card__date"><strong>{new Date(session.finishedAt!).getDate()}</strong><small>{formatDate(session.finishedAt!, locale, { month: "short" })}</small></span><div><h3>{sessionName}</h3><p>{session.exercises.length} {locale === "vi" ? "động tác" : "exercises"} · {formatNumber(sessionExternalVolume(session), locale, 0)} kg·reps</p></div><ChevronDown size={19} /></button>{open ? <ul id={`${session.id}-details`}>{session.exercises.map((exercise) => <li key={exercise.id}><div><strong>{localize(exercise.variantNameSnapshot, locale)}</strong><small>{exercise.sets.filter((set) => set.completedAt && set.type !== "warmup").length} sets</small></div><span>{completedPerformanceLabel(exercise, locale)}</span></li>)}</ul> : null}{open && session.notes ? <p className="history-card__note">{session.notes}</p> : null}{open ? <div className="history-card__actions"><Button variant="secondary" size="sm" onClick={() => setEditingSession(session)}><Pencil size={15} aria-hidden="true" />{locale === "vi" ? "Sửa buổi tập" : "Edit workout"}</Button><Button variant="danger" size="sm" onClick={() => setDeletingSession(session)}><Trash2 size={15} aria-hidden="true" />{locale === "vi" ? "Xóa buổi tập" : "Delete workout"}</Button></div> : null}</Card>;
            })}
            {sessions.length > historyLimit ? <button type="button" className="text-link" onClick={() => setHistoryLimit((limit) => limit + 20)}>{locale === "vi" ? `Xem thêm buổi cũ hơn (còn ${sessions.length - historyLimit})` : `Show older workouts (${sessions.length - historyLimit} more)`}</button> : null}
            {!sessions.length ? <EmptyState icon={<TrendingUp />} title={locale === "vi" ? "Chưa có buổi đã lưu" : "No finished workouts"} body={locale === "vi" ? "Kết thúc buổi tập đầu tiên để bắt đầu theo dõi tiến độ." : "Finish your first workout to begin tracking progress."} /> : null}
          </div>
        </section>
      </div>

      {editingSession ? <SessionEditModal key={editingSession.id} session={editingSession} locale={locale} onClose={() => setEditingSession(undefined)} /> : null}
      {deletingSession ? <ConfirmDeleteModal locale={locale} title={locale === "vi" ? "Xóa buổi tập?" : "Delete workout?"} body={locale === "vi" ? `Buổi tập ngày ${formatDate(deletingSession.finishedAt!, locale, { day: "2-digit", month: "2-digit", year: "numeric" })} và mọi set trong đó sẽ bị xóa khỏi thiết bị này. Biểu đồ và kỷ lục sẽ được tính lại. Không thể hoàn tác.` : `The workout from ${formatDate(deletingSession.finishedAt!, locale, { day: "2-digit", month: "2-digit", year: "numeric" })} and all its sets will be removed from this device. Charts and records are recalculated. This cannot be undone.`} onConfirm={() => removePastSession(deletingSession.id)} onClose={() => setDeletingSession(undefined)} /> : null}
      <Modal open={metricOpen} title={editingMetricId ? (locale === "vi" ? "Sửa số đo cơ thể" : "Edit body measurement") : (locale === "vi" ? "Thêm số đo cơ thể" : "Add body measurement")} onClose={() => setMetricOpen(false)}>
        <div className="metric-form">
          <Field label={locale === "vi" ? "Ngày" : "Date"}><input type="date" value={metric.date} onChange={(event) => setMetric((value) => ({ ...value, date: event.target.value }))} /></Field>
          <div className="form-grid"><Field label={locale === "vi" ? "Cân nặng (kg)" : "Weight (kg)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.weightKg} onChange={(event) => setMetric((value) => ({ ...value, weightKg: event.target.value }))} /></Field><Field label={locale === "vi" ? "Eo (cm)" : "Waist (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.waistCm} onChange={(event) => setMetric((value) => ({ ...value, waistCm: event.target.value }))} /></Field><Field label={locale === "vi" ? "Ngực (cm)" : "Chest (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.chestCm} onChange={(event) => setMetric((value) => ({ ...value, chestCm: event.target.value }))} /></Field><Field label={locale === "vi" ? "Hông (cm)" : "Hips (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.hipsCm} onChange={(event) => setMetric((value) => ({ ...value, hipsCm: event.target.value }))} /></Field><Field label={locale === "vi" ? "Bắp tay (cm)" : "Arm (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.armCm} onChange={(event) => setMetric((value) => ({ ...value, armCm: event.target.value }))} /></Field><Field label={locale === "vi" ? "Đùi (cm)" : "Thigh (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.thighCm} onChange={(event) => setMetric((value) => ({ ...value, thighCm: event.target.value }))} /></Field></div>
          <div className="modal-actions"><Button variant="ghost" onClick={() => setMetricOpen(false)}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={!metric.date || !hasValidMetric} onClick={() => void saveMetric()}>{locale === "vi" ? "Lưu số đo" : "Save measurement"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
