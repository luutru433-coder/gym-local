import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "@gym/ui";
import { createId, type Difficulty, type Goal, type Profile, type Program, type Routine } from "@gym/contracts";
import { localize } from "../../lib/i18n";

interface ProgramEditorProps {
  program?: Program;
  profile: Profile;
  routines: Routine[];
  onClose: () => void;
  onSave: (program: Program) => Promise<void>;
  onDelete?: (program: Program) => Promise<void>;
}

function makeDraft(program: Program | undefined, profile: Profile): Program {
  if (program) return structuredClone(program);
  const timestamp = new Date().toISOString();
  return {
    id: createId("program"),
    name: { vi: "", en: "" },
    goal: profile.goal,
    difficulty: profile.experience,
    days: [],
    activeDayIndex: 0,
    progressionRule: {
      type: "double_progression",
      successSessions: 2,
      defaultIncrementKg: 2.5,
      fallbackIncreasePercent: 2.5
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function ProgramEditor({ program, profile, routines, onClose, onSave, onDelete }: ProgramEditorProps) {
  const locale = profile.locale;
  const [draft, setDraft] = useState(() => makeDraft(program, profile));
  const [routineToAdd, setRoutineToAdd] = useState(routines[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const reorder = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.days.length) return;
    const days = [...draft.days];
    [days[index], days[target]] = [days[target], days[index]];
    const activeDayIndex = draft.activeDayIndex === index ? target : draft.activeDayIndex === target ? index : draft.activeDayIndex;
    setDraft({ ...draft, days: days.map((day, order) => ({ ...day, order })), activeDayIndex });
  };

  const removeDay = (index: number) => {
    const days = draft.days.filter((_, dayIndex) => dayIndex !== index).map((day, order) => ({ ...day, order }));
    const activeDayIndex = !days.length ? 0 : index < draft.activeDayIndex
      ? draft.activeDayIndex - 1
      : Math.min(draft.activeDayIndex, days.length - 1);
    setDraft({ ...draft, days, activeDayIndex });
  };

  const addDay = () => {
    if (!routineToAdd) return;
    setDraft({ ...draft, days: [...draft.days, { order: draft.days.length, routineId: routineToAdd }] });
  };

  const submit = async () => {
    const viName = draft.name.vi.trim() || draft.name.en.trim();
    const enName = draft.name.en.trim() || draft.name.vi.trim();
    if (!viName || !enName || !draft.days.length) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave({ ...draft, name: { vi: viName, en: enName }, updatedAt: new Date().toISOString() });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "vi" ? "Không thể lưu chương trình." : "Could not save program."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open className="modal--program-editor" title={program ? (locale === "vi" ? "Sửa chương trình" : "Edit program") : (locale === "vi" ? "Tạo chương trình" : "Create program")} onClose={onClose}>
      <div className="program-editor">
        <div className="program-editor__identity">
          <Field label={locale === "vi" ? "Tên tiếng Việt" : "Vietnamese name"}><input value={draft.name.vi} onChange={(event) => setDraft({ ...draft, name: { ...draft.name, vi: event.target.value } })} /></Field>
          <Field label={locale === "vi" ? "Tên tiếng Anh" : "English name"}><input value={draft.name.en} onChange={(event) => setDraft({ ...draft, name: { ...draft.name, en: event.target.value } })} /></Field>
          <Field label={locale === "vi" ? "Mục tiêu" : "Goal"}><select value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value as Goal })}><option value="hypertrophy">{locale === "vi" ? "Tăng cơ" : "Hypertrophy"}</option><option value="strength">{locale === "vi" ? "Sức mạnh" : "Strength"}</option><option value="fat_loss">{locale === "vi" ? "Giảm mỡ" : "Fat loss"}</option><option value="general">{locale === "vi" ? "Tổng quát" : "General"}</option></select></Field>
          <Field label={locale === "vi" ? "Độ khó" : "Difficulty"}><select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as Difficulty })}><option value="beginner">{locale === "vi" ? "Mới bắt đầu" : "Beginner"}</option><option value="intermediate">{locale === "vi" ? "Trung cấp" : "Intermediate"}</option><option value="advanced">{locale === "vi" ? "Nâng cao" : "Advanced"}</option></select></Field>
        </div>

        <section className="program-editor__days" aria-labelledby="program-days-title">
          <div className="routine-editor__section-title"><div><h3 id="program-days-title">{locale === "vi" ? "Các ngày tập" : "Training days"}</h3><p>{locale === "vi" ? "Chọn ngày tiếp theo và sắp xếp lịch theo thứ tự." : "Choose the next day and arrange routines in order."}</p></div><strong aria-live="polite">{draft.days.length}</strong></div>
          {draft.days.length ? <ol>
            {draft.days.map((day, index) => <li className={index === draft.activeDayIndex ? "program-day program-day--next" : "program-day"} key={`${day.order}-${index}`}>
              <button type="button" className="program-day__number" aria-pressed={index === draft.activeDayIndex} onClick={() => setDraft({ ...draft, activeDayIndex: index })} aria-label={`${locale === "vi" ? "Đặt làm ngày tiếp theo" : "Set as next day"} ${index + 1}`}>{index + 1}</button>
              <Field label={index === draft.activeDayIndex ? (locale === "vi" ? "Ngày tiếp theo" : "Next day") : (locale === "vi" ? `Ngày ${index + 1}` : `Day ${index + 1}`)}>
                <select value={day.routineId} onChange={(event) => setDraft({ ...draft, days: draft.days.map((entry, dayIndex) => dayIndex === index ? { ...entry, routineId: event.target.value } : entry) })}>
                  {routines.map((routine) => <option value={routine.id} key={routine.id}>{localize(routine.name, locale)}</option>)}
                </select>
              </Field>
              <div className="routine-editor__icon-actions">
                <button type="button" className="icon-button" disabled={index === 0} onClick={() => reorder(index, -1)} aria-label={`${locale === "vi" ? "Đưa ngày lên" : "Move day up"} ${index + 1}`}><ArrowUp size={17} /></button>
                <button type="button" className="icon-button" disabled={index === draft.days.length - 1} onClick={() => reorder(index, 1)} aria-label={`${locale === "vi" ? "Đưa ngày xuống" : "Move day down"} ${index + 1}`}><ArrowDown size={17} /></button>
                <button type="button" className="icon-button routine-editor__delete-icon" onClick={() => removeDay(index)} aria-label={`${locale === "vi" ? "Xóa ngày" : "Delete day"} ${index + 1}`}><Trash2 size={17} /></button>
              </div>
            </li>)}
          </ol> : <p className="routine-editor__empty">{locale === "vi" ? "Thêm ít nhất một ngày tập." : "Add at least one training day."}</p>}
          <div className="program-editor__add-day">
            <Field label={locale === "vi" ? "Lịch tập cho ngày mới" : "Routine for new day"}><select value={routineToAdd} onChange={(event) => setRoutineToAdd(event.target.value)}>{routines.map((routine) => <option value={routine.id} key={routine.id}>{localize(routine.name, locale)}</option>)}</select></Field>
            <Button variant="ghost" disabled={!routineToAdd} onClick={addDay}><Plus size={17} />{locale === "vi" ? "Thêm ngày" : "Add day"}</Button>
          </div>
        </section>

        {error ? <p className="routine-editor__error" role="alert">{error}</p> : null}
        <div className="routine-editor__footer">
          {program && onDelete ? <Button variant="danger" onClick={() => void onDelete(program)}><Trash2 size={17} />{locale === "vi" ? "Xóa chương trình" : "Delete program"}</Button> : <span />}
          <div><Button variant="ghost" onClick={onClose}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={saving || !draft.days.length || (!draft.name.vi.trim() && !draft.name.en.trim())} onClick={() => void submit()}>{saving ? "…" : (locale === "vi" ? "Lưu chương trình" : "Save program")}</Button></div>
        </div>
      </div>
    </Modal>
  );
}
