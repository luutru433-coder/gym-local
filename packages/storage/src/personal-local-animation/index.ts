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

import { createOpfsPersonalLocalAnimationBackend } from "./opfs";
import {
  PersonalLocalAnimationStore,
  type PersonalLocalAnimationImportRequest,
  type PersonalLocalAnimationListItem,
  type PersonalLocalAnimationReadRequest,
  type PersonalLocalAnimationSource
} from "./store";

export type {
  PersonalLocalAnimationImportRequest,
  PersonalLocalAnimationListItem,
  PersonalLocalAnimationReadRequest,
  PersonalLocalAnimationSource
} from "./store";

let store: PersonalLocalAnimationStore | undefined;

function personalLocalStore(): PersonalLocalAnimationStore {
  store ??= new PersonalLocalAnimationStore({ backend: createOpfsPersonalLocalAnimationBackend() });
  return store;
}

export function importPersonalLocalAnimation(request: PersonalLocalAnimationImportRequest) {
  return personalLocalStore().import(request);
}

export function listPersonalLocalAnimations(): Promise<PersonalLocalAnimationListItem[]> {
  return personalLocalStore().list();
}

export function activatePersonalLocalAnimation(personalLocalAnimationId: string, exerciseVariantId: string): Promise<PersonalLocalAnimationListItem[]> {
  return personalLocalStore().activate(personalLocalAnimationId, exerciseVariantId);
}

export function readPersonalLocalAnimationSource(request: PersonalLocalAnimationReadRequest): Promise<PersonalLocalAnimationSource> {
  return personalLocalStore().read(request);
}

export function removePersonalLocalAnimation(personalLocalAnimationId: string, exerciseVariantId: string): Promise<PersonalLocalAnimationListItem[]> {
  return personalLocalStore().remove(personalLocalAnimationId, exerciseVariantId);
}

export function recoverPersonalLocalAnimations(): Promise<PersonalLocalAnimationListItem[]> {
  return personalLocalStore().recover();
}
