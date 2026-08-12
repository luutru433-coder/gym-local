import { useState } from "react";
import { Activity, BarChart3, CalendarDays, ChevronDown, Dumbbell, Plus, Scale, Target, TrendingUp, Trophy } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, EmptyState, Field, Modal, SectionTitle } from "@gym/ui";
import { createId, type BodyMetric, type MuscleGroup, type SessionExercise } from "@gym/contracts";
import { getTrackingProfile, trackingProfileForLoadMode } from "@gym/catalog";
import { personalRecord, sessionExternalVolume, weeklyMuscleSets } from "@gym/progress";
import { formatDate, formatNumber, localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";

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
  if (profile.effortKind === "distance_duration") return `${Math.max(0, ...sets.map((set) => set.distanceMeters ?? 0))}m`;
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

export function ProgressPage() {
  const profile = useGymStore((state) => state.profile)!;
  const sessions = useGymStore((state) => state.sessions).filter((session) => session.finishedAt);
  const bodyMetrics = useGymStore((state) => state.bodyMetrics);
  const addBodyMetric = useGymStore((state) => state.addBodyMetric);
  const locale = profile.locale;
  const [metricOpen, setMetricOpen] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string>();
  const [metric, setMetric] = useState({ date: new Date().toISOString().slice(0, 10), weightKg: profile.weightKg ? String(profile.weightKg) : "", waistCm: "", chestCm: "", hipsCm: "", armCm: "", thighCm: "" });

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
  const weightData = bodyMetrics.filter((entry) => entry.weightKg).slice(-12).map((entry) => ({
    date: new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { day: "2-digit", month: "2-digit" }).format(new Date(entry.date)),
    weight: entry.weightKg
  }));
  const hasValidMetric = [metric.weightKg, metric.waistCm, metric.chestCm, metric.hipsCm, metric.armCm, metric.thighCm]
    .some((value) => optionalPositiveMetric(value) !== undefined);

  const saveMetric = async () => {
    const bodyMetric: BodyMetric = {
      id: createId("metric"), date: metric.date,
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

  return (
    <div className="page progress-page">
      <header className="page-header">
        <div><span className="eyebrow">{locale === "vi" ? "Dữ liệu của riêng bạn" : "Your data, your trend"}</span><h1>{locale === "vi" ? "Tiến độ" : "Progress"}</h1><p>{locale === "vi" ? "Mức tạ và PR được tách riêng theo đúng máy hoặc dụng cụ bạn đã dùng." : "Loads and PRs stay separate for the exact machine or equipment used."}</p></div>
        <Button onClick={() => setMetricOpen(true)}><Plus size={18} />{locale === "vi" ? "Thêm số đo" : "Add measurement"}</Button>
      </header>

      <div className="progress-stats">
        <Card><span className="progress-stat__icon"><CalendarDays size={20} /></span><div><span>{locale === "vi" ? "Buổi đã tập" : "Workouts"}</span><strong>{sessions.length}</strong></div><small>{locale === "vi" ? "toàn thời gian" : "all time"}</small></Card>
        <Card><span className="progress-stat__icon"><Activity size={20} /></span><div><span>{locale === "vi" ? "Set chính" : "Working sets"}</span><strong>{totalSets}</strong></div><small>{locale === "vi" ? "đã hoàn tất" : "completed"}</small></Card>
        <Card><span className="progress-stat__icon"><Dumbbell size={20} /></span><div><span>{locale === "vi" ? "Volume tải ngoài" : "External-load volume"}</span><strong>{formatNumber(totalVolume, locale, 0)}</strong></div><small>{locale === "vi" ? "kg·reps · không tính warm-up" : "kg·reps · warm-ups excluded"}</small></Card>
        <Card className="progress-stat--accent"><span className="progress-stat__icon"><Trophy size={20} /></span><div><span>{locale === "vi" ? "Biến thể có e1RM" : "Variants with e1RM"}</span><strong>{e1rmVariantCount || "—"}</strong></div><small>{locale === "vi" ? "PR được tách theo đúng biến thể" : "PRs stay exact-variation only"}</small></Card>
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
          <SectionTitle eyebrow={locale === "vi" ? "Cơ thể" : "Body"} title={locale === "vi" ? "Cân nặng" : "Body weight"} action={<button type="button" className="text-link" onClick={() => setMetricOpen(true)}><Plus size={15} />{locale === "vi" ? "Ghi số đo" : "Log"}</button>} />
          {weightData.length ? <>
            <p className="sr-only">{locale === "vi" ? `Biểu đồ gồm ${weightData.length} số đo. Số đo gần nhất là ${formatNumber(weightData.at(-1)?.weight ?? 0, locale, 1)} kg.` : `Chart contains ${weightData.length} measurements. The latest weight is ${formatNumber(weightData.at(-1)?.weight ?? 0, locale, 1)} kg.`}</p>
            <div className="chart-wrap" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={weightData} margin={{ left: -15, right: 14, top: 12 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#d7d4ca" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#77786f" }} /><YAxis domain={["dataMin - 2", "dataMax + 2"]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#77786f" }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #d7d4ca", background: "#fffdf8" }} /><Line type="monotone" dataKey="weight" stroke="#ff6c4a" strokeWidth={2.5} dot={{ r: 4, fill: "#ff6c4a", strokeWidth: 0 }} /></LineChart></ResponsiveContainer></div>
            <table className="sr-only"><caption>{locale === "vi" ? "Dữ liệu cân nặng" : "Body weight data"}</caption><thead><tr><th scope="col">{locale === "vi" ? "Ngày" : "Date"}</th><th scope="col">{locale === "vi" ? "Cân nặng (kg)" : "Weight (kg)"}</th></tr></thead><tbody>{weightData.map((entry, index) => <tr key={`${entry.date}-${index}`}><th scope="row">{entry.date}</th><td>{formatNumber(entry.weight ?? 0, locale, 1)}</td></tr>)}</tbody></table>
          </> : <EmptyState icon={<Scale />} title={locale === "vi" ? "Chưa có cân nặng" : "No weight entries"} body={locale === "vi" ? "Thêm số đo đầu tiên để tạo đường xu hướng." : "Add your first measurement to start the trend."} />}
        </Card>
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
            {sessions.slice(0, 8).map((session) => {
              const open = expandedSession === session.id;
              const sessionName = session.routineNameSnapshot ? localize(session.routineNameSnapshot, locale) : (locale === "vi" ? "Buổi tập" : "Workout");
              return <Card className={open ? "history-card history-card--open" : "history-card"} key={session.id}><button type="button" className="history-card__head" aria-expanded={open} aria-controls={`${session.id}-details`} onClick={() => setExpandedSession(open ? undefined : session.id)}><span className="history-card__date"><strong>{new Date(session.finishedAt!).getDate()}</strong><small>{formatDate(session.finishedAt!, locale, { month: "short" })}</small></span><div><h3>{sessionName}</h3><p>{session.exercises.length} {locale === "vi" ? "động tác" : "exercises"} · {formatNumber(sessionExternalVolume(session), locale, 0)} kg·reps</p></div><ChevronDown size={19} /></button>{open ? <ul id={`${session.id}-details`}>{session.exercises.map((exercise) => <li key={exercise.id}><div><strong>{localize(exercise.variantNameSnapshot, locale)}</strong><small>{exercise.sets.filter((set) => set.completedAt && set.type !== "warmup").length} sets</small></div><span>{completedPerformanceLabel(exercise, locale)}</span></li>)}</ul> : null}</Card>;
            })}
            {!sessions.length ? <EmptyState icon={<TrendingUp />} title={locale === "vi" ? "Chưa có buổi đã lưu" : "No finished workouts"} body={locale === "vi" ? "Kết thúc buổi tập đầu tiên để bắt đầu theo dõi tiến độ." : "Finish your first workout to begin tracking progress."} /> : null}
          </div>
        </section>
      </div>

      <Modal open={metricOpen} title={locale === "vi" ? "Thêm số đo cơ thể" : "Add body measurement"} onClose={() => setMetricOpen(false)}>
        <div className="metric-form">
          <Field label={locale === "vi" ? "Ngày" : "Date"}><input type="date" value={metric.date} onChange={(event) => setMetric((value) => ({ ...value, date: event.target.value }))} /></Field>
          <div className="form-grid"><Field label={locale === "vi" ? "Cân nặng (kg)" : "Weight (kg)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.weightKg} onChange={(event) => setMetric((value) => ({ ...value, weightKg: event.target.value }))} /></Field><Field label={locale === "vi" ? "Eo (cm)" : "Waist (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.waistCm} onChange={(event) => setMetric((value) => ({ ...value, waistCm: event.target.value }))} /></Field><Field label={locale === "vi" ? "Ngực (cm)" : "Chest (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.chestCm} onChange={(event) => setMetric((value) => ({ ...value, chestCm: event.target.value }))} /></Field><Field label={locale === "vi" ? "Hông (cm)" : "Hips (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.hipsCm} onChange={(event) => setMetric((value) => ({ ...value, hipsCm: event.target.value }))} /></Field><Field label={locale === "vi" ? "Bắp tay (cm)" : "Arm (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.armCm} onChange={(event) => setMetric((value) => ({ ...value, armCm: event.target.value }))} /></Field><Field label={locale === "vi" ? "Đùi (cm)" : "Thigh (cm)"}><input type="number" inputMode="decimal" min="0.1" step="0.1" value={metric.thighCm} onChange={(event) => setMetric((value) => ({ ...value, thighCm: event.target.value }))} /></Field></div>
          <div className="modal-actions"><Button variant="ghost" onClick={() => setMetricOpen(false)}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={!metric.date || !hasValidMetric} onClick={() => void saveMetric()}>{locale === "vi" ? "Lưu số đo" : "Save measurement"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
