import type { ExerciseTechnique } from "@gym/contracts";
import { armTechniques } from "./movements/arms";
import { chestPressTechniques } from "./movements/chest-press";
import { compoundTechniques } from "./movements/compound";
import { lowerTechniques } from "./movements/lower";
import { upperTechniques } from "./movements/upper";

/** Every record at once, for content checks; the app loads one group at a time through `loadExerciseTechnique`. */
export const EXERCISE_TECHNIQUES: ExerciseTechnique[] = [...chestPressTechniques, ...compoundTechniques, ...upperTechniques, ...armTechniques, ...lowerTechniques];
