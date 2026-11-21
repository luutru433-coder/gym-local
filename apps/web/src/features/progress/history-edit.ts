import { createId, type ExerciseTrackingProfile, type SessionExercise, type SetLog, type SetType, type WorkoutSession } from "@gym/contracts";
import { getTrackingProfile, trackingProfileForLoadMode } from "@gym/catalog";

export type SetDraft = {
  id: string;
  type: SetType;
  weightKg: string;
  reps: string;
  durationSeconds: string;
  distanceMeters: string;
  rir: string;
};

export type ExerciseDraft = { id: string; sets: SetDraft[] };

export type SessionDraft = {
  date: string;
  time: string;
  durationMinutes: string;
  notes: string;
  exercises: ExerciseDraft[];
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function text(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parsed(raw: string, integer = false, maximum?: number): number | undefined {
  if (!raw.trim()) return undefined;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return undefined;
  const rounded = integer ? Math.round(value) : value;
  return maximum === undefined ? rounded : Math.min(maximum, rounded);
}

export function exerciseProfile(exercise: SessionExercise): ExerciseTrackingProfile {
  return exercise.trackingProfileSnapshot
    ?? getTrackingProfile(exercise.variantId)
    ?? trackingProfileForLoadMode(exercise.variantId, exercise.loadEntryModeSnapshot);
}

/** Only logged sets are editable; planned sets that were never done stay untouched. */
export function sessionDraft(session: WorkoutSession): SessionDraft {
  const started = new Date(session.startedAt);
  const finished = new Date(session.finishedAt ?? session.startedAt);
  return {
    date: `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())}`,
    time: `${pad(started.getHours())}:${pad(started.getMinutes())}`,
    durationMinutes: String(Math.max(0, Math.round((finished.getTime() - started.getTime()) / 60_000))),
    notes: session.notes ?? "",
    exercises: session.exercises.map((exercise) => ({
      id: exercise.id,
      sets: exercise.sets.filter((set) => set.completedAt).map((set) => ({
        id: set.id,
        type: set.type,
        weightKg: text(set.weightKg),
        reps: text(set.reps),
        durationSeconds: text(set.durationSeconds),
        distanceMeters: text(set.distanceMeters),
        rir: text(set.rir)
      }))
    }))
  };
}

export function newSetDraft(previous?: SetDraft): SetDraft {
  return {
    id: createId("set"),
    type: "working",
    weightKg: previous?.weightKg ?? "",
    reps: previous?.reps ?? "",
    durationSeconds: previous?.durationSeconds ?? "",
    distanceMeters: previous?.distanceMeters ?? "",
    rir: ""
  };
}

function draftHasEffort(set: SetDraft, profile: ExerciseTrackingProfile): boolean {
  if (profile.effortKind === "duration") return (parsed(set.durationSeconds, true) ?? 0) > 0;
  if (profile.effortKind === "distance_duration") return (parsed(set.distanceMeters) ?? 0) > 0 || (parsed(set.durationSeconds, true) ?? 0) > 0;
  return (parsed(set.reps, true) ?? 0) > 0;
}

function hasUnreadableNumber(set: SetDraft): boolean {
  return [set.weightKg, set.reps, set.durationSeconds, set.distanceMeters, set.rir].some((raw) => raw.trim() !== "" && parsed(raw) === undefined);
}

function timingUnchanged(session: WorkoutSession, draft: SessionDraft): boolean {
  const initial = sessionDraft(session);
  return initial.date === draft.date && initial.time === draft.time && initial.durationMinutes === draft.durationMinutes;
}

export type DraftProblem = "date" | "duration" | "set" | "number";

export function draftProblem(session: WorkoutSession, draft: SessionDraft): DraftProblem | undefined {
  if (draft.exercises.some((exercise) => exercise.sets.some(hasUnreadableNumber))) return "number";
  const start = new Date(`${draft.date}T${draft.time || "00:00"}`);
  if (!draft.date || Number.isNaN(start.getTime())) return "date";
  const minutes = parsed(draft.durationMinutes, true);
  if (minutes === undefined || minutes > 24 * 60) return "duration";
  if (!timingUnchanged(session, draft) && start.getTime() + minutes * 60_000 > Date.now()) return "date";
  for (const exercise of draft.exercises) {
    const original = session.exercises.find((item) => item.id === exercise.id);
    if (!original) continue;
    const profile = exerciseProfile(original);
    if (exercise.sets.some((set) => !draftHasEffort(set, profile))) return "set";
  }
  return undefined;
}

/**
 * Applies a history edit. Exercise identity (movement, exact variant, tracking
 * snapshot) is never changed, so records stay within their equipment variant.
 */
export function applySessionDraft(session: WorkoutSession, draft: SessionDraft): WorkoutSession {
  // Untouched timing keeps the stored timestamps exactly; the form only shows minutes.
  const keepTiming = Boolean(session.finishedAt) && timingUnchanged(session, draft);
  const start = keepTiming ? new Date(session.startedAt) : new Date(`${draft.date}T${draft.time || "00:00"}`);
  const end = keepTiming ? new Date(session.finishedAt!) : new Date(start.getTime() + (parsed(draft.durationMinutes, true) ?? 0) * 60_000);
  const shiftMs = start.getTime() - new Date(session.startedAt).getTime();
  const startedAt = keepTiming ? session.startedAt : start.toISOString();
  const finishedAt = keepTiming ? session.finishedAt! : end.toISOString();
  const withinSession = (iso: string) => {
    if (keepTiming) return iso;
    const shifted = new Date(iso).getTime() + shiftMs;
    return new Date(Math.min(Math.max(shifted, start.getTime()), end.getTime())).toISOString();
  };

  const exercises = draft.exercises.flatMap((exerciseDraft): SessionExercise[] => {
    const original = session.exercises.find((item) => item.id === exerciseDraft.id);
    if (!original) return [];
    const profile = exerciseProfile(original);
    const logged = exerciseDraft.sets.map((setDraft): SetLog => {
      const existing = original.sets.find((set) => set.id === setDraft.id);
      const next: SetLog = {
        ...(existing ?? { id: setDraft.id, type: setDraft.type }),
        type: setDraft.type,
        completedAt: existing?.completedAt ? withinSession(existing.completedAt) : finishedAt
      };
      const assign = (key: "weightKg" | "reps" | "durationSeconds" | "distanceMeters" | "rir", value: number | undefined) => {
        if (value === undefined) delete next[key];
        else next[key] = value;
      };
      if (profile.loadEntryMode !== "reps_only") assign("weightKg", parsed(setDraft.weightKg));
      if (profile.effortKind === "reps") {
        assign("reps", parsed(setDraft.reps, true));
        assign("rir", parsed(setDraft.rir, true, 10));
      } else {
        assign("durationSeconds", parsed(setDraft.durationSeconds, true));
        if (profile.effortKind === "distance_duration") assign("distanceMeters", parsed(setDraft.distanceMeters));
      }
      return next;
    });
    const planned = original.sets.filter((set) => !set.completedAt);
    return [{ ...original, sets: [...logged, ...planned] }];
  });

  const notes = draft.notes.trim();
  const updated: WorkoutSession = { ...session, startedAt, finishedAt, exercises };
  if (notes) updated.notes = notes;
  else delete updated.notes;
  if (updated.activeExerciseId && !exercises.some((exercise) => exercise.id === updated.activeExerciseId)) delete updated.activeExerciseId;
  return updated;
}
