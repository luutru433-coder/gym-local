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

import {
  PERSONAL_LOCAL_ANIMATION_MAX_BYTES,
  parsePersonalLocalAnimationRecord,
  personalLocalAnimationSchemaVersion,
  personalLocalAnimationStorageLayoutVersion,
  personalLocalNoEgressPolicy,
  type AnimationCamera,
  type PersonalLocalAnimationOrigin,
  type PersonalLocalAnimationRecord
} from "@gym/contracts";
import { validatePersonalLocalGlb } from "./glb";

export interface PersonalLocalAnimationImportRequest {
  file: Blob;
  exerciseVariantId: string;
  origin: PersonalLocalAnimationOrigin;
  localOnlyAcknowledged: true;
  cameraPreset?: AnimationCamera["preset"];
}

export interface PersonalLocalAnimationListItem {
  record: PersonalLocalAnimationRecord;
  active: boolean;
}

export interface PersonalLocalAnimationSource {
  kind: "personal_local";
  record: PersonalLocalAnimationRecord;
  blob: Blob;
}

export interface PersonalLocalAnimationReadRequest {
  personalLocalAnimationId: string;
  exerciseVariantId: string;
  signal?: AbortSignal;
}

export interface PersonalLocalAnimationBackend {
  estimate(): Promise<{ quota?: number; usage?: number } | undefined>;
  writeObject(record: PersonalLocalAnimationRecord, recordBytes: Uint8Array, asset: Uint8Array): Promise<void>;
  readRecord(id: string): Promise<Blob | undefined>;
  readAsset(id: string): Promise<Blob | undefined>;
  deleteObject(id: string, expectedOwner: Uint8Array): Promise<boolean>;
  readRegistry(slot: "a" | "b"): Promise<Blob | undefined>;
  writeRegistry(slot: "a" | "b", bytes: Uint8Array): Promise<void>;
}

interface RegistryPayload {
  layoutVersion: 1;
  generation: number;
  records: PersonalLocalAnimationRecord[];
  activeByVariant: Record<string, string>;
}

interface Registry extends RegistryPayload { checksum: string }
interface SelectedRegistry { slot?: "a" | "b"; registry: Registry }

const textEncoder = new TextEncoder();
const EMPTY: Registry = { layoutVersion: 1, generation: 0, records: [], activeByVariant: {}, checksum: "" };
const VARIANT_PATTERN = /^[a-z0-9]+(?:(?:__|[._-])[a-z0-9]+)*$/;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hash(bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error("Canonical JSON requires finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(input[key])}`).join(",")}}`;
  }
  throw new Error("Canonical JSON cannot encode this value.");
}

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(`${canonicalJson(value)}\n`);
}

function ownerBytes(record: PersonalLocalAnimationRecord): Uint8Array {
  return jsonBytes({ layoutVersion: 1, owner: "gym-local-personal-local-animation", personalLocalAnimationId: record.personalLocalAnimationId });
}

async function completeRegistry(payload: RegistryPayload): Promise<Registry> {
  return { ...payload, checksum: await hash(jsonBytes(payload)) };
}

function camera(preset: AnimationCamera["preset"]): AnimationCamera {
  const positions: Record<AnimationCamera["preset"], [number, number, number]> = {
    front: [0, 1, 3], side: [3, 1, 0], three_quarter: [2.3, 1.4, 2.3], custom: [2.3, 1.4, 2.3]
  };
  return { preset, position: positions[preset], target: [0, 1, 0], fovDegrees: 45 };
}

async function blobBytes(blob: Blob, maximum = PERSONAL_LOCAL_ANIMATION_MAX_BYTES): Promise<Uint8Array> {
  if (blob.size <= 0 || blob.size > maximum) throw new Error("Personal-local animation bytes exceed the allowed bound.");
  return new Uint8Array(await blob.arrayBuffer());
}

async function parseRegistry(blob: Blob | undefined): Promise<Registry | undefined> {
  if (blob === undefined || blob.size <= 0 || blob.size > 1024 * 1024) return undefined;
  try {
    const input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await blob.arrayBuffer())) as Record<string, unknown>;
    if (Object.keys(input).sort().join(",") !== "activeByVariant,checksum,generation,layoutVersion,records") return undefined;
    if (input.layoutVersion !== personalLocalAnimationStorageLayoutVersion || !Number.isSafeInteger(input.generation) || (input.generation as number) < 1) return undefined;
    if (typeof input.checksum !== "string" || !/^[0-9a-f]{64}$/.test(input.checksum) || !Array.isArray(input.records)) return undefined;
    if (typeof input.activeByVariant !== "object" || input.activeByVariant === null || Array.isArray(input.activeByVariant)) return undefined;
    const records: PersonalLocalAnimationRecord[] = [];
    const ids = new Set<string>();
    for (const item of input.records) {
      const parsed = parsePersonalLocalAnimationRecord(item);
      if (!parsed.success || ids.has(parsed.data.personalLocalAnimationId)) return undefined;
      ids.add(parsed.data.personalLocalAnimationId);
      records.push(parsed.data);
    }
    const activeByVariant: Record<string, string> = {};
    for (const [variant, id] of Object.entries(input.activeByVariant as Record<string, unknown>)) {
      if (!VARIANT_PATTERN.test(variant) || typeof id !== "string") return undefined;
      const record = records.find((candidate) => candidate.personalLocalAnimationId === id);
      if (record === undefined || record.exerciseVariantId !== variant) return undefined;
      activeByVariant[variant] = id;
    }
    const payload: RegistryPayload = { layoutVersion: 1, generation: input.generation as number, records, activeByVariant };
    const complete = await completeRegistry(payload);
    return complete.checksum === input.checksum ? complete : undefined;
  } catch {
    return undefined;
  }
}

async function selectRegistry(backend: PersonalLocalAnimationBackend): Promise<SelectedRegistry> {
  const [a, b] = await Promise.all([backend.readRegistry("a").then(parseRegistry), backend.readRegistry("b").then(parseRegistry)]);
  if (a !== undefined && b !== undefined && a.generation === b.generation) throw new Error("Personal-local registry generation is ambiguous.");
  if (a === undefined && b === undefined) return { registry: EMPTY };
  if (b === undefined || (a !== undefined && a.generation > b.generation)) return { slot: "a", registry: a as Registry };
  return { slot: "b", registry: b };
}

async function commitRegistry(backend: PersonalLocalAnimationBackend, selected: SelectedRegistry, records: PersonalLocalAnimationRecord[], activeByVariant: Record<string, string>): Promise<SelectedRegistry> {
  if (selected.registry.generation >= Number.MAX_SAFE_INTEGER) throw new Error("Personal-local registry cannot advance safely.");
  const registry = await completeRegistry({ layoutVersion: 1, generation: selected.registry.generation + 1, records, activeByVariant });
  const slot = selected.slot === "a" ? "b" : "a";
  const bytes = jsonBytes(registry);
  await backend.writeRegistry(slot, bytes);
  const reread = await parseRegistry(await backend.readRegistry(slot));
  if (reread === undefined || canonicalJson(reread) !== canonicalJson(registry)) throw new Error("Personal-local registry commit could not be reread exactly.");
  return { slot, registry };
}

async function verifyObject(backend: PersonalLocalAnimationBackend, record: PersonalLocalAnimationRecord): Promise<Blob> {
  const storedRecord = await backend.readRecord(record.personalLocalAnimationId);
  const asset = await backend.readAsset(record.personalLocalAnimationId);
  if (storedRecord === undefined || asset === undefined || storedRecord.size > 64 * 1024) throw new Error("Personal-local object is incomplete.");
  const parsedStored = parsePersonalLocalAnimationRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await storedRecord.arrayBuffer())));
  if (!parsedStored.success || canonicalJson(parsedStored.data) !== canonicalJson(record)) throw new Error("Personal-local metadata integrity failed.");
  const bytes = await blobBytes(asset);
  if (bytes.byteLength !== record.byteSize || await hash(bytes) !== record.contentSha256) throw new Error("Personal-local content integrity failed.");
  const glb = validatePersonalLocalGlb(bytes);
  if (glb.clipName !== record.clipName || glb.durationSeconds !== record.durationSeconds || glb.loop.endSeconds !== record.loop.endSeconds) throw new Error("Personal-local structural metadata changed.");
  return new Blob([bytes as BlobPart], { type: "model/gltf-binary" });
}

export interface PersonalLocalAnimationStoreOptions {
  backend: PersonalLocalAnimationBackend;
  now?: () => string;
  id?: () => string;
}

export class PersonalLocalAnimationStore {
  readonly #backend: PersonalLocalAnimationBackend;
  readonly #now: () => string;
  readonly #id: () => string;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: PersonalLocalAnimationStoreOptions) {
    this.#backend = options.backend;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#id = options.id ?? (() => `personal-local.${crypto.randomUUID().toLowerCase()}`);
  }

  #serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }

  import(request: PersonalLocalAnimationImportRequest): Promise<PersonalLocalAnimationRecord> {
    return this.#serialized(async () => {
      if (!(request.file instanceof Blob) || request.localOnlyAcknowledged !== true || !VARIANT_PATTERN.test(request.exerciseVariantId)
        || !["user_supplied", "permissively_sourced"].includes(request.origin)) throw new Error("Personal-local import acknowledgement or exact metadata is invalid.");
      const bytes = await blobBytes(request.file);
      const glb = validatePersonalLocalGlb(bytes);
      const recordResult = parsePersonalLocalAnimationRecord({
        schemaVersion: personalLocalAnimationSchemaVersion,
        personalLocalAnimationId: this.#id(),
        exerciseVariantId: request.exerciseVariantId,
        mediaType: "model/gltf-binary",
        byteSize: bytes.byteLength,
        contentSha256: await hash(bytes),
        clipName: glb.clipName,
        durationSeconds: glb.durationSeconds,
        loop: glb.loop,
        defaultCamera: camera(request.cameraPreset ?? "three_quarter"),
        origin: request.origin,
        scope: "personal_local_only",
        importedAt: this.#now(),
        noEgress: personalLocalNoEgressPolicy()
      });
      if (!recordResult.success) throw new Error(`Personal-local record validation failed: ${recordResult.issues.map((issue) => issue.code).join(",")}`);
      const record = recordResult.data;
      const selected = await selectRegistry(this.#backend);
      if (selected.registry.records.some((candidate) => candidate.personalLocalAnimationId === record.personalLocalAnimationId)) throw new Error("Personal-local animation identity already exists.");
      const estimate = await this.#backend.estimate().catch(() => undefined);
      if (estimate?.quota !== undefined && estimate.usage !== undefined && estimate.quota - estimate.usage < bytes.byteLength + 128 * 1024) throw new DOMException("Personal-local quota exceeded", "QuotaExceededError");
      try {
        await this.#backend.writeObject(record, jsonBytes(record), bytes);
        await verifyObject(this.#backend, record);
        await commitRegistry(this.#backend, selected, [...selected.registry.records, record], { ...selected.registry.activeByVariant });
        return record;
      } catch (error) {
        await this.#backend.deleteObject(record.personalLocalAnimationId, ownerBytes(record)).catch(() => false);
        throw error;
      }
    });
  }

  list(): Promise<PersonalLocalAnimationListItem[]> {
    return this.#serialized(async () => {
      const selected = await selectRegistry(this.#backend);
      return selected.registry.records.map((record) => ({ record, active: selected.registry.activeByVariant[record.exerciseVariantId] === record.personalLocalAnimationId }));
    });
  }

  activate(personalLocalAnimationId: string, exerciseVariantId: string): Promise<PersonalLocalAnimationListItem[]> {
    return this.#serialized(async () => {
      const selected = await selectRegistry(this.#backend);
      const record = selected.registry.records.find((candidate) => candidate.personalLocalAnimationId === personalLocalAnimationId && candidate.exerciseVariantId === exerciseVariantId);
      if (record === undefined) throw new Error("Exact personal-local animation identity is unavailable.");
      await verifyObject(this.#backend, record);
      const committed = await commitRegistry(this.#backend, selected, selected.registry.records, { ...selected.registry.activeByVariant, [exerciseVariantId]: personalLocalAnimationId });
      return committed.registry.records.map((item) => ({ record: item, active: committed.registry.activeByVariant[item.exerciseVariantId] === item.personalLocalAnimationId }));
    });
  }

  read(request: PersonalLocalAnimationReadRequest): Promise<PersonalLocalAnimationSource> {
    return this.#serialized(async () => {
      if (request.signal?.aborted) throw new DOMException("Personal-local read aborted", "AbortError");
      const selected = await selectRegistry(this.#backend);
      const record = selected.registry.records.find((candidate) => candidate.personalLocalAnimationId === request.personalLocalAnimationId && candidate.exerciseVariantId === request.exerciseVariantId);
      if (record === undefined) throw new Error("Exact personal-local animation identity is unavailable.");
      const blob = await verifyObject(this.#backend, record);
      if (request.signal?.aborted) throw new DOMException("Personal-local read aborted", "AbortError");
      return { kind: "personal_local", record, blob };
    });
  }

  remove(personalLocalAnimationId: string, exerciseVariantId: string): Promise<PersonalLocalAnimationListItem[]> {
    return this.#serialized(async () => {
      const selected = await selectRegistry(this.#backend);
      const record = selected.registry.records.find((candidate) => candidate.personalLocalAnimationId === personalLocalAnimationId && candidate.exerciseVariantId === exerciseVariantId);
      if (record === undefined) throw new Error("Exact personal-local animation identity is unavailable.");
      const records = selected.registry.records.filter((candidate) => candidate.personalLocalAnimationId !== personalLocalAnimationId);
      const activeByVariant = { ...selected.registry.activeByVariant };
      if (activeByVariant[exerciseVariantId] === personalLocalAnimationId) delete activeByVariant[exerciseVariantId];
      await commitRegistry(this.#backend, selected, records, activeByVariant);
      await this.#backend.deleteObject(personalLocalAnimationId, ownerBytes(record));
      return records.map((item) => ({ record: item, active: activeByVariant[item.exerciseVariantId] === item.personalLocalAnimationId }));
    });
  }

  recover(): Promise<PersonalLocalAnimationListItem[]> {
    return this.#serialized(async () => {
      const selected = await selectRegistry(this.#backend);
      const valid: PersonalLocalAnimationRecord[] = [];
      for (const record of selected.registry.records) {
        try { await verifyObject(this.#backend, record); valid.push(record); } catch { /* invalid unreferenced bytes remain isolated until bounded cleanup */ }
      }
      const validIds = new Set(valid.map((record) => record.personalLocalAnimationId));
      const activeByVariant = Object.fromEntries(Object.entries(selected.registry.activeByVariant).filter(([, id]) => validIds.has(id)));
      const changed = valid.length !== selected.registry.records.length || Object.keys(activeByVariant).length !== Object.keys(selected.registry.activeByVariant).length;
      const registry = changed ? (await commitRegistry(this.#backend, selected, valid, activeByVariant)).registry : selected.registry;
      return registry.records.map((record) => ({ record, active: registry.activeByVariant[record.exerciseVariantId] === record.personalLocalAnimationId }));
    });
  }
}
