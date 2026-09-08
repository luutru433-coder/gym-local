/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { createOpfsAnimationPackBackend } from "./opfs";
import {
  AnimationPackStore,
  type AnimationPackAssetRequest,
  type AnimationPackByteSource,
  type AnimationPackExactSource,
  type AnimationPackExactSourceRequest,
  type AnimationPackStoreStatus
} from "./store";

export type { AnimationPackAssetRequest, AnimationPackByteSource, AnimationPackExactSource, AnimationPackExactSourceRequest, AnimationPackStoreStatus } from "./store";
export { AnimationPackStoreError } from "./store";

let store: AnimationPackStore | undefined;

function animationPackStore(): AnimationPackStore {
  store ??= new AnimationPackStore({ backend: createOpfsAnimationPackBackend() });
  return store;
}

export function getAnimationPackStatus(): Promise<AnimationPackStoreStatus> {
  return animationPackStore().status();
}

export function recoverAnimationPackStore(): Promise<AnimationPackStoreStatus> {
  return animationPackStore().recover();
}

export function installAnimationPack(descriptor: unknown, archive: AnimationPackByteSource): Promise<AnimationPackStoreStatus> {
  return animationPackStore().install(descriptor, archive);
}

export function readAnimationPackAsset(request: AnimationPackAssetRequest): Promise<Blob> {
  return animationPackStore().readAsset(request);
}

export function readExactAnimationSource(request: AnimationPackExactSourceRequest): Promise<AnimationPackExactSource> {
  return animationPackStore().readExactSource(request);
}

export function rollbackAnimationPack(): Promise<AnimationPackStoreStatus> {
  return animationPackStore().rollback();
}

export function removeAnimationPack(): Promise<AnimationPackStoreStatus> {
  return animationPackStore().remove();
}
