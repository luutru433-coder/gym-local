import { useState } from "react";
import { Check, Clock3, Copy, CopyPlus, Dumbbell, Layers3, Pencil, Play, Plus, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, SectionTitle } from "@gym/ui";
import { createId, type Difficulty, type Goal, type Program, type Routine } from "@gym/contracts";
import { ROUTINE_TEMPLATES } from "@gym/workouts";
import { localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";
import { ProgramEditor } from "./ProgramEditor";
import { RoutineEditor } from "./RoutineEditor";
import "./routines.css";

const goalLabels: Record<Goal, { vi: string; en: string }> = {
  hypertrophy: { vi: "Tăng cơ", en: "Hypertrophy" },
  strength: { vi: "Sức mạnh", en: "Strength" },
  fat_loss: { vi: "Giảm mỡ", en: "Fat loss" },
  general: { vi: "Tổng quát", en: "General" }
};

const difficultyLabels: Record<Difficulty, { vi: string; en: string }> = {
  beginner: { vi: "Mới bắt đầu", en: "Beginner" },
  intermediate: { vi: "Trung cấp", en: "Intermediate" },
  advanced: { vi: "Nâng cao", en: "Advanced" }
};

function orderedDays(program: Program): Program["days"] {
  return [...program.days].sort((left, right) => left.order - right.order);
}

export function RoutinesPage() {
  const navigate = useNavigate();
  const profile = useGymStore((state) => state.profile)!;
  const routines = useGymStore((state) => state.routines);
  const programs = useGymStore((state) => state.programs);
  const settings = useGymStore((state) => state.settings);
  const activeSession = useGymStore((state) => state.activeSession);
  const installTemplate = useGymStore((state) => state.installTemplate);
  const saveUserRoutine = useGymStore((state) => state.saveUserRoutine);
  const removeRoutine = useGymStore((state) => state.removeRoutine);
  const saveUserProgram = useGymStore((state) => state.saveUserProgram);
  const removeProgram = useGymStore((state) => state.removeProgram);
  const selectUserProgram = useGymStore((state) => state.selectUserProgram);
  const startWorkout = useGymStore((state) => state.startWorkout);
  const startFreestyleWorkout = useGymStore((state) => state.startFreestyleWorkout);
  const locale = profile.locale;
  const [routineEditorOpen, setRoutineEditorOpen] = useState(false);
  const [routineToEdit, setRoutineToEdit] = useState<Routine>();
  const [programEditorOpen, setProgramEditorOpen] = useState(false);
  const [programToEdit, setProgramToEdit] = useState<Program>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();
  const installedTemplates = new Set(routines.map((routine) => routine.sourceTemplateId));

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key);
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "vi" ? "Không thể hoàn tất thao tác." : "The action could not be completed."));
    } finally {
      setPending(undefined);
    }
  };

  const launchRoutine = async (routine: Routine, programId?: string) => {
    if (activeSession) {
      navigate("/workout");
      return;
    }
    await run(`start-${routine.id}`, async () => {
      await startWorkout(routine, programId);
      navigate("/workout");
    });
  };

  const launchProgram = async (program: Program) => {
    const days = orderedDays(program);
    const dayIndex = days.length ? Math.min(program.activeDayIndex, days.length - 1) : 0;
    const routine = routines.find((entry) => entry.id === days[dayIndex]?.routineId);
    if (!routine) {
      setError(locale === "vi" ? "Ngày tiếp theo không còn lịch tập hợp lệ. Hãy sửa chương trình." : "The next day has no valid routine. Edit the program first.");
      return;
    }
    await launchRoutine(routine, program.id);
  };

  const duplicateRoutine = async (routine: Routine) => {
    const timestamp = new Date().toISOString();
    const copy: Routine = {
      ...structuredClone(routine),
      id: createId("routine"),
      name: {
        vi: `${routine.name.vi} · Bản sao`,
        en: `${routine.name.en} · Copy`
      },
      sourceTemplateId: undefined,
      items: routine.items.map((item) => ({
        ...item,
        id: createId("routine_item"),
        sets: item.sets.map((set) => ({ ...set, id: createId("target") }))
      })),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await run(`duplicate-${routine.id}`, async () => { await saveUserRoutine(copy); });
  };

  const deleteRoutine = async (routine: Routine) => {
    const confirmed = window.confirm(locale === "vi"
      ? "Xóa lịch tập này? Lịch sử buổi tập vẫn được giữ. Không thể xóa nếu chương trình đang sử dụng lịch này."
      : "Delete this routine? Workout history stays intact. A routine used by a program cannot be deleted.");
    if (!confirmed) return;
    await run(`delete-${routine.id}`, async () => {
      await removeRoutine(routine.id);
      setRoutineEditorOpen(false);
    });
  };

  const deleteProgram = async (program: Program) => {
    const confirmed = window.confirm(locale === "vi"
      ? "Xóa chương trình này? Các lịch tập và lịch sử vẫn được giữ."
      : "Delete this program? Its routines and workout history stay intact.");
    if (!confirmed) return;
    await run(`delete-${program.id}`, async () => {
      await removeProgram(program.id);
      setProgramEditorOpen(false);
    });
  };

  return (
    <div className="page routines-page">
      <header className="page-header routines-page__header">
        <div><span className="eyebrow">{locale === "vi" ? "Kế hoạch cá nhân" : "Personal planning"}</span><h1>{locale === "vi" ? "Chương trình & lịch tập" : "Programs & routines"}</h1><p>{locale === "vi" ? "Xây chương trình nhiều ngày, chỉnh từng biến thể dụng cụ và giữ dữ liệu hoàn toàn trên máy." : "Build multi-day programs, tune every equipment variant, and keep the data entirely on-device."}</p></div>
        <div className="routines-page__header-actions">
          <Button variant="ghost" onClick={() => void run("freestyle", async () => { if (activeSession) return navigate("/workout"); await startFreestyleWorkout(); navigate("/workout"); })}><Sparkles size={18} />{activeSession ? (locale === "vi" ? "Tiếp tục tập" : "Resume") : (locale === "vi" ? "Tập tự do" : "Freestyle")}</Button>
          <Button variant="secondary" disabled={!routines.length} onClick={() => { setProgramToEdit(undefined); setProgramEditorOpen(true); }}><Plus size={18} />{locale === "vi" ? "Chương trình" : "Program"}</Button>
          <Button onClick={() => { setRoutineToEdit(undefined); setRoutineEditorOpen(true); }}><Plus size={18} />{locale === "vi" ? "Lịch tập" : "Routine"}</Button>
        </div>
      </header>

      {error ? <div className="routines-page__error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(undefined)}>{locale === "vi" ? "Đóng" : "Dismiss"}</button></div> : null}

      <section className="program-section" aria-label={locale === "vi" ? "Kế hoạch nhiều ngày" : "Multi-day plans"}>
        <SectionTitle eyebrow={`${programs.length} ${locale === "vi" ? "chương trình" : "programs"}`} title={locale === "vi" ? "Kế hoạch nhiều ngày" : "Multi-day plans"} />
        {programs.length ? <div className="program-grid">
          {programs.map((program) => {
            const days = orderedDays(program);
            const activeIndex = days.length ? Math.min(program.activeDayIndex, days.length - 1) : 0;
            const nextRoutine = routines.find((routine) => routine.id === days[activeIndex]?.routineId);
            const selected = settings.activeProgramId === program.id;
            return <Card className={selected ? "program-card program-card--active" : "program-card"} key={program.id}>
              <div className="program-card__top"><span className="tag">{goalLabels[program.goal][locale]}</span>{selected ? <span className="program-card__active-label"><Check size={14} />{locale === "vi" ? "Đang theo" : "Active"}</span> : null}</div>
              <h3>{localize(program.name, locale)}</h3>
              <p>{days.length} {locale === "vi" ? "ngày" : "days"} · {difficultyLabels[program.difficulty][locale]}</p>
              <div className="program-card__days" aria-label={locale === "vi" ? "Thứ tự ngày tập" : "Training day order"}>
                {days.map((day, index) => {
                  const routine = routines.find((entry) => entry.id === day.routineId);
                  return <span className={index === activeIndex ? "program-card__day program-card__day--next" : "program-card__day"} key={`${program.id}-${index}`}><strong>{index + 1}</strong><small>{routine ? localize(routine.name, locale) : (locale === "vi" ? "Thiếu lịch" : "Missing")}</small></span>;
                })}
              </div>
              <div className="program-card__next"><span>{locale === "vi" ? "Buổi tiếp theo" : "Up next"}</span><strong>{nextRoutine ? localize(nextRoutine.name, locale) : "—"}</strong></div>
              <div className="program-card__actions">
                <Button size="sm" disabled={!nextRoutine || pending === `start-${nextRoutine.id}`} onClick={() => void launchProgram(program)}><Play size={16} fill="currentColor" />{activeSession ? (locale === "vi" ? "Tiếp tục" : "Resume") : (locale === "vi" ? "Tập ngày này" : "Start next")}</Button>
                {!selected ? <Button variant="ghost" size="sm" onClick={() => void run(`select-${program.id}`, async () => { await selectUserProgram(program.id); })}>{locale === "vi" ? "Chọn" : "Select"}</Button> : null}
                <button type="button" className="icon-button" onClick={() => { setProgramToEdit(program); setProgramEditorOpen(true); }} aria-label={`${locale === "vi" ? "Sửa chương trình" : "Edit program"}: ${localize(program.name, locale)}`}><Pencil size={17} /></button>
              </div>
            </Card>;
          })}
        </div> : <EmptyState icon={<Layers3 />} title={locale === "vi" ? "Chưa có chương trình" : "No programs yet"} body={locale === "vi" ? "Tạo một chương trình và chọn các lịch tập cho từng ngày." : "Create a program and choose a routine for each day."} action={<Button disabled={!routines.length} onClick={() => setProgramEditorOpen(true)}>{locale === "vi" ? "Tạo chương trình" : "Create program"}</Button>} />}
      </section>

      <section className="routine-section" aria-label={locale === "vi" ? "Lịch tập của bạn" : "Your routines"}>
        <SectionTitle eyebrow={`${routines.length} ${locale === "vi" ? "lịch đã lưu" : "saved"}`} title={locale === "vi" ? "Lịch tập của bạn" : "Your routines"} />
        {routines.length ? <div className="routine-grid">
          {routines.map((routine, index) => <Card key={routine.id} className="routine-card">
            <div className={`routine-card__visual routine-card__visual--${index % 4}`}><span>{String(index + 1).padStart(2, "0")}</span><Dumbbell size={36} /></div>
            <div className="routine-card__body">
              <span className="tag">{goalLabels[routine.goal][locale]}</span>
              <h3>{localize(routine.name, locale)}</h3>
              <p><Layers3 size={15} />{routine.items.length} {locale === "vi" ? "động tác" : "exercises"}<span>·</span><Clock3 size={15} />~{Math.max(15, routine.items.length * 7)} min</p>
              <div className="routine-card__actions">
                <Button size="sm" disabled={pending === `start-${routine.id}`} onClick={() => void launchRoutine(routine)}><Play size={16} fill="currentColor" />{activeSession ? (locale === "vi" ? "Tiếp tục" : "Resume") : (locale === "vi" ? "Bắt đầu" : "Start")}</Button>
                <div>
                  <button type="button" className="icon-button" disabled={pending === `duplicate-${routine.id}`} onClick={() => void duplicateRoutine(routine)} aria-label={`${locale === "vi" ? "Nhân đôi lịch" : "Duplicate routine"}: ${localize(routine.name, locale)}`}><Copy size={17} /></button>
                  <button type="button" className="icon-button" onClick={() => { setRoutineToEdit(routine); setRoutineEditorOpen(true); }} aria-label={`${locale === "vi" ? "Sửa lịch" : "Edit routine"}: ${localize(routine.name, locale)}`}><Pencil size={17} /></button>
                </div>
              </div>
            </div>
          </Card>)}
        </div> : <EmptyState icon={<Dumbbell />} title={locale === "vi" ? "Chưa có lịch tập" : "No routines yet"} body={locale === "vi" ? "Chọn mẫu bên dưới hoặc tạo lịch riêng." : "Pick a template below or create your own."} action={<Button onClick={() => setRoutineEditorOpen(true)}>{locale === "vi" ? "Tạo lịch" : "Create routine"}</Button>} />}
      </section>

      <section className="template-section">
        <SectionTitle eyebrow={locale === "vi" ? "Miễn phí · Có sẵn offline" : "Free · Available offline"} title={locale === "vi" ? "Mẫu lịch tập" : "Routine templates"} />
        <div className="template-list">
          {ROUTINE_TEMPLATES.map((template, index) => {
            const installed = installedTemplates.has(template.id);
            return <Card className="template-row" key={template.id}>
              <span className="template-row__index">{String(index + 1).padStart(2, "0")}</span>
              <div><span className="tag tag--outline">{goalLabels[template.goal][locale]}</span><h3>{localize(template.name, locale)}</h3><p>{template.items.length} {locale === "vi" ? "động tác" : "exercises"} · {difficultyLabels[template.difficulty][locale]}</p></div>
              <Button variant={installed ? "ghost" : "secondary"} size="sm" disabled={installed || pending === `template-${template.id}`} onClick={() => void run(`template-${template.id}`, async () => { await installTemplate(template.id); })}>{installed ? <Check size={16} /> : <CopyPlus size={16} />}{installed ? (locale === "vi" ? "Đã thêm" : "Added") : (locale === "vi" ? "Thêm" : "Add")}</Button>
            </Card>;
          })}
        </div>
      </section>

      {routineEditorOpen ? <RoutineEditor key={routineToEdit?.id ?? "new-routine"} routine={routineToEdit} profile={profile} onClose={() => setRoutineEditorOpen(false)} onSave={async (routine) => { await saveUserRoutine(routine); }} onDelete={deleteRoutine} /> : null}
      {programEditorOpen ? <ProgramEditor key={programToEdit?.id ?? "new-program"} program={programToEdit} profile={profile} routines={routines} onClose={() => setProgramEditorOpen(false)} onSave={async (program) => { await saveUserProgram(program); }} onDelete={deleteProgram} /> : null}
    </div>
  );
}
