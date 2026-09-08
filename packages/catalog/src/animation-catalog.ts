/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { animationCatalogVersion } from "@gym/contracts";

export interface AnimationCatalogRecord {
  readonly exerciseVariantId: string;
  readonly animationId: string;
  readonly animationCatalogVersion: typeof animationCatalogVersion;
  readonly cameraPreset: "front" | "side" | "three_quarter";
}

const records = [
  ["push_up__bodyweight", "animation.pilot-01.push-up.bodyweight", "side"],
  ["plank__bodyweight", "animation.pilot-01.plank.bodyweight", "side"],
  ["one_arm_row__dumbbell", "animation.pilot-01.one-arm-row.dumbbell", "three_quarter"],
  ["squat__barbell", "animation.pilot-01.squat.barbell", "side"],
  ["face_pull__cable", "animation.pilot-01.face-pull.cable", "three_quarter"],
  ["leg_press__machine", "animation.pilot-01.leg-press.machine", "side"],
  ["leg_extension__machine", "animation.pilot-01.leg-extension.machine", "side"],
  ["split_squat__smith", "animation.pilot-01.split-squat.smith", "three_quarter"],
  ["anti_rotation__resistance_band", "animation.pilot-01.anti-rotation.resistance-band", "front"],
  ["lateral_raise__dumbbell", "animation.pilot-01.lateral-raise.dumbbell", "front"],
  ["hip_thrust__barbell", "animation.pilot-01.hip-thrust.barbell", "side"],
  ["farmer_carry__kettlebell", "animation.pilot-01.farmer-carry.kettlebell", "three_quarter"]
] as const;

export const ANIMATION_CATALOG: readonly Readonly<AnimationCatalogRecord>[] = Object.freeze(records.map(
  ([exerciseVariantId, animationId, cameraPreset]) => Object.freeze({ exerciseVariantId, animationId, animationCatalogVersion, cameraPreset })
));

const byVariant = new Map(ANIMATION_CATALOG.map((record) => [record.exerciseVariantId, record]));

export function getAnimationCatalogRecord(exerciseVariantId: string): Readonly<AnimationCatalogRecord> | undefined {
  return byVariant.get(exerciseVariantId);
}
