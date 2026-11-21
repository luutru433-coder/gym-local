import { useEffect, useId, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { ExerciseAnimation as ExerciseAnimationContent, MuscleGroup } from "@gym/contracts";
import { BackArtwork, FrontArtwork } from "./BodyArtwork";
import { frameUrl, muscleLabels } from "../lib/exercise-visuals";

const bodyRegions: Record<MuscleGroup, string[]> = {
  chest: ["chest"],
  back: ["lats", "middle back", "traps", "lower back"],
  shoulders: ["shoulders"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  quadriceps: ["quadriceps"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  calves: ["calves"],
  core: ["abdominals", "obliques"],
  forearms: ["forearms"],
  full_body: ["chest", "lats", "middle back", "traps", "lower back", "shoulders", "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves", "abdominals", "obliques", "forearms"]
};

const regionsFor = (muscles: MuscleGroup[]) => [...new Set(muscles.flatMap((muscle) => bodyRegions[muscle]))];

export function MuscleMap({ primaryMuscles, secondaryMuscles, title }: { primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[]; title: string }) {
  const idPrefix = `muscle-map-${useId().replaceAll(":", "")}`;
  const primary = regionsFor(primaryMuscles);
  const secondary = regionsFor(secondaryMuscles).filter((region) => !primary.includes(region));
  return (
    <svg className="muscle-map" viewBox="0 0 1320.92 1206.46" fill="none" role="img" aria-label={title}>
      <FrontArtwork idPrefix={idPrefix} primaryMuscles={primary} secondaryMuscles={secondary} />
      <g transform="translate(660.46 0)"><BackArtwork idPrefix={idPrefix} primaryMuscles={primary} secondaryMuscles={secondary} /></g>
    </svg>
  );
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ExerciseAnimation({ animation, primaryMuscles, secondaryMuscles, locale, compact = false }: {
  animation?: ExerciseAnimationContent;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  locale: "vi" | "en";
  compact?: boolean;
}) {
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [step, setStep] = useState(0);
  const frames = animation?.frames ?? [];
  // Start -> end -> back to start, so the loop reads as one repetition.
  const sequence = frames.length > 2 ? [...frames.keys(), ...[...frames.keys()].slice(1, -1).reverse()] : [...frames.keys()];
  const activeFrame = sequence.length ? sequence[step % sequence.length] : 0;

  useEffect(() => {
    if (!playing || sequence.length < 2 || !animation) return undefined;
    const timer = window.setInterval(() => setStep((current) => current + 1), animation.frameDurationMs);
    return () => window.clearInterval(timer);
  }, [animation, playing, sequence.length]);

  const names = (muscles: MuscleGroup[]) => muscles.map((muscle) => muscleLabels[muscle][locale]).join(", ");
  const muscleTitle = `${locale === "vi" ? "Cơ chính" : "Primary"}: ${names(primaryMuscles)}${secondaryMuscles.length ? `; ${locale === "vi" ? "cơ phụ" : "secondary"}: ${names(secondaryMuscles)}` : ""}`;

  return (
    <figure className={compact ? "exercise-animation exercise-animation--compact" : "exercise-animation"}>
      <div className="exercise-animation__stage">
        {animation ? (
          <div className="exercise-animation__figure" data-testid="exercise-animation" data-frame={activeFrame + 1} data-playing={playing}>
            {frames.map((frame, index) => (
              <img key={frame} src={frameUrl(frame)} alt={index === 0 ? `${locale === "vi" ? "Hoạt ảnh" : "Animation"}: ${animation.shownExercise[locale]}` : ""} className={index === activeFrame ? "is-active" : ""} draggable={false} />
            ))}
            <button type="button" className="exercise-animation__toggle" onClick={() => setPlaying((current) => !current)} aria-label={playing ? (locale === "vi" ? "Tạm dừng hoạt ảnh" : "Pause animation") : (locale === "vi" ? "Phát hoạt ảnh" : "Play animation")}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div className="exercise-animation__dots" aria-hidden="true">{frames.map((frame, index) => <span key={frame} className={index === activeFrame ? "is-active" : ""} />)}</div>
          </div>
        ) : null}
        <div className="exercise-animation__muscles">
          <MuscleMap primaryMuscles={primaryMuscles} secondaryMuscles={secondaryMuscles} title={muscleTitle} />
          <ul>
            <li><i className="legend legend--primary" />{names(primaryMuscles)}</li>
            {secondaryMuscles.length ? <li><i className="legend legend--secondary" />{names(secondaryMuscles)}</li> : null}
          </ul>
        </div>
      </div>
      {animation ? (
        <figcaption>
          <span>{locale === "vi" ? "Hoạt ảnh offline · có sẵn trong app" : "Offline animation · bundled in the app"}</span>
          {animation.match === "closest" ? <strong>{locale === "vi" ? `Minh hoạ gần nhất: ${animation.shownExercise[locale]}` : `Closest illustration: ${animation.shownExercise[locale]}`}</strong> : null}
          <small>{locale === "vi" ? "Hình vẽ: Bryl Lim / Everkinetic, CC BY-SA 4.0" : "Artwork: Bryl Lim / Everkinetic, CC BY-SA 4.0"}</small>
        </figcaption>
      ) : null}
    </figure>
  );
}
