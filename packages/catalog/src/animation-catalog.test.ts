/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from "vitest";
import { ANIMATION_CATALOG, EXERCISE_VARIANTS, getAnimationCatalogRecord } from "./index";

describe("animation pilot catalog", () => {
  it("maps exactly 12 of the 199 exact variants", () => {
    expect(EXERCISE_VARIANTS).toHaveLength(199);
    expect(ANIMATION_CATALOG).toHaveLength(12);
    expect(new Set(ANIMATION_CATALOG.map((record) => record.exerciseVariantId)).size).toBe(12);
    expect(new Set(ANIMATION_CATALOG.map((record) => record.animationId)).size).toBe(12);
    expect(EXERCISE_VARIANTS.filter((variant) => getAnimationCatalogRecord(variant.id))).toHaveLength(12);
    expect(EXERCISE_VARIANTS.filter((variant) => !getAnimationCatalogRecord(variant.id))).toHaveLength(187);
  });

  it("never aliases case, equipment, or similar IDs", () => {
    expect(getAnimationCatalogRecord("PUSH_UP__BODYWEIGHT")).toBeUndefined();
    expect(getAnimationCatalogRecord("push_up__resistance_band")).toBeUndefined();
    expect(getAnimationCatalogRecord("squat__dumbbell")).toBeUndefined();
    expect(getAnimationCatalogRecord("push_up__bodyweigh")).toBeUndefined();
    expect(getAnimationCatalogRecord(" push_up__bodyweight")).toBeUndefined();
  });

  it("exposes frozen immutable version-1 records", () => {
    expect(Object.isFrozen(ANIMATION_CATALOG)).toBe(true);
    expect(ANIMATION_CATALOG.every((record) => Object.isFrozen(record) && record.animationCatalogVersion === 1)).toBe(true);
  });
});
