import { Trophy } from "lucide-react";
import { Button, Card } from "@gym/ui";
import type { WorkoutSession } from "@gym/contracts";
import { sessionVolumeMetrics, type SessionRecordSet } from "@gym/progress";
import { timingSummary } from "@gym/workouts/set-timer";
import { localize } from "../../lib/i18n";
import { clock } from "./clock";
import { recordKindsLabel } from "./recordLabels";

function setValueLabel(record: Pick<SessionRecordSet, "weightKg" | "reps">): string {
  return [record.weightKg !== undefined ? `${record.weightKg} kg` : undefined, record.reps !== undefined ? `${record.reps}` : undefined]
    .filter(Boolean)
    .join(" × ");
}

export function WorkoutSummary({ session, records, locale, onViewProgress, onDone }: {
  session: WorkoutSession;
  records: SessionRecordSet[];
  locale: "vi" | "en";
  onViewProgress: () => void;
  onDone: () => void;
}) {
  const vi = locale === "vi";
  const minutes = session.finishedAt
    ? Math.max(1, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
    : 0;
  const allSets = session.exercises.flatMap((exercise) => exercise.sets);
  const completedSets = allSets.filter((set) => set.completedAt).length;
  const volume = sessionVolumeMetrics(session).externalLoadVolumeKg;
  const exercises = session.exercises
    .map((exercise) => ({ exercise, done: exercise.sets.filter((set) => set.completedAt) }))
    .filter((item) => item.done.length > 0);
  const stats = [
    { label: vi ? "Thời gian" : "Duration", value: `${minutes} ${vi ? "phút" : "min"}` },
    { label: vi ? "Set hoàn tất" : "Sets done", value: `${completedSets}/${allSets.length}` },
    { label: vi ? "Khối lượng" : "Volume", value: `${volume.toLocaleString(locale)} kg` },
    { label: vi ? "Kỷ lục mới" : "New records", value: String(records.length) }
  ];
  const timing = timingSummary(session);
  if (timing.averageWorkSeconds !== undefined) stats.push({ label: vi ? "TB mỗi set" : "Avg set time", value: clock(timing.averageWorkSeconds) });
  if (timing.averageRestSeconds !== undefined) stats.push({ label: vi ? "TB nghỉ thực tế" : "Avg real rest", value: clock(timing.averageRestSeconds) });

  return (
    <div className="workout-summary">
      <Card className="workout-summary__card">
        <header>
          <small>{session.routineNameSnapshot ? localize(session.routineNameSnapshot, locale) : (vi ? "Buổi tập tự do" : "Freestyle workout")}</small>
          <h1>{vi ? "Hoàn thành buổi tập" : "Workout complete"}</h1>
        </header>
        <dl className="workout-summary__stats">
          {stats.map((stat) => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
        </dl>
        {records.length > 0 ? (
          <section aria-labelledby="workout-summary-records">
            <h2 id="workout-summary-records"><Trophy size={16} aria-hidden="true" />{vi ? "Kỷ lục mới" : "New records"}</h2>
            <ul className="workout-summary__list">
              {records.map((record) => {
                const exercise = session.exercises.find((item) => item.id === record.exerciseId);
                return (
                  <li key={record.setId}>
                    <span><strong>{exercise ? localize(exercise.variantNameSnapshot, locale) : record.variantId}</strong><small>{recordKindsLabel(record.kinds, locale)}</small></span>
                    <em>{setValueLabel(record)}</em>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        <section aria-labelledby="workout-summary-exercises">
          <h2 id="workout-summary-exercises">{vi ? "Bài đã tập" : "Exercises"}</h2>
          {exercises.length > 0 ? (
            <ul className="workout-summary__list">
              {exercises.map(({ exercise, done }) => (
                <li key={exercise.id}>
                  <span><strong>{localize(exercise.variantNameSnapshot, locale)}</strong></span>
                  <em>{done.length} {vi || done.length === 1 ? "set" : "sets"}</em>
                </li>
              ))}
            </ul>
          ) : <p className="workout-summary__empty">{vi ? "Chưa có set nào được hoàn tất." : "No sets were completed."}</p>}
        </section>
        <div className="workout-summary__actions">
          <Button onClick={onViewProgress}>{vi ? "Xem tiến độ" : "View progress"}</Button>
          <Button variant="secondary" onClick={onDone}>{vi ? "Về trang chủ" : "Back to home"}</Button>
        </div>
      </Card>
    </div>
  );
}
