import type { EquipmentType, ExerciseTechnique } from "@gym/contracts";

export { blendPose, markPoint, measureAngle, resolvePose, shownAngle } from "./figure";
export type { Joints, Point } from "./figure";

type Group = () => Promise<ExerciseTechnique[]>;

const chest: Group = () => import("./movements/chest-press").then((module) => module.chestPressTechniques);
const compound: Group = () => import("./movements/compound").then((module) => module.compoundTechniques);
const upper: Group = () => import("./movements/upper").then((module) => module.upperTechniques);
const arms: Group = () => import("./movements/arms").then((module) => module.armTechniques);
const lower: Group = () => import("./movements/lower").then((module) => module.lowerTechniques);

/** Which lazily loaded group holds each movement's records. */
export const TECHNIQUE_GROUPS: Record<string, Group> = {
  chest_press: chest,
  squat: compound,
  deadlift: compound,
  romanian_deadlift: compound,
  overhead_press: compound,
  horizontal_row: compound,
  pull_up: compound,
  lat_pulldown: compound,
  incline_chest_press: upper,
  chest_fly: upper,
  push_up: upper,
  dip: upper,
  one_arm_row: upper,
  face_pull: upper,
  lateral_raise: upper,
  rear_delt_fly: upper,
  biceps_curl: arms,
  hammer_curl: arms,
  triceps_pushdown: arms,
  overhead_triceps_extension: arms,
  triceps_press: arms,
  leg_press: lower,
  split_squat: lower,
  lunge: lower,
  hip_thrust: lower,
  leg_curl: lower,
  leg_extension: lower,
  standing_calf_raise: lower,
  plank: lower,
  crunch: lower
};

export async function loadExerciseTechnique(variantId: string): Promise<ExerciseTechnique | undefined> {
  const [movementId, equipment] = variantId.split("__");
  const group = Object.hasOwn(TECHNIQUE_GROUPS, movementId) ? TECHNIQUE_GROUPS[movementId] : undefined;
  if (!group) return undefined;
  return (await group()).find((technique) => technique.movementId === movementId && technique.equipment.includes(equipment as EquipmentType));
}
