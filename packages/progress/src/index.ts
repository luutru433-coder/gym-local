import type { MuscleGroup, SessionExercise, SetLog, WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, trackingProfileForLoadMode } from "@gym/catalog";

export interface VariantHistoryEntry {
  sessionId: string;
  date: string;
  weightKg?: number;
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  e1rm?: number;
  loadEntryMode: SessionExercise["loadEntryModeSnapshot"];
}

export interface SessionVolumeMetrics {
  externalLoadVolumeKg: number;
  contributingSets: number;
  excludedSets: number;
}

export interface WorkoutCalendarDay {
  date: string;
  sessions: number;
  completedWorkingSets: number;
  externalLoadVolumeKg: number;
  durationMinutes: number;
}

export interface VariantTrendPoint {
  sessionId: string;
  date: string;
  variantId: string;
  bestLoadKg?: number;
  minAssistanceKg?: number;
  bestReps?: number;
  bestDurationSeconds?: number;
  bestDistanceMeters?: number;
  bestE1rmKg?: number;
  externalLoadVolumeKg: number;
  completedWorkingSets: number;
  isLoadPr: boolean;
  isE1rmPr: boolean;
  isAssistancePr: boolean;
}

export interface VariantVolumeSummary {
  variantId: string;
  movementId: string;
  completedWorkingSets: number;
  externalLoadVolumeKg: number;
}

export type VolumeExclusionReason =
  | "incomplete"
  | "warmup"
  | "non_repetition_effort"
  | "unsupported_load_semantics"
  | "missing_load_or_reps";

export interface SetPerformanceMetrics {
  externalLoadVolumeKg?: number;
  e1rmKg?: number;
  assistanceKg?: number;
  exclusionReason?: VolumeExclusionReason;
}

export function estimatedOneRepMax(weightKg: number, reps: number): number | undefined {
  if (weightKg <= 0 || reps < 1 || reps > 10) return undefined;
  return Math.round((weightKg * (1 + reps / 30)) * 10) / 10;
}

function completedWorkingSets(exercise: SessionExercise): SetLog[] {
  return exercise.sets.filter((set) => set.completedAt && set.type !== "warmup");
}

function orderedFinishedSessions(sessions: WorkoutSession[]): WorkoutSession[] {
  return [...sessions]
    .filter((session) => Boolean(session.finishedAt))
    .sort((a, b) => new Date(b.finishedAt!).getTime() - new Date(a.finishedAt!).getTime());
}

function trackingProfile(exercise: SessionExercise) {
  return exercise.trackingProfileSnapshot
    ?? getTrackingProfile(exercise.variantId)
    ?? trackingProfileForLoadMode(exercise.variantId, exercise.loadEntryModeSnapshot);
}

export function setPerformanceMetrics(exercise: SessionExercise, set: SetLog): SetPerformanceMetrics {
  if (!set.completedAt) return { exclusionReason: "incomplete" };
  if (set.type === "warmup") return { exclusionReason: "warmup" };
  const profile = trackingProfile(exercise);
  const e1rmKg = profile.e1rmMetric === "entered_load" && set.weightKg && set.reps
    ? estimatedOneRepMax(set.weightKg, set.reps)
    : undefined;
  if (profile.loadEntryMode === "assisted") {
    return { assistanceKg: set.weightKg, e1rmKg, exclusionReason: "unsupported_load_semantics" };
  }
  if (profile.effortKind !== "reps") return { e1rmKg, exclusionReason: "non_repetition_effort" };
  if (profile.volumeMetric === "none") return { e1rmKg, exclusionReason: "unsupported_load_semantics" };
  if (!set.weightKg || !set.reps) return { e1rmKg, exclusionReason: "missing_load_or_reps" };
  return {
    externalLoadVolumeKg: Math.round(set.weightKg * set.reps * (profile.volumeMultiplier ?? 1) * 10) / 10,
    e1rmKg
  };
}

function historyEntries(session: WorkoutSession, exercise: SessionExercise): VariantHistoryEntry[] {
  const profile = trackingProfile(exercise);
  return completedWorkingSets(exercise).map((set) => ({
    sessionId: session.id,
    date: session.finishedAt!,
    weightKg: set.weightKg,
    reps: set.reps,
    durationSeconds: set.durationSeconds,
    distanceMeters: set.distanceMeters,
    e1rm: setPerformanceMetrics(exercise, set).e1rmKg,
    loadEntryMode: profile.loadEntryMode
  }));
}

export function variantHistory(sessions: WorkoutSession[], variantId: string): VariantHistoryEntry[] {
  return orderedFinishedSessions(sessions).flatMap((session) => session.exercises
    .filter((exercise) => exercise.variantId === variantId)
    .flatMap((exercise) => historyEntries(session, exercise)));
}

export function latestVariantHistory(sessions: WorkoutSession[], variantId: string): VariantHistoryEntry[] {
  for (const session of orderedFinishedSessions(sessions)) {
    const exercise = [...session.exercises]
      .reverse()
      .find((item) => item.variantId === variantId && completedWorkingSets(item).length > 0);
    if (exercise) return historyEntries(session, exercise);
  }
  return [];
}

export function personalRecord(sessions: WorkoutSession[], variantId: string) {
  const history = variantHistory(sessions, variantId);
  const assisted = history.some((entry) => entry.loadEntryMode === "assisted");
  const assistanceValues = assisted
    ? history.map((entry) => entry.weightKg).filter((value): value is number => value !== undefined && value >= 0)
    : [];
  const best = history.reduce<{ maxWeightKg: number; maxE1rm: number }>((record, entry) => ({
    maxWeightKg: assisted ? 0 : Math.max(record.maxWeightKg, entry.weightKg ?? 0),
    maxE1rm: Math.max(record.maxE1rm, entry.e1rm ?? 0)
  }), { maxWeightKg: 0, maxE1rm: 0 });
  return {
    ...best,
    minAssistanceKg: assistanceValues.length ? Math.min(...assistanceValues) : undefined
  };
}

export function sessionVolumeMetrics(session: WorkoutSession): SessionVolumeMetrics {
  let externalLoadVolumeKg = 0;
  let contributingSets = 0;
  let excludedSets = 0;

  session.exercises.forEach((exercise) => {
    completedWorkingSets(exercise).forEach((set) => {
      const metrics = setPerformanceMetrics(exercise, set);
      if (metrics.externalLoadVolumeKg === undefined) {
        excludedSets += 1;
        return;
      }
      externalLoadVolumeKg += metrics.externalLoadVolumeKg;
      contributingSets += 1;
    });
  });

  return {
    externalLoadVolumeKg: Math.round(externalLoadVolumeKg * 10) / 10,
    contributingSets,
    excludedSets
  };
}

export function sessionExternalVolume(session: WorkoutSession): number {
  return sessionVolumeMetrics(session).externalLoadVolumeKg;
}

export function weeklyMuscleSets(sessions: WorkoutSession[], weekStart: Date): Partial<Record<MuscleGroup, number>> {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  const result: Partial<Record<MuscleGroup, number>> = {};
  sessions.filter((session) => {
    if (!session.finishedAt) return false;
    const date = new Date(session.finishedAt);
    return date >= weekStart && date < end;
  }).forEach((session) => {
    session.exercises.forEach((exercise) => {
      const movement = getMovement(exercise.movementId);
      if (!movement) return;
      const workingSets = exercise.sets.filter((set) => set.completedAt && set.type !== "warmup").length;
      movement.primaryMuscles.forEach((muscle) => {
        result[muscle] = (result[muscle] ?? 0) + workingSets;
      });
    });
  });
  return result;
}

function localDateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function workoutCalendar(sessions: WorkoutSession[]): WorkoutCalendarDay[] {
  const days = new Map<string, WorkoutCalendarDay>();
  orderedFinishedSessions(sessions).forEach((session) => {
    const date = localDateKey(session.finishedAt!);
    const existing = days.get(date) ?? {
      date,
      sessions: 0,
      completedWorkingSets: 0,
      externalLoadVolumeKg: 0,
      durationMinutes: 0
    };
    existing.sessions += 1;
    existing.completedWorkingSets += session.exercises.reduce(
      (sum, exercise) => sum + completedWorkingSets(exercise).length,
      0
    );
    existing.externalLoadVolumeKg += sessionExternalVolume(session);
    existing.durationMinutes += Math.max(0, Math.round(
      (new Date(session.finishedAt!).getTime() - new Date(session.startedAt).getTime()) / 60_000
    ));
    days.set(date, existing);
  });
  return [...days.values()]
    .map((day) => ({ ...day, externalLoadVolumeKg: Math.round(day.externalLoadVolumeKg * 10) / 10 }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function exactVariantTrend(sessions: WorkoutSession[], variantId: string): VariantTrendPoint[] {
  let recordLoad = 0;
  let recordE1rm = 0;
  let recordAssistance = Number.POSITIVE_INFINITY;
  return orderedFinishedSessions(sessions)
    .reverse()
    .flatMap((session) => {
      const exercises = session.exercises.filter((exercise) => exercise.variantId === variantId);
      if (!exercises.length) return [];
      const sets = exercises.flatMap(completedWorkingSets);
      if (!sets.length) return [];
      const profile = trackingProfile(exercises[0]);
      const loadValues = sets.map((set) => set.weightKg).filter((value): value is number => value !== undefined);
      const e1rmValues = exercises.flatMap((exercise) => completedWorkingSets(exercise)
        .map((set) => setPerformanceMetrics(exercise, set).e1rmKg)
        .filter((value): value is number => value !== undefined));
      const bestLoadKg = profile.loadEntryMode === "assisted" || !loadValues.length ? undefined : Math.max(...loadValues);
      const minAssistanceKg = profile.loadEntryMode === "assisted" && loadValues.length ? Math.min(...loadValues) : undefined;
      const bestE1rmKg = e1rmValues.length ? Math.max(...e1rmValues) : undefined;
      const externalLoadVolumeKg = exercises.reduce((sum, exercise) => sum + completedWorkingSets(exercise)
        .reduce((setSum, set) => setSum + (setPerformanceMetrics(exercise, set).externalLoadVolumeKg ?? 0), 0), 0);
      const isLoadPr = bestLoadKg !== undefined && bestLoadKg > recordLoad;
      const isE1rmPr = bestE1rmKg !== undefined && bestE1rmKg > recordE1rm;
      const isAssistancePr = minAssistanceKg !== undefined && minAssistanceKg < recordAssistance;
      if (bestLoadKg !== undefined) recordLoad = Math.max(recordLoad, bestLoadKg);
      if (bestE1rmKg !== undefined) recordE1rm = Math.max(recordE1rm, bestE1rmKg);
      if (minAssistanceKg !== undefined) recordAssistance = Math.min(recordAssistance, minAssistanceKg);
      return [{
        sessionId: session.id,
        date: session.finishedAt!,
        variantId,
        bestLoadKg,
        minAssistanceKg,
        bestReps: Math.max(0, ...sets.map((set) => set.reps ?? 0)) || undefined,
        bestDurationSeconds: Math.max(0, ...sets.map((set) => set.durationSeconds ?? 0)) || undefined,
        bestDistanceMeters: Math.max(0, ...sets.map((set) => set.distanceMeters ?? 0)) || undefined,
        bestE1rmKg,
        externalLoadVolumeKg: Math.round(externalLoadVolumeKg * 10) / 10,
        completedWorkingSets: sets.length,
        isLoadPr,
        isE1rmPr,
        isAssistancePr
      }];
    });
}

export function variantVolumeSummary(sessions: WorkoutSession[]): VariantVolumeSummary[] {
  const summaries = new Map<string, VariantVolumeSummary>();
  orderedFinishedSessions(sessions).forEach((session) => {
    session.exercises.forEach((exercise) => {
      const existing = summaries.get(exercise.variantId) ?? {
        variantId: exercise.variantId,
        movementId: exercise.movementId,
        completedWorkingSets: 0,
        externalLoadVolumeKg: 0
      };
      completedWorkingSets(exercise).forEach((set) => {
        existing.completedWorkingSets += 1;
        existing.externalLoadVolumeKg += setPerformanceMetrics(exercise, set).externalLoadVolumeKg ?? 0;
      });
      summaries.set(exercise.variantId, existing);
    });
  });
  return [...summaries.values()]
    .map((summary) => ({ ...summary, externalLoadVolumeKg: Math.round(summary.externalLoadVolumeKg * 10) / 10 }))
    .sort((left, right) => right.externalLoadVolumeKg - left.externalLoadVolumeKg
      || right.completedWorkingSets - left.completedWorkingSets
      || left.variantId.localeCompare(right.variantId));
}
