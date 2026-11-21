import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Field, Modal, Notice } from "@gym/ui";
import type { BodyMetric, SetType, WorkoutSession } from "@gym/contracts";
import { formatDate, formatNumber, localize } from "../../lib/i18n";
import { removeBodyMetric, updatePastSession } from "./history-actions";
import { applySessionDraft, draftProblem, type DraftProblem, exerciseProfile, newSetDraft, sessionDraft, type SessionDraft, type SetDraft } from "./history-edit";
import "./HistoryEditors.css";

type Locale = "vi" | "en";

const setTypeLabels: Record<SetType, { vi: string; en: string }> = {
  warmup: { vi: "Khởi động", en: "Warm-up" },
  working: { vi: "Set chính", en: "Working" },
  drop: { vi: "Drop set", en: "Drop set" },
  failure: { vi: "Tới ngưỡng", en: "To failure" }
};

const problemText: Record<DraftProblem, { vi: string; en: string }> = {
  number: { vi: "Có ô số không hợp lệ. Chỉ nhập số từ 0 trở lên, hoặc để trống.", en: "A number field is invalid. Enter a number of 0 or more, or leave it empty." },
  date: { vi: "Ngày giờ không hợp lệ hoặc nằm trong tương lai.", en: "The date and time are invalid or in the future." },
  duration: { vi: "Thời lượng phải từ 0 đến 1440 phút.", en: "Duration must be between 0 and 1440 minutes." },
  set: { vi: "Mỗi set cần số lần, thời gian hoặc quãng đường lớn hơn 0. Xóa set nếu bạn không tập set đó.", en: "Each set needs reps, time, or distance above 0. Remove a set you did not do." }
};

function messageFrom(error: unknown, locale: Locale): string {
  return error instanceof Error ? error.message : (locale === "vi" ? "Không lưu được thay đổi." : "Could not save the change.");
}

export function SessionEditModal({ session, locale, onClose }: { session: WorkoutSession; locale: Locale; onClose: () => void }) {
  const [draft, setDraft] = useState<SessionDraft>(() => sessionDraft(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const problem = draftProblem(session, draft);

  const patchSet = (exerciseId: string, setId: string, values: Partial<SetDraft>) => setDraft((current) => ({
    ...current,
    exercises: current.exercises.map((exercise) => exercise.id === exerciseId
      ? { ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...values } : set) }
      : exercise)
  }));
  const removeSet = (exerciseId: string, setId: string) => setDraft((current) => ({
    ...current,
    exercises: current.exercises.map((exercise) => exercise.id === exerciseId
      ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) }
      : exercise)
  }));
  const addSet = (exerciseId: string) => setDraft((current) => ({
    ...current,
    exercises: current.exercises.map((exercise) => exercise.id === exerciseId
      ? { ...exercise, sets: [...exercise.sets, newSetDraft(exercise.sets.at(-1))] }
      : exercise)
  }));
  const removeExercise = (exerciseId: string) => setDraft((current) => ({
    ...current,
    exercises: current.exercises.filter((exercise) => exercise.id !== exerciseId)
  }));

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await updatePastSession(applySessionDraft(session, draft));
      onClose();
    } catch (caught) {
      setError(messageFrom(caught, locale));
      setSaving(false);
    }
  };

  return (
    <Modal open title={locale === "vi" ? "Sửa buổi tập" : "Edit workout"} onClose={onClose} className="history-edit-modal">
      <div className="history-edit">
        <div className="form-grid form-grid--3">
          <Field label={locale === "vi" ? "Ngày" : "Date"}><input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></Field>
          <Field label={locale === "vi" ? "Giờ bắt đầu" : "Start time"}><input type="time" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} /></Field>
          <Field label={locale === "vi" ? "Thời lượng (phút)" : "Duration (min)"}><input type="number" inputMode="numeric" min="0" max="1440" step="1" value={draft.durationMinutes} onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value }))} /></Field>
        </div>

        {draft.exercises.map((exerciseDraft) => {
          const exercise = session.exercises.find((item) => item.id === exerciseDraft.id);
          if (!exercise) return null;
          const profile = exerciseProfile(exercise);
          const name = localize(exercise.variantNameSnapshot, locale);
          const repsOnly = profile.loadEntryMode === "reps_only";
          const loadLabel = profile.loadEntryMode === "assisted"
            ? (locale === "vi" ? "Trợ lực (kg)" : "Assist (kg)")
            : profile.loadEntryMode === "per_hand" ? (locale === "vi" ? "Kg/tay" : "Kg/hand") : "Kg";
          return (
            <fieldset className="history-edit__exercise" key={exerciseDraft.id}>
              <legend>{name}</legend>
              <button type="button" className="history-edit__remove-exercise" onClick={() => removeExercise(exerciseDraft.id)}>
                <Trash2 size={14} aria-hidden="true" />{locale === "vi" ? "Xóa động tác" : "Remove exercise"}
              </button>
              {exerciseDraft.sets.map((set, index) => {
                const label = `${name}, set ${index + 1}`;
                return (
                  <div className="history-edit__set" key={set.id}>
                    <select aria-label={`${label}, ${locale === "vi" ? "loại set" : "set type"}`} value={set.type} onChange={(event) => patchSet(exerciseDraft.id, set.id, { type: event.target.value as SetType })}>
                      {(Object.keys(setTypeLabels) as SetType[]).map((type) => <option key={type} value={type}>{setTypeLabels[type][locale]}</option>)}
                    </select>
                    {repsOnly ? null : <label><span>{loadLabel}</span><input aria-label={`${label}, ${loadLabel}`} inputMode="decimal" value={set.weightKg} onChange={(event) => patchSet(exerciseDraft.id, set.id, { weightKg: event.target.value })} /></label>}
                    {profile.effortKind === "reps" ? <>
                      <label><span>Reps</span><input aria-label={`${label}, reps`} inputMode="numeric" value={set.reps} onChange={(event) => patchSet(exerciseDraft.id, set.id, { reps: event.target.value })} /></label>
                      <label><span>RIR</span><input aria-label={`${label}, RIR`} inputMode="numeric" value={set.rir} onChange={(event) => patchSet(exerciseDraft.id, set.id, { rir: event.target.value })} /></label>
                    </> : null}
                    {profile.effortKind === "distance_duration" ? <label><span>{locale === "vi" ? "Mét" : "Meters"}</span><input aria-label={`${label}, ${locale === "vi" ? "quãng đường (m)" : "distance (m)"}`} inputMode="decimal" value={set.distanceMeters} onChange={(event) => patchSet(exerciseDraft.id, set.id, { distanceMeters: event.target.value })} /></label> : null}
                    {profile.effortKind !== "reps" ? <label><span>{locale === "vi" ? "Giây" : "Seconds"}</span><input aria-label={`${label}, ${locale === "vi" ? "thời gian (giây)" : "time (seconds)"}`} inputMode="numeric" value={set.durationSeconds} onChange={(event) => patchSet(exerciseDraft.id, set.id, { durationSeconds: event.target.value })} /></label> : null}
                    <button type="button" className="history-edit__icon" aria-label={locale === "vi" ? `Xóa ${label}` : `Remove ${label}`} onClick={() => removeSet(exerciseDraft.id, set.id)}><Trash2 size={16} aria-hidden="true" /></button>
                  </div>
                );
              })}
              <button type="button" className="text-link" onClick={() => addSet(exerciseDraft.id)}><Plus size={15} aria-hidden="true" />{locale === "vi" ? "Thêm set" : "Add set"}</button>
            </fieldset>
          );
        })}

        <Field label={locale === "vi" ? "Ghi chú" : "Notes"}><textarea rows={2} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></Field>
        <p className="fine-print">{locale === "vi" ? "Biểu đồ, kỷ lục và gợi ý mức tạ được tính lại từ số liệu đã sửa. Biến thể dụng cụ của động tác không đổi." : "Charts, records, and load suggestions are recalculated from the edited numbers. The exercise's equipment variant does not change."}</p>
        {problem ? <Notice tone="warning">{problemText[problem][locale]}</Notice> : null}
        {error ? <Notice tone="warning">{error}</Notice> : null}
        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>{locale === "vi" ? "Hủy" : "Cancel"}</Button>
          <Button disabled={Boolean(problem) || saving} onClick={() => void save()}>{locale === "vi" ? "Lưu thay đổi" : "Save changes"}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function ConfirmDeleteModal({ title, body, locale, onConfirm, onClose }: { title: string; body: string; locale: Locale; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(messageFrom(caught, locale));
      setBusy(false);
    }
  };
  return (
    <Modal open title={title} onClose={onClose}>
      <p className="history-edit__confirm">{body}</p>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>{locale === "vi" ? "Hủy" : "Cancel"}</Button>
        <Button variant="danger" disabled={busy} onClick={() => void confirm()}>{locale === "vi" ? "Xóa" : "Delete"}</Button>
      </div>
    </Modal>
  );
}

const METRIC_FIELDS: { key: keyof Omit<BodyMetric, "id" | "date">; label: { vi: string; en: string }; unit: string }[] = [
  { key: "weightKg", label: { vi: "Cân", en: "Weight" }, unit: "kg" },
  { key: "waistCm", label: { vi: "Eo", en: "Waist" }, unit: "cm" },
  { key: "chestCm", label: { vi: "Ngực", en: "Chest" }, unit: "cm" },
  { key: "hipsCm", label: { vi: "Hông", en: "Hips" }, unit: "cm" },
  { key: "armCm", label: { vi: "Bắp tay", en: "Arm" }, unit: "cm" },
  { key: "thighCm", label: { vi: "Đùi", en: "Thigh" }, unit: "cm" }
];

export function BodyMetricLog({ metrics, locale, onEdit }: { metrics: BodyMetric[]; locale: Locale; onEdit: (metric: BodyMetric) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [deleting, setDeleting] = useState<BodyMetric>();
  if (!metrics.length) return null;
  const newestFirst = [...metrics].sort((a, b) => b.date.localeCompare(a.date));
  const visible = showAll ? newestFirst : newestFirst.slice(0, 5);
  const dateLabel = (metric: BodyMetric) => formatDate(`${metric.date}T12:00:00`, locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div className="metric-log">
      <h3>{locale === "vi" ? "Số đo đã ghi" : "Logged measurements"}</h3>
      <ul>
        {visible.map((metric) => {
          const values = METRIC_FIELDS.filter((field) => metric[field.key] !== undefined)
            .map((field) => `${field.label[locale]} ${formatNumber(metric[field.key]!, locale, 1)} ${field.unit}`).join(" · ");
          return (
            <li key={metric.id}>
              <div><strong>{dateLabel(metric)}</strong><small>{values}</small></div>
              <button type="button" className="history-edit__icon" aria-label={locale === "vi" ? `Sửa số đo ngày ${dateLabel(metric)}` : `Edit measurement from ${dateLabel(metric)}`} onClick={() => onEdit(metric)}><Pencil size={16} aria-hidden="true" /></button>
              <button type="button" className="history-edit__icon" aria-label={locale === "vi" ? `Xóa số đo ngày ${dateLabel(metric)}` : `Delete measurement from ${dateLabel(metric)}`} onClick={() => setDeleting(metric)}><Trash2 size={16} aria-hidden="true" /></button>
            </li>
          );
        })}
      </ul>
      {newestFirst.length > 5 ? <button type="button" className="text-link" onClick={() => setShowAll((value) => !value)}>{showAll ? (locale === "vi" ? "Thu gọn" : "Show fewer") : (locale === "vi" ? `Xem tất cả (${newestFirst.length})` : `Show all (${newestFirst.length})`)}</button> : null}
      {deleting ? <ConfirmDeleteModal locale={locale} title={locale === "vi" ? "Xóa số đo?" : "Delete measurement?"} body={locale === "vi" ? `Số đo ngày ${dateLabel(deleting)} sẽ bị xóa khỏi thiết bị này. Không thể hoàn tác.` : `The measurement from ${dateLabel(deleting)} will be removed from this device. This cannot be undone.`} onConfirm={() => removeBodyMetric(deleting.id)} onClose={() => setDeleting(undefined)} /> : null}
    </div>
  );
}
