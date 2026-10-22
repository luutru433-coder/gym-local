/*
 * Copyright (c) 2026 MyCompany LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AnimationPlayerRequest } from "@gym/contracts";
import type { AnimationPlayerAssetLoader, AnimationPlayerPersonalLocalSource } from "./animation-player";

export interface PersonalLocalAnimationReader {
  (request: { personalLocalAnimationId: string; exerciseVariantId: string; signal?: AbortSignal }): Promise<AnimationPlayerPersonalLocalSource>;
}

export function createPersonalLocalAnimationAssetLoader(read: PersonalLocalAnimationReader): AnimationPlayerAssetLoader {
  return {
    async load(request: Readonly<AnimationPlayerRequest>, signal: AbortSignal) {
      const source = await read({
        personalLocalAnimationId: request.animationId,
        exerciseVariantId: request.exerciseVariantId,
        signal
      });
      if (source.kind !== "personal_local"
        || source.record.personalLocalAnimationId !== request.animationId
        || source.record.exerciseVariantId !== request.exerciseVariantId) {
        throw new Error("Exact personal-local animation identity is unavailable.");
      }
      return source;
    }
  };
}
