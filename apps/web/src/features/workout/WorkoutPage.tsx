import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronDown, CircleHelp, Clock3, Dumbbell, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, Modal, Notice, ProgressBar } from "@gym/ui";
import type { ExerciseVariant, LoadEntryMode, SetLog, WorkoutSession } from "@gym/contracts";
import { EQUIPMENT_OPTIONS, getTrackingProfile, getVariant, rankVariantsForEquipment, trackingProfileForLoadMode } from "@gym/catalog";
import { addSet, sessionProgress, switchExerciseVariant, updateSet } from "@gym/workouts";
import { latestVariantHistory } from "@gym/progress";
import { localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";
import { ExerciseVideoPlayer } from "../../components/ExerciseVideoPlayer";

function durationLabel(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function restLabel(endsAt: string | undefined, now: number): number {
  return endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000)) : 0;
}

function nonNegativeNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? Math.max(0, number) : undefined;
}

function nonNegativeInteger(value: string, maximum?: number): number | undefined {
  const number = nonNegativeNumber(value);
  if (number === undefined) return undefined;
  const rounded = Math.round(number);
  return maximum === undefined ? rounded : Math.min(maximum, rounded);
}

const loadModeLabels: Record<LoadEntryMode, { vi: string; en: string }> = {
  total_weight: { vi: "Tổng mức tạ", en: "Total weight" },
  per_hand: { vi: "Mức tạ mỗi tay", en: "Weight per hand" },
  per_side: { vi: "Mức tạ mỗi bên", en: "Weight per side" },
  bodyweight_plus: { vi: "Trọng lượng cơ thể + tạ", en: "Bodyweight + added load" },
  assisted: { vi: "Mức trợ lực", en: "Assistance weight" },
  reps_only: { vi: "Chỉ số lần", en: "Reps only" },
  duration_distance: { vi: "Quãng đường và thời gian", en: "Distance and duration" }
};

export function WorkoutPage() {
  const navigate = useNavigate();
  const profile = useGymStore((state) => state.profile)!;
  const activeSession = useGymStore((state) => state.activeSession);
  const sessions = useGymStore((state) => state.sessions);
  const setActiveSession = useGymStore((state) => state.setActiveSession);
  const completeWorkout = useGymStore((state) => state.completeWorkout);
  const sessionSaveStatus = useGymStore((state) => state.sessionSaveStatus);
  const locale = profile.locale;
  const [now, setNow] = useState(() => activeSession ? new Date(activeSession.startedAt).getTime() : 0);
  const [expandedId, setExpandedId] = useState(activeSession?.activeExerciseId);
  const [variantForExercise, setVariantForExercise] = useState<string>();
  const [guideVariant, setGuideVariant] = useState<ExerciseVariant>();
  const availableEquipment = profile.locations.find((location) => location.id === profile.activeLocationId)?.equipment ?? [];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const progress = activeSession ? sessionProgress(activeSession) : { completed: 0, total: 0, percent: 0 };
  const restRemaining = restLabel(activeSession?.restTimerEndsAt, now);

  const save = (session: WorkoutSession) => {
    void setActiveSession(session).catch(() => undefined);
  };

  const patchSet = (exerciseId: string, setId: string, values: Partial<Pick<SetLog, "weightKg" | "reps" | "rir" | "rpe" | "durationSeconds" | "distanceMeters" | "type">>) => {
    if (!activeSession) return;
    save(updateSet(activeSession, exerciseId, setId, values));
  };

  const toggleComplete = (exerciseId: string, setId: string) => {
    if (!activeSession) return;
    const exercise = activeSession.exercises.find((item) => item.id === exerciseId);
    const set = exercise?.sets.find((item) => item.id === setId);
    if (!set) return;
    if (set.completedAt) {
      const updated = structuredClone(activeSession);
      const target = updated.exercises.find((item) => item.id === exerciseId)?.sets.find((item) => item.id === setId);
      if (target) target.completedAt = undefined;
      updated.restTimerEndsAt = undefined;
      save(updated);
    } else {
      save(updateSet(activeSession, exerciseId, setId, {}, true));
    }
  };

  const modifyRest = (seconds?: number) => {
    if (!activeSession) return;
    save({ ...activeSession, restTimerEndsAt: seconds === undefined ? undefined : new Date(Math.max(Date.now(), new Date(activeSession.restTimerEndsAt ?? Date.now()).getTime()) + seconds * 1000).toISOString() });
  };

  const chooseVariant = (exerciseId: string, variant: ExerciseVariant) => {
    if (!activeSession) return;
    const current = activeSession.exercises.find((exercise) => exercise.id === exerciseId);
    if (current?.variantId === variant.id) {
      setVariantForExercise(undefined);
      return;
    }
    const updated = switchExerciseVariant(activeSession, exerciseId, variant);
    save(updated);
    setVariantForExercise(undefined);
    setExpandedId(updated.activeExerciseId);
  };

  const finish = async () => {
    if (!activeSession) return;
    const incomplete = progress.total - progress.completed;
    const message = incomplete > 0
      ? (locale === "vi" ? `Còn ${incomplete} set chưa hoàn tất. Kết thúc và lưu buổi tập?` : `${incomplete} sets are incomplete. Finish and save anyway?`)
      : (locale === "vi" ? "Hoàn tất và lưu buổi tập?" : "Finish and save this workout?");
    if (!window.confirm(message)) return;
    await completeWorkout();
    navigate("/progress");
  };

  if (!activeSession) {
    return <div className="workout-empty"><EmptyState icon={<Dumbbell size={34} />} title={locale === "vi" ? "Chưa có buổi tập đang mở" : "No active workout"} body={locale === "vi" ? "Chọn một lịch tập để bắt đầu ghi set." : "Choose a routine to start logging sets."} action={<Button onClick={() => navigate("/routines")}>{locale === "vi" ? "Chọn lịch tập" : "Choose routine"}</Button>} /></div>;
  }

  const modalExercise = activeSession.exercises.find((exercise) => exercise.id === variantForExercise);
  const modalVariants = modalExercise ? rankVariantsForEquipment(modalExercise.movementId, availableEquipment) : [];
  const saveStatusLabel = sessionSaveStatus === "saving"
    ? (locale === "vi" ? "Đang lưu…" : "Saving…")
    : sessionSaveStatus === "saved"
      ? (locale === "vi" ? "Đã lưu trên thiết bị" : "Saved on device")
      : sessionSaveStatus === "error"
        ? (locale === "vi" ? "Lưu thất bại" : "Save failed")
        : (locale === "vi" ? "Đang tập" : "Workout live");

  return (
    <div className="workout-page">
      <header className="workout-header">
        <button className="icon-button icon-button--dark" type="button" onClick={() => navigate("/")} aria-label={locale === "vi" ? "Quay lại trang chủ" : "Back to home"}><ArrowLeft size={21} /></button>
        <div className="workout-header__title"><span className="live-dot" /> <div><small role="status" aria-live="polite">{saveStatusLabel}</small><strong>{activeSession.routineNameSnapshot ? localize(activeSession.routineNameSnapshot, locale) : "Workout"}</strong></div></div>
        <div className="workout-header__timer" role="timer" aria-label={`${locale === "vi" ? "Thời gian buổi tập" : "Workout duration"}: ${durationLabel(activeSession.startedAt, now)}`}><Clock3 size={17} aria-hidden="true" /><span>{durationLabel(activeSession.startedAt, now)}</span></div>
        <Button variant="secondary" size="sm" onClick={() => void finish()}>{locale === "vi" ? "Kết thúc" : "Finish"}<Check size={16} /></Button>
      </header>

      <div className="workout-progress">
        <div><span>{progress.completed}/{progress.total} sets</span><strong>{progress.percent}%</strong></div>
        <ProgressBar value={progress.percent} label={locale === "vi" ? "Tiến độ buổi tập" : "Workout progress"} valueText={`${progress.completed}/${progress.total} ${locale === "vi" ? "set hoàn tất" : "sets complete"}`} />
      </div>

      <nav className="exercise-jump" aria-label={locale === "vi" ? "Các bài trong buổi tập" : "Workout exercises"}>
        {activeSession.exercises.map((exercise, index) => {
          const done = exercise.sets.every((set) => set.completedAt);
          return <button type="button" key={exercise.id} className={expandedId === exercise.id ? "exercise-jump__item exercise-jump__item--active" : "exercise-jump__item"} aria-pressed={expandedId === exercise.id} onClick={() => { setExpandedId(exercise.id); document.getElementById(exercise.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span>{done ? <Check size={14} /> : index + 1}</span><small>{localize(exercise.movementNameSnapshot, locale)}</small></button>;
        })}
      </nav>

      <main className="workout-content">
        {activeSession.exercises.map((exercise, exerciseIndex) => {
           const expanded = expandedId === exercise.id;
           const variant = getVariant(exercise.variantId);
           const previous = latestVariantHistory(sessions.filter((session) => session.id !== activeSession.id), exercise.variantId);
           const doneCount = exercise.sets.filter((set) => set.completedAt).length;
           const trackingProfile = exercise.trackingProfileSnapshot
             ?? getTrackingProfile(exercise.variantId)
             ?? trackingProfileForLoadMode(exercise.variantId, exercise.loadEntryModeSnapshot);
           const distanceMode = trackingProfile.effortKind === "distance_duration";
           const timedMode = trackingProfile.effortKind === "duration";
           const repsOnly = trackingProfile.loadEntryMode === "reps_only";
           const weightHeading = repsOnly ? "—" : trackingProfile.loadEntryMode === "per_hand" ? (locale === "vi" ? "KG/TAY" : "KG/HAND") : trackingProfile.loadEntryMode === "per_side" ? (locale === "vi" ? "KG/BÊN" : "KG/SIDE") : trackingProfile.loadEntryMode === "assisted" ? (locale === "vi" ? "KG TRỢ LỰC" : "ASSIST KG") : trackingProfile.loadEntryMode === "bodyweight_plus" ? (locale === "vi" ? "KG THÊM" : "ADDED KG") : "KG";
           const loadFieldLabel = repsOnly
             ? (locale === "vi" ? "Không nhập tạ" : "No load entry")
             : trackingProfile.loadEntryMode === "per_hand"
               ? (locale === "vi" ? "Kg mỗi tay" : "Kg per hand")
               : trackingProfile.loadEntryMode === "per_side"
                 ? (locale === "vi" ? "Kg mỗi bên" : "Kg per side")
                 : trackingProfile.loadEntryMode === "assisted"
                   ? (locale === "vi" ? "Kg trợ lực" : "Assistance kg")
                   : trackingProfile.loadEntryMode === "bodyweight_plus"
                     ? (locale === "vi" ? "Kg thêm" : "Added kg")
                     : (locale === "vi" ? "Mức tạ kg" : "Load kg");
           const effortFieldLabel = distanceMode
             ? (locale === "vi" ? "Quãng đường m" : "Distance m")
             : timedMode
               ? (locale === "vi" ? "Thời gian giây" : "Duration sec")
               : (locale === "vi" ? "Số lần" : "Reps");
           const intensityFieldLabel = distanceMode
             ? (locale === "vi" ? "Thời gian giây" : "Duration sec")
             : "RIR";
          return (
            <Card id={exercise.id} key={exercise.id} className={expanded ? "workout-exercise workout-exercise--expanded" : "workout-exercise"}>
              <button type="button" className="workout-exercise__header" aria-expanded={expanded} aria-controls={`${exercise.id}-details`} onClick={() => setExpandedId(expanded ? undefined : exercise.id)}>
                <span className="workout-exercise__index">{String(exerciseIndex + 1).padStart(2, "0")}</span>
                <div><span className="eyebrow">{localize(exercise.movementNameSnapshot, locale)}</span><h2>{localize(exercise.variantNameSnapshot, locale)}</h2><p>{doneCount}/{exercise.sets.length} sets · {exercise.restSeconds}s {locale === "vi" ? "nghỉ" : "rest"}</p></div>
                <span className="workout-exercise__chevron"><ChevronDown size={20} /></span>
              </button>

              {expanded ? (
                <div className="workout-exercise__body" id={`${exercise.id}-details`}>
                  <div className="exercise-tools">
                    <button type="button" onClick={() => setVariantForExercise(exercise.id)}><RotateCcw size={16} />{locale === "vi" ? "Đổi máy / dụng cụ" : "Switch equipment"}</button>
                    {variant ? <button type="button" onClick={() => setGuideVariant(variant)}><CircleHelp size={16} />{locale === "vi" ? "Xem kỹ thuật" : "Form guide"}</button> : null}
                    <span className="load-mode">{loadModeLabels[exercise.loadEntryModeSnapshot][locale]}</span>
                  </div>

                  <div className="set-table" role="group" aria-label={`${locale === "vi" ? "Các set của" : "Sets for"} ${localize(exercise.variantNameSnapshot, locale)}`}>
                    <div className="set-table__head" aria-hidden="true"><span>SET</span><span>{locale === "vi" ? "TRƯỚC / MỤC TIÊU" : "PREV / TARGET"}</span><span>{weightHeading}</span><span>{distanceMode ? "M" : timedMode ? (locale === "vi" ? "GIÂY" : "SEC") : "REPS"}</span><span>{distanceMode ? (locale === "vi" ? "GIÂY" : "SEC") : "RIR"}</span><span /></div>
                    {exercise.sets.map((set, setIndex) => {
                      const setNumber = setIndex + 1;
                      const workingSetIndex = exercise.sets.slice(0, setIndex + 1).filter((candidate) => candidate.type !== "warmup").length - 1;
                      const prior = set.type === "warmup" ? undefined : previous[workingSetIndex];
                      const targetLabel = distanceMode
                        ? (set.targetMinReps !== undefined || set.targetMaxReps !== undefined ? `${set.targetMinReps ?? "—"}–${set.targetMaxReps ?? "—"} m` : set.targetDurationSeconds ? `${set.targetDurationSeconds}s` : "—")
                        : timedMode
                          ? (set.targetDurationSeconds ? `${set.targetDurationSeconds}s` : "—")
                        : (set.targetMinReps !== undefined || set.targetMaxReps !== undefined ? `${set.targetMinReps ?? "—"}–${set.targetMaxReps ?? "—"}` : "—");
                      const previousLabel = prior
                        ? (distanceMode
                          ? `${prior.distanceMeters ?? "—"}m · ${prior.durationSeconds ?? "—"}s`
                          : timedMode
                            ? `${prior.weightKg ? `${prior.weightKg}kg · ` : ""}${prior.durationSeconds ?? "—"}s`
                            : `${prior.weightKg ?? "—"} × ${prior.reps ?? "—"}`)
                        : targetLabel;
                      const canComplete = distanceMode
                        ? Boolean((set.distanceMeters ?? 0) > 0 || (set.durationSeconds ?? 0) > 0)
                        : timedMode
                          ? Boolean((set.durationSeconds ?? 0) > 0)
                        : Boolean((set.reps ?? 0) > 0);
                      const setTypeLabel = set.type === "warmup"
                        ? (locale === "vi" ? `Set ${setNumber}: khởi động, nhấn để đổi sang set chính` : `Set ${setNumber}: warm-up, press to change to working set`)
                        : (locale === "vi" ? `Set ${setNumber}: set chính, nhấn để đổi sang khởi động` : `Set ${setNumber}: working set, press to change to warm-up`);
                      const completeLabel = set.completedAt
                        ? (locale === "vi" ? `Bỏ hoàn tất set ${setNumber}` : `Undo set ${setNumber}`)
                        : canComplete
                          ? (locale === "vi" ? `Hoàn tất set ${setNumber}` : `Complete set ${setNumber}`)
                          : (locale === "vi" ? `Set ${setNumber}: nhập số lần, quãng đường hoặc thời gian trước` : `Set ${setNumber}: enter reps, distance, or duration first`);
                      return (
                        <div className={set.completedAt ? "set-row set-row--done" : "set-row"} key={set.id}>
                          <button type="button" className="set-type" aria-label={setTypeLabel} aria-pressed={set.type === "warmup"} onClick={() => patchSet(exercise.id, set.id, { type: set.type === "warmup" ? "working" : "warmup" })}>{set.type === "warmup" ? "W" : setNumber}</button>
                          <span className="previous-value"><span className="sr-only">{locale === "vi" ? "Trước hoặc mục tiêu: " : "Previous or target: "}</span>{previousLabel}</span>
                          <div className="set-field set-field--load">
                            <span className="set-field__label">{loadFieldLabel}</span>
                            {repsOnly ? <span className="set-input-placeholder" aria-hidden="true">—</span> : <input aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${loadFieldLabel}`} inputMode="decimal" min="0" step="0.5" value={set.weightKg ?? ""} placeholder="0" onChange={(event) => patchSet(exercise.id, set.id, { weightKg: nonNegativeNumber(event.target.value) })} />}
                          </div>
                          <label className="set-field set-field--effort">
                            <span className="set-field__label">{effortFieldLabel}</span>
                          {distanceMode
                            ? <input aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${effortFieldLabel}`} inputMode="decimal" min="0" step="1" value={set.distanceMeters ?? ""} placeholder="m" onChange={(event) => patchSet(exercise.id, set.id, { distanceMeters: nonNegativeNumber(event.target.value) })} />
                            : timedMode
                              ? <input aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${effortFieldLabel}`} inputMode="numeric" min="0" step="1" value={set.durationSeconds ?? ""} placeholder="s" onChange={(event) => patchSet(exercise.id, set.id, { durationSeconds: nonNegativeInteger(event.target.value) })} />
                            : <input aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${effortFieldLabel}`} inputMode="numeric" min="0" step="1" value={set.reps ?? ""} placeholder="0" onChange={(event) => patchSet(exercise.id, set.id, { reps: nonNegativeInteger(event.target.value) })} />}
                          </label>
                          <label className="set-field set-field--intensity">
                            <span className="set-field__label">{intensityFieldLabel}</span>
                          {distanceMode
                            ? <input aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${intensityFieldLabel}`} inputMode="numeric" min="0" step="1" value={set.durationSeconds ?? ""} placeholder="s" onChange={(event) => patchSet(exercise.id, set.id, { durationSeconds: nonNegativeInteger(event.target.value) })} />
                            : <input aria-label={`Set ${setNumber}, RIR`} inputMode="numeric" min="0" max="10" step="1" value={set.rir ?? ""} placeholder={String(set.targetRir ?? 2)} onChange={(event) => patchSet(exercise.id, set.id, { rir: nonNegativeInteger(event.target.value, 10) })} />}
                          </label>
                          <button type="button" className="set-complete" disabled={!set.completedAt && !canComplete} onClick={() => toggleComplete(exercise.id, set.id)} aria-label={completeLabel} aria-pressed={Boolean(set.completedAt)} title={!set.completedAt && !canComplete ? (locale === "vi" ? "Nhập số lần, quãng đường hoặc thời gian trước" : "Enter reps, distance, or duration first") : undefined}>{set.completedAt ? <Check size={19} /> : null}</button>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" className="add-set-button" onClick={() => save(addSet(activeSession, exercise.id))}><Plus size={17} />{locale === "vi" ? "Thêm set" : "Add set"}</button>
                  {exercise.note ? <Notice>{exercise.note}</Notice> : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </main>

      {activeSession.restTimerEndsAt ? (
        <div className={restRemaining === 0 ? "rest-dock rest-dock--done" : "rest-dock"} role="region" aria-label={locale === "vi" ? "Bộ đếm thời gian nghỉ" : "Rest timer controls"}>
          <span className="rest-dock__icon">{restRemaining ? <Pause size={20} /> : <Play size={20} />}</span>
          <div role="timer" aria-label={`${locale === "vi" ? "Thời gian nghỉ còn lại" : "Rest time remaining"}: ${restRemaining} ${locale === "vi" ? "giây" : "seconds"}`}><small>{restRemaining ? (locale === "vi" ? "Đang nghỉ" : "Rest timer") : (locale === "vi" ? "Sẵn sàng" : "Ready")}</small><strong>{String(Math.floor(restRemaining / 60)).padStart(2, "0")}:{String(restRemaining % 60).padStart(2, "0")}</strong></div>
          <button type="button" aria-label={locale === "vi" ? "Thêm 30 giây nghỉ" : "Add 30 seconds of rest"} onClick={() => modifyRest(30)}>+30s</button>
          <button type="button" onClick={() => modifyRest(undefined)}>{locale === "vi" ? "Bỏ qua" : "Skip"}<X size={16} /></button>
          <span className="sr-only" aria-live="assertive">{restRemaining === 0 ? (locale === "vi" ? "Hết giờ nghỉ, sẵn sàng tập" : "Rest complete, ready") : ""}</span>
        </div>
      ) : null}

      <Modal open={Boolean(modalExercise)} title={locale === "vi" ? "Đổi cách tập" : "Switch variation"} onClose={() => setVariantForExercise(undefined)}>
        {modalExercise ? <div className="variant-picker" role="group" aria-label={locale === "vi" ? "Chọn biến thể thay thế" : "Choose replacement variation"}>
          <p>{locale === "vi" ? "Lịch sử được lưu riêng cho từng biến thể. Các set đã hoàn tất sẽ không bị thay đổi." : "History stays separate for each variation. Completed sets will not be changed."}</p>
          {modalVariants.map((variant) => {
            const ready = variant.equipment.every((item) => availableEquipment.includes(item));
            return <button type="button" key={variant.id} className={variant.id === modalExercise.variantId ? "variant-choice variant-choice--active" : "variant-choice"} aria-pressed={variant.id === modalExercise.variantId} onClick={() => chooseVariant(modalExercise.id, variant)}><span className="variant-choice__icon"><Dumbbell size={19} /></span><span><strong>{localize(variant.name, locale)}</strong><small>{variant.equipment.map((item) => EQUIPMENT_OPTIONS.find((entry) => entry.id === item)?.name[locale]).join(" + ")}</small></span><em>{ready ? <><Check size={14} />{locale === "vi" ? "Sẵn sàng" : "Ready"}</> : (locale === "vi" ? "Thiếu dụng cụ" : "Unavailable")}</em></button>;
          })}
        </div> : null}
      </Modal>

      <Modal open={Boolean(guideVariant)} title={guideVariant ? localize(guideVariant.name, locale) : ""} onClose={() => setGuideVariant(undefined)}>
        {guideVariant ? <div className="quick-guide">{guideVariant.videoGuides[0] ? <ExerciseVideoPlayer guide={guideVariant.videoGuides[0]} locale={locale} compact /> : null}<ol>{guideVariant.instructions.map((instruction, index) => <li key={index}><span>{index + 1}</span><p>{localize(instruction, locale)}</p></li>)}</ol><div className="cue-box"><h4>{locale === "vi" ? "Cue chính" : "Key cue"}</h4>{guideVariant.cues.map((cue, index) => <p key={index}>{localize(cue, locale)}</p>)}</div><div className="safety-box"><h4>{locale === "vi" ? "An toàn" : "Safety"}</h4>{guideVariant.safety.map((item, index) => <p key={index}>{localize(item, locale)}</p>)}</div></div> : null}
      </Modal>
    </div>
  );
}
