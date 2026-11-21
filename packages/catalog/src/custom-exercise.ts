import { createId, CUSTOM_MOVEMENT_ID_PREFIX, CUSTOM_VARIANT_ID_PREFIX } from "@gym/contracts";
import type { EquipmentType, ExerciseVariant, LoadEntryMode, Movement, MuscleGroup } from "@gym/contracts";

type Pattern = Movement["pattern"];

export interface CustomExerciseInput {
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: EquipmentType;
  loadEntryMode: LoadEntryMode;
  note?: string;
  /** Ready-made steps, e.g. from a downloaded exercise list; shown in place of the note. */
  instructions?: string[];
}

const customPattern: Partial<Record<MuscleGroup, Pattern>> = {
  chest: "push",
  shoulders: "push",
  triceps: "isolation",
  back: "pull",
  biceps: "isolation",
  forearms: "isolation",
  quadriceps: "squat",
  hamstrings: "hinge",
  glutes: "hinge",
  calves: "isolation",
  core: "core",
  full_body: "carry"
};

/** Builds (or rebuilds, keeping `existing` IDs) one custom movement with its single variant. */
export function buildCustomExercise(
  input: CustomExerciseInput,
  existing?: { movementId: string; variantId: string; contentVersion: number }
): { movement: Movement; variant: ExerciseVariant } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Custom exercise name is required");
  if (name.length > 80) throw new Error("Custom exercise name is too long");
  const note = input.note?.trim() ?? "";
  if (note.length > 500) throw new Error("Custom exercise note is too long");
  const movementId = existing?.movementId ?? createId(CUSTOM_MOVEMENT_ID_PREFIX.slice(0, -1));
  const variantId = existing?.variantId ?? createId(CUSTOM_VARIANT_ID_PREFIX.slice(0, -1));
  const contentVersion = (existing?.contentVersion ?? 0) + 1;
  const localizedName = { vi: name, en: name };
  return {
    movement: {
      id: movementId,
      name: localizedName,
      aliases: [name.toLowerCase()],
      primaryMuscles: [input.primaryMuscle],
      secondaryMuscles: [...new Set(input.secondaryMuscles)].filter((muscle) => muscle !== input.primaryMuscle),
      pattern: customPattern[input.primaryMuscle] ?? "isolation",
      description: { vi: note || "Bài tập do bạn tự tạo.", en: note || "An exercise you created." },
      reviewStatus: "draft",
      contentVersion
    },
    variant: {
      id: variantId,
      movementId,
      name: localizedName,
      equipment: [input.equipment],
      difficulty: "beginner",
      loadEntryMode: input.loadEntryMode,
      instructions: input.instructions?.length ? input.instructions.slice(0, 12).map((step) => ({ vi: step, en: step })) : note ? [{ vi: note, en: note }] : [],
      cues: [],
      commonMistakes: [],
      safety: [],
      media: [],
      videoGuides: [],
      sourceIds: [],
      reviewStatus: "draft",
      contentVersion
    }
  };
}
