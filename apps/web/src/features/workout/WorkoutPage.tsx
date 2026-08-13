import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Dumbbell,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  TimerReset,
  Trash2,
  X
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, Modal, ProgressBar } from "@gym/ui";
import type { ExerciseVariant, LoadEntryMode, ProgressionRule, SetLog, SetType, WorkoutSession } from "@gym/contracts";
import { EQUIPMENT_OPTIONS, MOVEMENTS, getTrackingProfile, getVariant, rankVariantsForEquipment, trackingProfileForLoadMode } from "@gym/catalog";
import {
  addExerciseBlock,
  addSet,
  calculatePlateLoading,
  createFreestyleSession,
  removeExerciseBlock,
  removeSet,
  reorderExerciseBlock,
  sessionProgress,
  suggestDoubleProgression,
  switchExerciseVariant,
  updateSet
} from "@gym/workouts";
import { latestVariantHistory } from "@gym/progress";
import { localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";
import { ExerciseVideoPlayer } from "../../components/ExerciseVideoPlayer";
import "./WorkoutPage.css";

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

const setTypeLabels: Record<SetType, { vi: string; en: string }> = {
  warmup: { vi: "Khởi động", en: "Warm-up" },
  working: { vi: "Set chính", en: "Working" },
  drop: { vi: "Drop set", en: "Drop set" },
  failure: { vi: "Tới ngưỡng", en: "To failure" }
};

const defaultProgressionRule: ProgressionRule = {
  type: "double_progression",
  successSessions: 2,
  defaultIncrementKg: 2.5,
  fallbackIncreasePercent: 5
};

type ExercisePickerState =
  | { mode: "add" }
  | { mode: "replace"; exerciseId: string };

export function WorkoutPage() {
  const navigate = useNavigate();
  const profile = useGymStore((state) => state.profile)!;
  const activeSession = useGymStore((state) => state.activeSession);
  const sessions = useGymStore((state) => state.sessions);
  const setActiveSession = useGymStore((state) => state.setActiveSession);
  const completeWorkout = useGymStore((state) => state.completeWorkout);
  const sessionSaveStatus = useGymStore((state) => state.sessionSaveStatus);
  const storeError = useGymStore((state) => state.error);
  const locale = profile.locale;
  const [now, setNow] = useState(() => activeSession ? new Date(activeSession.startedAt).getTime() : 0);
  const [expandedId, setExpandedId] = useState(activeSession?.activeExerciseId);
  const [exercisePicker, setExercisePicker] = useState<ExercisePickerState>();
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [guideVariant, setGuideVariant] = useState<ExerciseVariant>();
  const [failedSession, setFailedSession] = useState<WorkoutSession>();
  const [actionError, setActionError] = useState<string>();
  const [barWeights, setBarWeights] = useState<Record<string, number>>({});
  const availableEquipment = profile.locations.find((location) => location.id === profile.activeLocationId)?.equipment ?? [];
  const filteredMovements = useMemo(() => {
    const query = exerciseQuery.trim().toLocaleLowerCase(locale);
    if (!query) return MOVEMENTS;
    return MOVEMENTS.filter((movement) => [movement.name.vi, movement.name.en, ...movement.aliases]
      .some((candidate) => candidate.toLocaleLowerCase(locale).includes(query)));
  }, [exerciseQuery, locale]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const progress = activeSession ? sessionProgress(activeSession) : { completed: 0, total: 0, percent: 0 };
  const restRemaining = restLabel(activeSession?.restTimerEndsAt, now);

  const persist = async (session: WorkoutSession) => {
    setFailedSession(undefined);
    setActionError(undefined);
    try {
      await setActiveSession(session);
    } catch (error) {
      if (useGymStore.getState().sessionSaveStatus === "error") {
        setFailedSession(session);
        setActionError(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const save = (session: WorkoutSession) => {
    void persist(session);
  };

  const retrySave = () => {
    const retry = failedSession ?? activeSession;
    if (retry) void persist(retry);
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
    if (seconds === undefined) {
      save({ ...activeSession, restTimerEndsAt: undefined });
      return;
    }
    const currentEnd = new Date(activeSession.restTimerEndsAt ?? Date.now()).getTime();
    save({ ...activeSession, restTimerEndsAt: new Date(Math.max(Date.now(), currentEnd + seconds * 1000)).toISOString() });
  };

  const restartRest = () => {
    if (!activeSession) return;
    const activeExercise = activeSession.exercises.find((exercise) => exercise.id === activeSession.activeExerciseId);
    const seconds = activeExercise?.restSeconds ?? 90;
    save({ ...activeSession, restTimerEndsAt: new Date(Date.now() + seconds * 1000).toISOString() });
  };

  const patchExerciseNote = (exerciseId: string, note: string) => {
    if (!activeSession) return;
    save({
      ...activeSession,
      exercises: activeSession.exercises.map((exercise) => exercise.id === exerciseId
        ? { ...exercise, note: note || undefined }
        : exercise)
    });
  };

  const patchSessionNotes = (notes: string) => {
    if (!activeSession) return;
    save({ ...activeSession, notes: notes || undefined });
  };

  const moveExercise = (exerciseId: string, toIndex: number) => {
    if (!activeSession) return;
    try {
      save(reorderExerciseBlock(activeSession, exerciseId, toIndex));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const deleteExercise = (exerciseId: string) => {
    if (!activeSession) return;
    const exercise = activeSession.exercises.find((item) => item.id === exerciseId);
    if (!exercise || exercise.sets.some((set) => set.completedAt)) return;
    const confirmed = window.confirm(locale === "vi"
      ? `Xóa ${localize(exercise.variantNameSnapshot, locale)} khỏi buổi tập?`
      : `Remove ${localize(exercise.variantNameSnapshot, locale)} from this workout?`);
    if (!confirmed) return;
    try {
      const updated = removeExerciseBlock(activeSession, exerciseId);
      save(updated);
      setExpandedId(updated.activeExerciseId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const deleteSet = (exerciseId: string, setId: string) => {
    if (!activeSession) return;
    try {
      save(removeSet(activeSession, exerciseId, setId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const chooseVariant = (variant: ExerciseVariant) => {
    if (!activeSession) return;
    if (exercisePicker?.mode === "add") {
      const updated = addExerciseBlock(activeSession, variant);
      const added = updated.exercises.at(-1);
      save(updated);
      setExpandedId(added?.id);
      setExercisePicker(undefined);
      setExerciseQuery("");
      return;
    }
    if (exercisePicker?.mode !== "replace") return;
    const current = activeSession.exercises.find((exercise) => exercise.id === exercisePicker.exerciseId);
    if (!current) return;
    if (current.variantId === variant.id) {
      setExercisePicker(undefined);
      setExerciseQuery("");
      return;
    }
    try {
      const updated = switchExerciseVariant(activeSession, current.id, variant);
      save(updated);
      setExpandedId(updated.activeExerciseId);
      setExercisePicker(undefined);
      setExerciseQuery("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const startFreestyle = () => {
    const session = createFreestyleSession({ locationId: profile.activeLocationId });
    setExercisePicker({ mode: "add" });
    setExerciseQuery("");
    void persist(session);
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
    return (
      <div className="workout-empty">
        <EmptyState
          icon={<Dumbbell size={34} />}
          title={locale === "vi" ? "Chưa có buổi tập đang mở" : "No active workout"}
          body={locale === "vi" ? "Chọn lịch có sẵn hoặc bắt đầu tự do rồi thêm bài khi tập." : "Choose a routine or start freestyle and add exercises as you train."}
          action={(
            <div className="workout-empty__actions">
              <Button onClick={() => navigate("/routines")}>{locale === "vi" ? "Chọn lịch tập" : "Choose routine"}</Button>
              <Button variant="secondary" onClick={startFreestyle}><Plus size={17} />{locale === "vi" ? "Tập tự do" : "Freestyle"}</Button>
            </div>
          )}
        />
      </div>
    );
  }

  const pickerExercise = exercisePicker?.mode === "replace"
    ? activeSession.exercises.find((exercise) => exercise.id === exercisePicker.exerciseId)
    : undefined;
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
        <div className="workout-header__title"><span className={sessionSaveStatus === "error" ? "live-dot live-dot--error" : "live-dot"} /> <div><small role="status" aria-live="polite">{saveStatusLabel}</small><strong>{activeSession.routineNameSnapshot ? localize(activeSession.routineNameSnapshot, locale) : (locale === "vi" ? "Buổi tập tự do" : "Freestyle workout")}</strong></div></div>
        <div className="workout-header__timer" role="timer" aria-label={`${locale === "vi" ? "Thời gian buổi tập" : "Workout duration"}: ${durationLabel(activeSession.startedAt, now)}`}><Clock3 size={17} aria-hidden="true" /><span>{durationLabel(activeSession.startedAt, now)}</span></div>
        <Button variant="secondary" size="sm" onClick={() => void finish()}>{locale === "vi" ? "Kết thúc" : "Finish"}<Check size={16} /></Button>
      </header>

      <div className="workout-progress">
        <div><span>{progress.completed}/{progress.total} sets</span><strong>{progress.percent}%</strong></div>
        <ProgressBar value={progress.percent} label={locale === "vi" ? "Tiến độ buổi tập" : "Workout progress"} valueText={`${progress.completed}/${progress.total} ${locale === "vi" ? "set hoàn tất" : "sets complete"}`} />
      </div>

      {sessionSaveStatus === "error" ? (
        <div className="workout-save-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{locale === "vi" ? "Thay đổi gần nhất chưa được lưu." : "Your latest change was not saved."}{actionError || storeError ? ` ${actionError ?? storeError}` : ""}</span>
          <button type="button" onClick={retrySave}>{locale === "vi" ? "Thử lại" : "Retry"}</button>
        </div>
      ) : actionError ? (
        <div className="workout-save-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{actionError}</span>
          <button type="button" aria-label={locale === "vi" ? "Đóng thông báo lỗi" : "Dismiss error"} onClick={() => setActionError(undefined)}><X size={17} /></button>
        </div>
      ) : null}

      <nav className="exercise-jump" aria-label={locale === "vi" ? "Các bài trong buổi tập" : "Workout exercises"}>
        {activeSession.exercises.map((exercise, index) => {
          const done = exercise.sets.every((set) => set.completedAt);
          return <button type="button" key={exercise.id} className={expandedId === exercise.id ? "exercise-jump__item exercise-jump__item--active" : "exercise-jump__item"} aria-pressed={expandedId === exercise.id} onClick={() => { setExpandedId(exercise.id); document.getElementById(exercise.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span>{done ? <Check size={14} /> : index + 1}</span><small>{localize(exercise.movementNameSnapshot, locale)}</small></button>;
        })}
        <button type="button" className="exercise-jump__add" onClick={() => { setExercisePicker({ mode: "add" }); setExerciseQuery(""); }}><Plus size={17} />{locale === "vi" ? "Thêm bài" : "Add exercise"}</button>
      </nav>

      <main className="workout-content">
        {activeSession.exercises.length === 0 ? (
          <Card className="workout-zero-state">
            <Dumbbell size={30} aria-hidden="true" />
            <h2>{locale === "vi" ? "Buổi tập đã sẵn sàng" : "Your workout is ready"}</h2>
            <p>{locale === "vi" ? "Thêm bài đầu tiên. Bạn có thể đổi thiết bị hoặc thêm bài khác bất cứ lúc nào." : "Add your first exercise. You can switch equipment or add another movement at any time."}</p>
            <Button onClick={() => { setExercisePicker({ mode: "add" }); setExerciseQuery(""); }}><Plus size={17} />{locale === "vi" ? "Thêm bài tập" : "Add exercise"}</Button>
          </Card>
        ) : null}
        {activeSession.exercises.map((exercise, exerciseIndex) => {
           const expanded = expandedId === exercise.id;
           const variant = getVariant(exercise.variantId);
           const previous = latestVariantHistory(sessions.filter((session) => session.id !== activeSession.id), exercise.variantId);
           const doneCount = exercise.sets.filter((set) => set.completedAt).length;
           const trackingProfile = exercise.trackingProfileSnapshot
             ?? getTrackingProfile(exercise.variantId)
             ?? trackingProfileForLoadMode(exercise.variantId, exercise.loadEntryModeSnapshot);
           const progression = suggestDoubleProgression(sessions, exercise.variantId, defaultProgressionRule);
           const distanceMode = trackingProfile.effortKind === "distance_duration";
           const timedMode = trackingProfile.effortKind === "duration";
           const repsOnly = trackingProfile.loadEntryMode === "reps_only";
           const plateEligible = trackingProfile.loadEntryMode === "total_weight"
             && Boolean(variant?.equipment.some((equipment) => equipment === "barbell" || equipment === "smith"));
           const barWeightKg = barWeights[exercise.id] ?? 20;
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
                    <button type="button" onClick={() => { setExercisePicker({ mode: "replace", exerciseId: exercise.id }); setExerciseQuery(""); }}><RotateCcw size={16} />{locale === "vi" ? "Đổi máy / dụng cụ" : "Switch equipment"}</button>
                    {variant ? <button type="button" onClick={() => setGuideVariant(variant)}><CircleHelp size={16} />{locale === "vi" ? "Xem kỹ thuật" : "Form guide"}</button> : null}
                    <span className="load-mode">{loadModeLabels[exercise.loadEntryModeSnapshot][locale]}</span>
                  </div>

                  <div className="exercise-edit-tools" role="group" aria-label={locale === "vi" ? `Sắp xếp ${localize(exercise.variantNameSnapshot, locale)}` : `Arrange ${localize(exercise.variantNameSnapshot, locale)}`}>
                    <button type="button" disabled={exerciseIndex === 0} onClick={() => moveExercise(exercise.id, exerciseIndex - 1)} aria-label={locale === "vi" ? "Đưa bài lên trước" : "Move exercise earlier"}><ArrowUp size={17} />{locale === "vi" ? "Lên" : "Up"}</button>
                    <button type="button" disabled={exerciseIndex === activeSession.exercises.length - 1} onClick={() => moveExercise(exercise.id, exerciseIndex + 1)} aria-label={locale === "vi" ? "Đưa bài xuống sau" : "Move exercise later"}><ArrowDown size={17} />{locale === "vi" ? "Xuống" : "Down"}</button>
                    <button type="button" className="exercise-edit-tools__remove" disabled={exercise.sets.some((set) => Boolean(set.completedAt))} onClick={() => deleteExercise(exercise.id)} title={exercise.sets.some((set) => Boolean(set.completedAt)) ? (locale === "vi" ? "Không thể xóa bài đã có set hoàn tất" : "Completed exercise blocks cannot be removed") : undefined}><Trash2 size={17} />{locale === "vi" ? "Xóa bài" : "Remove"}</button>
                  </div>

                  <aside className="progression-advice" aria-label={locale === "vi" ? "Gợi ý tăng tiến theo đúng biến thể" : "Exact-variation progression advice"}>
                    <Sparkles size={18} aria-hidden="true" />
                    <div>
                      <header><strong>{locale === "vi" ? "Gợi ý đúng biến thể" : "Exact-variation advice"}</strong><em>{locale === "vi" ? "Không tự điền" : "Never auto-filled"}</em></header>
                      <p>{progression.explanation[locale]}</p>
                      <small>{localize(exercise.variantNameSnapshot, locale)} · {progression.successStreak}/{progression.requiredSuccessSessions} {locale === "vi" ? "buổi đạt mục tiêu" : "successful sessions"}</small>
                    </div>
                  </aside>

                  {plateEligible ? (
                    <div className="plate-guide-config">
                      <label>
                        <span>{locale === "vi" ? "Khối lượng thanh / Smith" : "Bar / Smith base weight"}</span>
                        <input type="number" aria-label={locale === "vi" ? "Khối lượng thanh hoặc Smith, kg" : "Bar or Smith base weight, kg"} inputMode="decimal" min="0" step="0.5" value={barWeightKg} onChange={(event) => setBarWeights((current) => ({ ...current, [exercise.id]: nonNegativeNumber(event.target.value) ?? 0 }))} />
                        <b>kg</b>
                      </label>
                      <small>{locale === "vi" ? "Chỉ tính số bánh mỗi bên; không thay đổi tải của set." : "Display-only plate math; it never changes the set load."}</small>
                    </div>
                  ) : null}

                  <div className="set-table" role="group" aria-label={`${locale === "vi" ? "Các set của" : "Sets for"} ${localize(exercise.variantNameSnapshot, locale)}`}>
                    <div className="set-table__head" aria-hidden="true"><span>{locale === "vi" ? "LOẠI SET" : "SET TYPE"}</span><span>{locale === "vi" ? "TRƯỚC / MỤC TIÊU" : "PREV / TARGET"}</span><span>{weightHeading}</span><span>{distanceMode ? "M" : timedMode ? (locale === "vi" ? "GIÂY" : "SEC") : "REPS"}</span><span>{distanceMode ? (locale === "vi" ? "GIÂY" : "SEC") : "RIR"}</span><span /></div>
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
                      const plateGuide = plateEligible && (set.weightKg ?? 0) > 0
                        ? calculatePlateLoading(set.weightKg!, { barWeightKg })
                        : undefined;
                      const setTypeLabel = locale === "vi" ? `Loại của set ${setNumber}` : `Type for set ${setNumber}`;
                      const completeLabel = set.completedAt
                        ? (locale === "vi" ? `Bỏ hoàn tất set ${setNumber}` : `Undo set ${setNumber}`)
                        : canComplete
                          ? (locale === "vi" ? `Hoàn tất set ${setNumber}` : `Complete set ${setNumber}`)
                          : (locale === "vi" ? `Set ${setNumber}: nhập số lần, quãng đường hoặc thời gian trước` : `Set ${setNumber}: enter reps, distance, or duration first`);
                      return (
                        <div className={set.completedAt ? "set-row set-row--done" : "set-row"} key={set.id}>
                          <label className="set-type-field">
                            <span className="sr-only">{setTypeLabel}</span>
                            <select className={`set-type set-type--${set.type}`} aria-label={setTypeLabel} value={set.type} disabled={Boolean(set.completedAt)} onChange={(event) => patchSet(exercise.id, set.id, { type: event.target.value as SetType })}>
                              {(Object.keys(setTypeLabels) as SetType[]).map((type) => <option key={type} value={type}>{setTypeLabels[type][locale]}</option>)}
                            </select>
                          </label>
                          <span className="previous-value"><span className="sr-only">{locale === "vi" ? "Trước hoặc mục tiêu: " : "Previous or target: "}</span>{previousLabel}</span>
                          <div className="set-field set-field--load">
                            <span className="set-field__label">{loadFieldLabel}</span>
                            {repsOnly ? <span className="set-input-placeholder" aria-hidden="true">—</span> : <input disabled={Boolean(set.completedAt)} aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${loadFieldLabel}`} inputMode="decimal" min="0" step="0.5" value={set.weightKg ?? ""} placeholder="0" onChange={(event) => patchSet(exercise.id, set.id, { weightKg: nonNegativeNumber(event.target.value) })} />}
                            {plateGuide ? (
                              <small className="plate-hint" aria-label={locale === "vi"
                                ? `Set ${setNumber}: mỗi bên ${plateGuide.platesPerSideKg.join(" cộng ") || "không thêm bánh"}; thanh ${plateGuide.barWeightKg} kg${plateGuide.exact ? "" : `; xếp gần nhất ${plateGuide.achievedTotalKg} kg`}`
                                : `Set ${setNumber}: each side ${plateGuide.platesPerSideKg.join(" plus ") || "no plates"}; ${plateGuide.barWeightKg} kilogram bar${plateGuide.exact ? "" : `; nearest load ${plateGuide.achievedTotalKg} kilograms`}`}>
                                {locale === "vi" ? "Mỗi bên" : "Per side"}: {plateGuide.platesPerSideKg.join(" + ") || "0"} kg{plateGuide.exact ? "" : ` · ≈${plateGuide.achievedTotalKg} kg`}
                              </small>
                            ) : null}
                          </div>
                          <label className="set-field set-field--effort">
                            <span className="set-field__label">{effortFieldLabel}</span>
                          {distanceMode
                            ? <input disabled={Boolean(set.completedAt)} aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${effortFieldLabel}`} inputMode="decimal" min="0" step="1" value={set.distanceMeters ?? ""} placeholder="m" onChange={(event) => patchSet(exercise.id, set.id, { distanceMeters: nonNegativeNumber(event.target.value) })} />
                            : timedMode
                              ? <input disabled={Boolean(set.completedAt)} aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${effortFieldLabel}`} inputMode="numeric" min="0" step="1" value={set.durationSeconds ?? ""} placeholder="s" onChange={(event) => patchSet(exercise.id, set.id, { durationSeconds: nonNegativeInteger(event.target.value) })} />
                            : <input disabled={Boolean(set.completedAt)} aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${effortFieldLabel}`} inputMode="numeric" min="0" step="1" value={set.reps ?? ""} placeholder="0" onChange={(event) => patchSet(exercise.id, set.id, { reps: nonNegativeInteger(event.target.value) })} />}
                          </label>
                          <label className="set-field set-field--intensity">
                            <span className="set-field__label">{intensityFieldLabel}</span>
                          {distanceMode
                            ? <input disabled={Boolean(set.completedAt)} aria-label={`${locale === "vi" ? "Set" : "Set"} ${setNumber}, ${intensityFieldLabel}`} inputMode="numeric" min="0" step="1" value={set.durationSeconds ?? ""} placeholder="s" onChange={(event) => patchSet(exercise.id, set.id, { durationSeconds: nonNegativeInteger(event.target.value) })} />
                            : <input disabled={Boolean(set.completedAt)} aria-label={`Set ${setNumber}, RIR`} inputMode="numeric" min="0" max="10" step="1" value={set.rir ?? ""} placeholder={String(set.targetRir ?? 2)} onChange={(event) => patchSet(exercise.id, set.id, { rir: nonNegativeInteger(event.target.value, 10) })} />}
                          </label>
                          <div className="set-row__actions">
                            <button type="button" className="set-complete" disabled={!set.completedAt && !canComplete} onClick={() => toggleComplete(exercise.id, set.id)} aria-label={completeLabel} aria-pressed={Boolean(set.completedAt)} title={!set.completedAt && !canComplete ? (locale === "vi" ? "Nhập số lần, quãng đường hoặc thời gian trước" : "Enter reps, distance, or duration first") : undefined}>{set.completedAt ? <Check size={19} /> : null}</button>
                            <button type="button" className="set-remove" disabled={Boolean(set.completedAt)} onClick={() => deleteSet(exercise.id, set.id)} aria-label={locale === "vi" ? `Xóa set ${setNumber}` : `Remove set ${setNumber}`} title={set.completedAt ? (locale === "vi" ? "Bỏ hoàn tất trước khi xóa set" : "Undo completion before removing this set") : undefined}><Trash2 size={17} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" className="add-set-button" onClick={() => save(addSet(activeSession, exercise.id))}><Plus size={17} />{locale === "vi" ? "Thêm set" : "Add set"}</button>
                  <label className="workout-note">
                    <span>{locale === "vi" ? "Ghi chú bài tập" : "Exercise note"}</span>
                    <textarea rows={2} defaultValue={exercise.note ?? ""} placeholder={locale === "vi" ? "Ví dụ: chỉnh ghế nấc 4…" : "Example: seat at notch 4…"} onBlur={(event) => patchExerciseNote(exercise.id, event.target.value.trim())} />
                  </label>
                </div>
              ) : null}
            </Card>
          );
        })}
        <Card className="session-note-card">
          <label className="workout-note">
            <span>{locale === "vi" ? "Ghi chú buổi tập" : "Session notes"}</span>
            <textarea key={activeSession.id} rows={3} defaultValue={activeSession.notes ?? ""} placeholder={locale === "vi" ? "Cảm nhận, năng lượng hoặc điều cần nhớ…" : "Energy, how you felt, or anything to remember…"} onBlur={(event) => patchSessionNotes(event.target.value.trim())} />
          </label>
        </Card>
      </main>

      {activeSession.restTimerEndsAt ? (
        <div className={restRemaining === 0 ? "rest-dock rest-dock--done" : "rest-dock"} role="region" aria-label={locale === "vi" ? "Bộ đếm thời gian nghỉ" : "Rest timer controls"}>
          <span className="rest-dock__icon">{restRemaining ? <Pause size={20} /> : <Play size={20} />}</span>
          <div role="timer" aria-label={`${locale === "vi" ? "Thời gian nghỉ còn lại" : "Rest time remaining"}: ${restRemaining} ${locale === "vi" ? "giây" : "seconds"}`}><small>{restRemaining ? (locale === "vi" ? "Đang nghỉ" : "Rest timer") : (locale === "vi" ? "Sẵn sàng" : "Ready")}</small><strong>{String(Math.floor(restRemaining / 60)).padStart(2, "0")}:{String(restRemaining % 60).padStart(2, "0")}</strong></div>
          <div className="rest-dock__controls">
            <button type="button" aria-label={locale === "vi" ? "Giảm 15 giây nghỉ" : "Remove 15 seconds of rest"} onClick={() => modifyRest(-15)}><Minus size={15} />15s</button>
            <button type="button" aria-label={locale === "vi" ? "Thêm 15 giây nghỉ" : "Add 15 seconds of rest"} onClick={() => modifyRest(15)}><Plus size={15} />15s</button>
            <button type="button" aria-label={locale === "vi" ? "Bắt đầu lại giờ nghỉ" : "Restart rest timer"} onClick={restartRest}><TimerReset size={16} /><span>{locale === "vi" ? "Lại" : "Restart"}</span></button>
            <button type="button" onClick={() => modifyRest(undefined)}>{locale === "vi" ? "Bỏ qua" : "Skip"}<X size={16} /></button>
          </div>
          <span className="sr-only" aria-live="assertive">{restRemaining === 0 ? (locale === "vi" ? "Hết giờ nghỉ, sẵn sàng tập" : "Rest complete, ready") : ""}</span>
        </div>
      ) : null}

      <Modal open={Boolean(exercisePicker)} title={exercisePicker?.mode === "add" ? (locale === "vi" ? "Thêm bài tập" : "Add exercise") : (locale === "vi" ? "Đổi máy / dụng cụ" : "Switch equipment")} onClose={() => { setExercisePicker(undefined); setExerciseQuery(""); }}>
        {exercisePicker ? (
          <div className="live-exercise-picker">
            <p>{exercisePicker.mode === "replace"
              ? (locale === "vi" ? "Lịch sử được tách riêng theo từng biến thể. Set đã hoàn tất luôn được giữ nguyên." : "History stays separate for every variation. Completed sets are always preserved.")
              : (locale === "vi" ? "Chọn đúng máy hoặc dụng cụ bạn sẽ dùng để lịch sử và kỷ lục không bị trộn." : "Choose the exact equipment you will use so history and records never get mixed.")}</p>
            {exercisePicker.mode === "add" ? (
              <label className="live-exercise-search">
                <span className="sr-only">{locale === "vi" ? "Tìm bài tập" : "Search exercises"}</span>
                <Search size={18} aria-hidden="true" />
                <input autoFocus type="search" value={exerciseQuery} onChange={(event) => setExerciseQuery(event.target.value)} placeholder={locale === "vi" ? "Tìm theo tên bài…" : "Search by movement…"} />
              </label>
            ) : null}
            <div className="live-exercise-picker__results">
              {(exercisePicker.mode === "replace" && pickerExercise
                ? MOVEMENTS.filter((movement) => movement.id === pickerExercise.movementId)
                : filteredMovements).map((movement) => {
                  const variants = rankVariantsForEquipment(movement.id, availableEquipment);
                  return (
                    <section className="live-movement-choice" key={movement.id} aria-labelledby={`live-movement-${movement.id}`}>
                      <header><h3 id={`live-movement-${movement.id}`}>{localize(movement.name, locale)}</h3><small>{variants.length} {locale === "vi" ? "lựa chọn" : "options"}</small></header>
                      {variants.map((variant) => {
                        const ready = variant.equipment.every((item) => availableEquipment.includes(item));
                        const active = pickerExercise?.variantId === variant.id;
                        return (
                          <button type="button" key={variant.id} className={active ? "variant-choice variant-choice--active" : "variant-choice"} aria-pressed={exercisePicker.mode === "replace" ? active : undefined} onClick={() => chooseVariant(variant)}>
                            <span className="variant-choice__icon"><Dumbbell size={19} /></span>
                            <span><strong>{localize(variant.name, locale)}</strong><small>{variant.equipment.map((item) => EQUIPMENT_OPTIONS.find((entry) => entry.id === item)?.name[locale]).filter(Boolean).join(" + ")}</small></span>
                            <em>{ready ? <><Check size={14} />{locale === "vi" ? "Có sẵn" : "Ready"}</> : (locale === "vi" ? "Ngoài địa điểm" : "Other equipment")}</em>
                          </button>
                        );
                      })}
                    </section>
                  );
                })}
              {exercisePicker.mode === "add" && filteredMovements.length === 0 ? <p className="live-exercise-picker__empty">{locale === "vi" ? "Không tìm thấy bài phù hợp." : "No matching exercise found."}</p> : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(guideVariant)} title={guideVariant ? localize(guideVariant.name, locale) : ""} onClose={() => setGuideVariant(undefined)}>
        {guideVariant ? <div className="quick-guide">{guideVariant.videoGuides[0] ? <ExerciseVideoPlayer guide={guideVariant.videoGuides[0]} locale={locale} compact /> : null}<ol>{guideVariant.instructions.map((instruction, index) => <li key={index}><span>{index + 1}</span><p>{localize(instruction, locale)}</p></li>)}</ol><div className="cue-box"><h4>{locale === "vi" ? "Cue chính" : "Key cue"}</h4>{guideVariant.cues.map((cue, index) => <p key={index}>{localize(cue, locale)}</p>)}</div><div className="safety-box"><h4>{locale === "vi" ? "An toàn" : "Safety"}</h4>{guideVariant.safety.map((item, index) => <p key={index}>{localize(item, locale)}</p>)}</div></div> : null}
      </Modal>
    </div>
  );
}
