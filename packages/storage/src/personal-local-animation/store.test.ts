/*
 * Copyright (c) 2026 MyCompany LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonalLocalAnimationRecord } from "@gym/contracts";
import { PersonalLocalAnimationStore, type PersonalLocalAnimationBackend } from "./store";
import { validatePersonalLocalGlb } from "./glb";

const encoder = new TextEncoder();

function glb(change: (json: Record<string, unknown>, bin: Uint8Array) => void = () => undefined): Uint8Array {
  const bin = new Uint8Array(36);
  new Float32Array(bin.buffer, 0, 2).set([0, 1]);
  new Float32Array(bin.buffer, 8, 6).set([0, 0, 0, 1, 0, 0]);
  const json: Record<string, unknown> = {
    asset: { version: "2.0" }, nodes: [{}], buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 24 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" }
    ],
    animations: [{ name: "Local clip", samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }]
  };
  change(json, bin);
  const text = encoder.encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4); padded.fill(0x20); padded.set(text);
  const result = new Uint8Array(12 + 8 + padded.length + 8 + bin.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.length, true);
  view.setUint32(12, padded.length, true); view.setUint32(16, 0x4e4f534a, true); result.set(padded, 20);
  const binHeader = 20 + padded.length; view.setUint32(binHeader, bin.length, true); view.setUint32(binHeader + 4, 0x004e4942, true); result.set(bin, binHeader + 8);
  return result;
}

class MemoryBackend implements PersonalLocalAnimationBackend {
  readonly objects = new Map<string, { record: Blob; asset: Blob; owner: Uint8Array }>();
  readonly registry = new Map<"a" | "b", Blob>();
  quota = 64 * 1024 * 1024;
  usage = 0;
  failWrite = false;
  async estimate() { return { quota: this.quota, usage: this.usage }; }
  async writeObject(record: PersonalLocalAnimationRecord, recordBytes: Uint8Array, asset: Uint8Array) {
    if (this.failWrite) throw new Error("interrupted");
    this.objects.set(record.personalLocalAnimationId, { record: new Blob([recordBytes as BlobPart]), asset: new Blob([asset as BlobPart], { type: "model/gltf-binary" }), owner: new Uint8Array() });
  }
  async readRecord(id: string) { return this.objects.get(id)?.record; }
  async readAsset(id: string) { return this.objects.get(id)?.asset; }
  async deleteObject(id: string) { return this.objects.delete(id); }
  async readRegistry(slot: "a" | "b") { return this.registry.get(slot); }
  async writeRegistry(slot: "a" | "b", bytes: Uint8Array) { this.registry.set(slot, new Blob([bytes as BlobPart])); }
}

function store(backend = new MemoryBackend()) {
  let serial = 0;
  return { backend, value: new PersonalLocalAnimationStore({ backend, now: () => "2026-10-22T00:00:00.000Z", id: () => `personal-local.00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}` }) };
}

afterEach(() => vi.unstubAllGlobals());

describe("personal-local GLB validation", () => {
  it("accepts one bounded self-contained GLB and rejects other containers and hidden or remote content", () => {
    expect(validatePersonalLocalGlb(glb())).toMatchObject({ clipName: "Local clip", durationSeconds: 1 });
    expect(() => validatePersonalLocalGlb(encoder.encode("{\"asset\":{\"version\":\"2.0\"}}"))).toThrow();
    expect(() => validatePersonalLocalGlb(Uint8Array.from([0x50, 0x4b, ...new Array(30).fill(0)]))).toThrow();
    expect(() => validatePersonalLocalGlb(glb((json) => { json.buffers = [{ byteLength: 32, uri: "https://example.test/a.bin" }]; }))).toThrow(/self-contained/);
    expect(() => validatePersonalLocalGlb(glb((json) => { json.extensionsUsed = ["EXT_remote"]; }))).toThrow();
    expect(() => validatePersonalLocalGlb(glb((json) => { json.animations = [json.animations, json.animations]; }))).toThrow();
    const trailing = new Uint8Array(glb().length + 4); trailing.set(glb()); expect(() => validatePersonalLocalGlb(trailing)).toThrow(/declared length/);
    const hidden = glb((_json, bin) => { bin[35] = 9; }); expect(() => validatePersonalLocalGlb(hidden)).toThrow(/Undeclared/);
  });
});

describe("personal-local storage", () => {
  it("imports, activates, reads and removes only an exact immutable ID and variant", async () => {
    const { value } = store();
    const record = await value.import({ file: new Blob([Uint8Array.from(glb()).buffer], { type: "model/gltf-binary" }), exerciseVariantId: "squat__barbell", origin: "user_supplied", localOnlyAcknowledged: true });
    expect((await value.list())[0]).toMatchObject({ record, active: false });
    await value.activate(record.personalLocalAnimationId, "squat__barbell");
    expect((await value.read({ personalLocalAnimationId: record.personalLocalAnimationId, exerciseVariantId: "squat__barbell" })).record).toEqual(record);
    await expect(value.read({ personalLocalAnimationId: record.personalLocalAnimationId, exerciseVariantId: "squat__dumbbell" })).rejects.toThrow(/Exact/);
    await expect(value.read({ personalLocalAnimationId: record.personalLocalAnimationId.toUpperCase(), exerciseVariantId: "squat__barbell" })).rejects.toThrow(/Exact/);
    expect(await value.remove(record.personalLocalAnimationId, "squat__barbell")).toEqual([]);
  });

  it("serializes concurrent imports and rolls back quota and interrupted writes", async () => {
    const { backend, value } = store();
    const request = { file: new Blob([Uint8Array.from(glb()).buffer], { type: "model/gltf-binary" }), exerciseVariantId: "squat__barbell", origin: "user_supplied" as const, localOnlyAcknowledged: true as const };
    await Promise.all([value.import(request), value.import(request)]);
    expect(await value.list()).toHaveLength(2);
    backend.quota = 1;
    await expect(value.import(request)).rejects.toThrow(/quota/i);
    backend.quota = 64 * 1024 * 1024; backend.failWrite = true;
    await expect(value.import(request)).rejects.toThrow(/interrupted/);
    expect(await value.list()).toHaveLength(2);
  });

  it("drops registry entries whose content integrity no longer verifies", async () => {
    const { backend, value } = store();
    const record = await value.import({ file: new Blob([Uint8Array.from(glb()).buffer]), exerciseVariantId: "squat__barbell", origin: "permissively_sourced", localOnlyAcknowledged: true });
    const object = backend.objects.get(record.personalLocalAnimationId)!;
    object.asset = new Blob([new Uint8Array(object.asset.size)]);
    expect(await value.recover()).toEqual([]);
  });

  it("performs the complete lifecycle with zero network, telemetry, background-sync, or CacheStorage operations", async () => {
    const fetchCall = vi.fn(); const xhr = vi.fn(); const beacon = vi.fn(); const socket = vi.fn(); const events = vi.fn(); const cacheOpen = vi.fn(); const syncRegister = vi.fn();
    vi.stubGlobal("fetch", fetchCall); vi.stubGlobal("XMLHttpRequest", xhr); vi.stubGlobal("WebSocket", socket); vi.stubGlobal("EventSource", events);
    vi.stubGlobal("caches", { open: cacheOpen });
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ sync: { register: syncRegister } }) } });
    const { value } = store();
    const record = await value.import({ file: new Blob([Uint8Array.from(glb()).buffer]), exerciseVariantId: "squat__barbell", origin: "user_supplied", localOnlyAcknowledged: true });
    await value.list(); await value.activate(record.personalLocalAnimationId, record.exerciseVariantId);
    await value.read({ personalLocalAnimationId: record.personalLocalAnimationId, exerciseVariantId: record.exerciseVariantId });
    await value.recover(); await value.remove(record.personalLocalAnimationId, record.exerciseVariantId);
    for (const operation of [fetchCall, xhr, beacon, socket, events, cacheOpen, syncRegister]) expect(operation).not.toHaveBeenCalled();
  });
});
