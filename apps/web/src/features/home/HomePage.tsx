import { ArrowRight, CalendarCheck, ChevronRight, Clock3, Dumbbell, Flame, Play, Salad, ShieldCheck, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, MetricRing, ProgressBar, SectionTitle } from "@gym/ui";
import { dailyNutrition, nutritionTargetNeedsConfirmation, type NutritionEstimateInput } from "@gym/nutrition";
import { useState } from "react";
import type { Goal } from "@gym/contracts";
import { sessionProgress } from "@gym/workouts";
import { planEngineSession } from "@gym/workouts/autoregulation-week";
import { DEFAULT_PROGRESSION_RULE, createAdaptiveSessionFromRoutine, planAdaptiveSession, planTrainingWeek } from "@gym/workouts/plan";
import { RecoveryMapCard } from "./RecoveryMapCard";
import { TrainingPlanCard } from "./TrainingPlanCard";
import { localize, formatDate } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";

const goalLabels: Record<Goal, { vi: string; en: string }> = {
  hypertrophy: { vi: "Tăng cơ", en: "Hypertrophy" },
  strength: { vi: "Sức mạnh", en: "Strength" },
  fat_loss: { vi: "Giảm mỡ", en: "Fat loss" },
  general: { vi: "Tổng quát", en: "General" }
};

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(): Date {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
}

export function HomePage() {
  const navigate = useNavigate();
  const profile = useGymStore((state) => state.profile)!;
  const routines = useGymStore((state) => state.routines);
  const programs = useGymStore((state) => state.programs);
  const settings = useGymStore((state) => state.settings);
  const sessions = useGymStore((state) => state.sessions);
  const meals = useGymStore((state) => state.meals);
  const activeSession = useGymStore((state) => state.activeSession);
  const startWorkout = useGymStore((state) => state.startWorkout);
  const locale = profile.locale;
  const today = localDate();
  const nutrition = dailyNutrition(meals, today);
  const nutritionInput: NutritionEstimateInput | undefined = profile.age && profile.heightCm && profile.weightKg && profile.activityFactor
    && (profile.biologicalSex === "female" || profile.biologicalSex === "male")
    ? { age: profile.age, heightCm: profile.heightCm, weightKg: profile.weightKg, activityFactor: profile.activityFactor, biologicalSex: profile.biologicalSex, goal: profile.goal }
    : undefined;
  const target = nutritionTargetNeedsConfirmation(profile.nutritionTarget, nutritionInput) ? undefined : profile.nutritionTarget;
  const targetNeedsReview = Boolean(profile.nutritionTarget && !target);
  const targetNeverConfirmed = targetNeedsReview && !profile.nutritionTarget?.confirmedAt;
  const weekStart = startOfWeek();
  const weeklySessions = sessions.filter((session) => session.finishedAt && new Date(session.finishedAt) >= weekStart);
  const weeklySets = weeklySessions.reduce((total, session) => total + session.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completedAt && set.type !== "warmup").length, 0);
  const activeProgram = programs.find((program) => program.id === settings.activeProgramId);
  const activeProgramDays = activeProgram ? [...activeProgram.days].sort((left, right) => left.order - right.order) : [];
  const activeProgramDay = activeProgramDays[activeProgram?.activeDayIndex ?? 0];
  const programmedRoutine = activeProgramDay
    ? routines.find((routine) => routine.id === activeProgramDay.routineId)
    : undefined;
  const nextRoutine = programmedRoutine ?? routines[weeklySessions.length % Math.max(1, routines.length)];
  const recent = sessions.find((session) => session.finishedAt);
  const progress = activeSession ? sessionProgress(activeSession) : undefined;

  const [applyAdjustments, setApplyAdjustments] = useState(true);
  const rule = activeProgram?.progressionRule ?? DEFAULT_PROGRESSION_RULE;
  const sessionPlan = nextRoutine ? planEngineSession(planAdaptiveSession(nextRoutine, sessions, rule), nextRoutine, sessions) : undefined;
  const programStart = activeProgram ? Math.min(activeProgram.activeDayIndex, Math.max(0, activeProgramDays.length - 1)) : 0;
  const routineStart = weeklySessions.length % Math.max(1, routines.length);
  const upcomingRoutineIds = programmedRoutine
    ? activeProgramDays.map((_, index) => activeProgramDays[(programStart + index) % activeProgramDays.length].routineId)
    : routines.map((_, index) => routines[(routineStart + index) % routines.length].id);
  const weekPlan = planTrainingWeek({ daysPerWeek: profile.daysPerWeek, sessions, upcomingRoutineIds });

  const begin = async () => {
    if (!nextRoutine) return navigate("/routines");
    await startWorkout(nextRoutine, programmedRoutine ? activeProgram?.id : undefined, applyAdjustments && sessionPlan?.routineId === nextRoutine.id
      ? (routine, locationId) => createAdaptiveSessionFromRoutine(routine, sessionPlan, locationId)
      : undefined);
    navigate("/workout");
  };

  return (
    <div className="page home-page">
      <header className="page-header home-header">
        <div>
          <span className="eyebrow">{formatDate(new Date(), locale)}</span>
          <h1>{locale === "vi" ? `Chào ${profile.displayName},` : `Hey ${profile.displayName},`}<br /><em>{locale === "vi" ? "hôm nay mình tập gì?" : "what are we training?"}</em></h1>
        </div>
        <div className="local-badge"><ShieldCheck size={17} /><span>{locale === "vi" ? "Riêng tư · Offline" : "Private · Offline"}</span></div>
      </header>

      {activeSession ? (
        <Card className="active-workout-banner">
          <div className="active-workout-banner__pulse"><Dumbbell size={24} /></div>
          <div className="active-workout-banner__content">
            <span className="eyebrow">{locale === "vi" ? "Buổi tập đang diễn ra" : "Workout in progress"}</span>
            <h2>{activeSession.routineNameSnapshot ? localize(activeSession.routineNameSnapshot, locale) : "Workout"}</h2>
            <div className="active-workout-banner__meta"><span>{progress?.completed}/{progress?.total} sets</span><span>{progress?.percent}%</span></div>
            <ProgressBar value={progress?.percent ?? 0} />
          </div>
          <Button onClick={() => navigate("/workout")}>{locale === "vi" ? "Tiếp tục" : "Resume"}<ArrowRight size={18} /></Button>
        </Card>
      ) : (
        <Card className="workout-hero">
          <div className="workout-hero__stamp"><span>{weeklySessions.length}</span><small>/{profile.daysPerWeek}<br />{locale === "vi" ? "buổi tuần này" : "this week"}</small></div>
          <div className="workout-hero__copy">
            <span className="eyebrow">{activeProgram
              ? `${localize(activeProgram.name, locale)} · ${locale === "vi" ? "Ngày" : "Day"} ${(activeProgram?.activeDayIndex ?? 0) + 1}/${activeProgramDays.length}`
              : (locale === "vi" ? "Gợi ý tiếp theo" : "Up next")}</span>
            <h2>{nextRoutine ? localize(nextRoutine.name, locale) : (locale === "vi" ? "Chọn lịch tập đầu tiên" : "Choose your first routine")}</h2>
            <p>{nextRoutine ? `${nextRoutine.items.length} ${locale === "vi" ? "động tác" : "movements"} · ${goalLabels[nextRoutine.goal][locale]}` : (locale === "vi" ? "Kho lịch có sẵn nhiều chương trình miễn phí." : "Pick from the included free programs.")}</p>
            <Button size="lg" onClick={() => void begin()}><Play size={18} fill="currentColor" />{locale === "vi" ? "Bắt đầu tập" : "Start workout"}</Button>
          </div>
          <div className="workout-hero__art" aria-hidden="true">
            <span className="plate plate--one" /><span className="plate plate--two" /><span className="barbell-line" />
            <strong>MOVE<br />WITH<br />INTENT</strong>
          </div>
        </Card>
      )}

      {!activeSession && nextRoutine && sessionPlan ? (
        <TrainingPlanCard
          locale={locale}
          routines={routines}
          weekPlan={weekPlan}
          sessionPlan={sessionPlan}
          applyAdjustments={applyAdjustments}
          onApplyAdjustmentsChange={setApplyAdjustments}
        />
      ) : null}

      <RecoveryMapCard locale={locale} sessions={sessions} />

      <div className="dashboard-grid">
        <section>
          <SectionTitle eyebrow={locale === "vi" ? "Tổng quan" : "Overview"} title={locale === "vi" ? "Nhịp tuần này" : "This week's rhythm"} />
          <div className="stat-cards">
            <Card className="stat-card stat-card--dark"><span className="stat-card__icon"><CalendarCheck size={20} /></span><strong>{weeklySessions.length}</strong><p>{locale === "vi" ? "buổi hoàn tất" : "sessions done"}</p><small>{Math.max(0, profile.daysPerWeek - weeklySessions.length)} {locale === "vi" ? "buổi còn lại" : "remaining"}</small></Card>
            <Card className="stat-card"><span className="stat-card__icon"><Flame size={20} /></span><strong>{weeklySets}</strong><p>{locale === "vi" ? "set chính" : "working sets"}</p><small>{locale === "vi" ? "Tính theo nhóm cơ chính" : "Primary muscles only"}</small></Card>
            <Card className="stat-card"><span className="stat-card__icon"><Trophy size={20} /></span><strong>{sessions.filter((item) => item.finishedAt).length}</strong><p>{locale === "vi" ? "tổng số buổi" : "all-time sessions"}</p><small>{recent ? formatDate(recent.finishedAt!, locale, { day: "numeric", month: "short" }) : (locale === "vi" ? "Bắt đầu hôm nay" : "Start today")}</small></Card>
          </div>
        </section>

        <section>
          <SectionTitle eyebrow={locale === "vi" ? "Nhiên liệu" : "Fuel"} title={locale === "vi" ? "Dinh dưỡng hôm nay" : "Today's nutrition"} action={<button className="text-link" onClick={() => navigate("/nutrition")}>{locale === "vi" ? "Chi tiết" : "Details"}<ChevronRight size={16} /></button>} />
          <Card className="nutrition-card">
            {target ? (
              <div className="ring-row">
                <MetricRing value={nutrition.calories} max={target.calories} label="Calories" unit="kcal" />
                <MetricRing value={nutrition.protein} max={target.protein} label="Protein" unit="g" tone="coral" />
                <MetricRing value={nutrition.carbs} max={target.carbs} label="Carbs" unit="g" tone="sky" />
                <MetricRing value={nutrition.fat} max={target.fat} label="Fat" unit="g" tone="gold" />
              </div>
            ) : (
              <button className="nutrition-empty" onClick={() => navigate("/settings")}><Salad size={28} /><span><strong>{targetNeedsReview
                ? (targetNeverConfirmed ? (locale === "vi" ? "Xác nhận mục tiêu dinh dưỡng" : "Confirm your nutrition target") : (locale === "vi" ? "Kiểm tra lại mục tiêu dinh dưỡng" : "Review your nutrition target"))
                : (locale === "vi" ? "Thiết lập mục tiêu dinh dưỡng" : "Set a nutrition target")}</strong><small>{targetNeedsReview
                ? (targetNeverConfirmed ? (locale === "vi" ? "Xem số ước tính và lưu trong Cài đặt" : "Check the estimate and save it in Settings") : (locale === "vi" ? "Thông tin hoặc công thức đã thay đổi" : "Your inputs or formula changed"))
                : (locale === "vi" ? "Calories, macro và nước uống" : "Calories, macros, and hydration")}</small></span><ChevronRight size={20} /></button>
            )}
          </Card>
        </section>
      </div>

      {recent ? (
        <section className="recent-section">
          <SectionTitle eyebrow={locale === "vi" ? "Gần đây" : "Recent"} title={locale === "vi" ? "Buổi tập cuối" : "Last session"} />
          <Card className="recent-session">
            <div className="recent-session__date"><span>{new Date(recent.finishedAt!).getDate()}</span><small>{formatDate(recent.finishedAt!, locale, { month: "short" })}</small></div>
            <div><h3>{recent.routineNameSnapshot ? localize(recent.routineNameSnapshot, locale) : "Workout"}</h3><p>{recent.exercises.length} {locale === "vi" ? "động tác" : "exercises"} · {recent.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completedAt).length} sets</p></div>
            <span className="duration-pill"><Clock3 size={15} />{Math.max(1, Math.round((new Date(recent.finishedAt!).getTime() - new Date(recent.startedAt).getTime()) / 60000))} min</span>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
