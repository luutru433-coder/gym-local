import type { EquipmentType, LoadEntryMode, MuscleGroup } from "@gym/contracts";
import type { CustomExerciseInput } from "@gym/catalog/custom";

/** The source's description of one exercise (ExerciseDB vocabulary), as kept with a downloaded image. */
export interface ExternalExerciseDetails {
  bodyParts: string[];
  equipments: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
}

const MUSCLES: [RegExp, MuscleGroup][] = [
  [/pector|chest|serratus/, "chest"],
  [/delt|rotator|shoulder/, "shoulders"],
  [/tricep/, "triceps"],
  [/bicep|brachialis/, "biceps"],
  [/forearm|wrist|grip|hands/, "forearms"],
  [/lat|trap|rhomboid|erector|spine|back|levator|sternocleido/, "back"],
  [/quad|hip flexor|adductor/, "quadriceps"],
  [/hamstring/, "hamstrings"],
  [/glute|abductor/, "glutes"],
  [/cal(f|ves)|soleus|tibialis|ankle|feet/, "calves"],
  [/ab(s|dominals)?$|abdominal|oblique|core|waist/, "core"],
  [/cardio/, "full_body"]
];

const BODY_PARTS: Record<string, MuscleGroup> = {
  chest: "chest", back: "back", shoulders: "shoulders", "upper arms": "biceps", "lower arms": "forearms",
  "upper legs": "quadriceps", "lower legs": "calves", waist: "core", neck: "back", cardio: "full_body"
};

const EQUIPMENT: [RegExp, EquipmentType, LoadEntryMode][] = [
  [/smith/, "smith", "total_weight"],
  [/trap bar/, "trap_bar", "total_weight"],
  [/barbell|ez bar/, "barbell", "total_weight"],
  [/dumbbell/, "dumbbell", "per_hand"],
  [/kettlebell/, "kettlebell", "per_hand"],
  [/cable|rope/, "cable", "total_weight"],
  [/band/, "resistance_band", "reps_only"],
  [/assisted/, "machine", "assisted"],
  [/ergometer|bike|elliptical|stepmill/, "machine", "duration_distance"],
  [/machine/, "machine", "total_weight"],
  [/weighted/, "bodyweight", "bodyweight_plus"]
];

function muscleOf(word: string): MuscleGroup | undefined {
  const text = word.toLowerCase();
  return MUSCLES.find(([pattern]) => pattern.test(text))?.[1];
}

const titleCase = (name: string) => name.trim().replace(/\s+/g, " ").replace(/(^|[\s(/-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());

/** Turns a downloaded exercise into the same input the "Create exercise" form produces. */
export function customInputFromExternal(name: string, details: ExternalExerciseDetails): CustomExerciseInput {
  const primaryMuscle = details.targetMuscles.map(muscleOf).find(Boolean) ?? BODY_PARTS[details.bodyParts[0]?.toLowerCase() ?? ""] ?? "full_body";
  const secondaryMuscles = [...new Set(details.secondaryMuscles.map(muscleOf).filter((muscle): muscle is MuscleGroup => Boolean(muscle) && muscle !== primaryMuscle))];
  const gear = details.equipments.join(" ").toLowerCase();
  const [, equipment, loadEntryMode] = EQUIPMENT.find(([pattern]) => pattern.test(gear)) ?? [undefined, "bodyweight" as const, "reps_only" as const];
  return {
    name: titleCase(name).slice(0, 80),
    primaryMuscle,
    secondaryMuscles,
    equipment,
    loadEntryMode,
    instructions: details.instructions.map((step) => step.replace(/^Step:\s*\d+\s*/i, "").trim()).filter(Boolean)
  };
}
