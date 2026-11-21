import type { EquipmentType, ExerciseTechnique } from "@gym/contracts";
import { chestPressTechniques } from "./movements/chest-press";
import { armTechniques } from "./movements/arms";
import { compoundTechniques } from "./movements/compound";
import { upperTechniques } from "./movements/upper";

export { blendPose, markPoint, measureAngle, resolvePose, shownAngle } from "./figure";
export type { Joints, Point } from "./figure";

export const EXERCISE_TECHNIQUES: ExerciseTechnique[] = [...chestPressTechniques, ...compoundTechniques, ...upperTechniques, ...armTechniques];

export function getExerciseTechnique(variantId: string): ExerciseTechnique | undefined {
  const [movementId, equipment] = variantId.split("__");
  return EXERCISE_TECHNIQUES.find((technique) => technique.movementId === movementId && technique.equipment.includes(equipment as EquipmentType));
}
