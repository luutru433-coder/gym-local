/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { resolve } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseAnimationPackManifest, parseAnimationPackReleaseDescriptor, type AnimationPackManifest, type AnimationPackReleaseDescriptor } from "@gym/contracts";
import { sha256 } from "@noble/hashes/sha2.js";
import JSZip from "jszip";
import type { StoreZipArchive, StoreZipEntry } from "./archive";
import {
  AnimationPackStore,
  AnimationPackStoreError,
  verifyInventory,
  type AnimationPackBackend,
  type AnimationPackCleanupResult,
  type AnimationPackJournalSlot,
  type AnimationPackObjectFile,
  type AnimationPackObjectPointer,
  type AnimationPackStorageEstimate
} from "./store";

const encoder = new TextEncoder();

interface Fixture {
  descriptor: AnimationPackReleaseDescriptor;
  descriptorBytes: Uint8Array;
  archive: Uint8Array;
}

let fixture: Fixture;
let updateFixture: Fixture;
let thirdFixture: Fixture;
const fixtureDirectories: string[] = [];

beforeAll(async () => {
  // The packet requires byte-identical FOUNDATION-03 artifacts, so its existing
  // deterministic builder is the test oracle rather than a second ZIP builder.
  // @ts-expect-error The reviewed repository builder is an untyped ESM module.
  const builder = await import("../../../../scripts/animation-pack-v1.mjs") as {
    validateAnimationPackSource(path: string): Promise<unknown>;
    createAnimationPackArtifacts(source: unknown): Promise<{ artifacts: Map<string, Uint8Array>; descriptor: AnimationPackReleaseDescriptor }>;
  };
  const sourceFixture = resolve(process.cwd(), "tests/fixtures/animation-pack-v1/valid");
  const sourceText = await readFile(resolve(sourceFixture, "pack-source.json"), "utf8");
  const base64 = (await readFile(resolve(sourceFixture, "assets/synthetic-minimal.glb.base64"), "utf8")).trim();
  const build = async (version: string): Promise<Fixture> => {
    const directory = await mkdtemp(resolve(tmpdir(), "gym-local-f04-fixture-"));
    fixtureDirectories.push(directory);
    await mkdir(resolve(directory, "assets"));
    const source = JSON.parse(sourceText) as Record<string, unknown>; source.version = version;
    await writeFile(resolve(directory, "pack-source.json"), `${JSON.stringify(source, null, 2)}\n`);
    await writeFile(resolve(directory, "assets/synthetic-minimal.glb"), Buffer.from(base64, "base64"));
    const built = await builder.createAnimationPackArtifacts(await builder.validateAnimationPackSource(directory));
    return { descriptor: built.descriptor, descriptorBytes: Uint8Array.from(built.artifacts.get("animation-pack-release.json") ?? []), archive: Uint8Array.from(built.artifacts.get("animation-pack.zip") ?? []) };
  };
  fixture = await build("1.0.0");
  updateFixture = await build("1.0.1");
  thirdFixture = await build("1.0.2");
  expect(fixture.descriptor.archiveSha256).toBe("1a84c3bf84ee03444c568608e31c58fe0081d44d6fb54fb226e1751459761bcb");
});

afterAll(async () => {
  await Promise.all(fixtureDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

function pointerKey(pointer: AnimationPackObjectPointer): string {
  return `${pointer.packId}/${pointer.version}/${pointer.archiveSha256}`;
}

class MemoryBackend implements AnimationPackBackend {
  estimateValue: AnimationPackStorageEstimate | undefined;
  readonly objects = new Map<string, { archiveParts: Uint8Array[]; archive?: Blob; files: Map<AnimationPackObjectFile, Blob> }>();
  readonly journals = new Map<AnimationPackJournalSlot, Blob>();
  readonly journalHistory: AnimationPackJournalSlot[] = [];
  readonly calls: string[] = [];
  failAt: string | undefined;
  cleanupMode: "normal" | "foreign" | "aliased" | "unreadable" = "normal";

  #fault(label: string): void {
    this.calls.push(label);
    if (this.failAt === label) throw label.includes("quota") ? new DOMException("full", "QuotaExceededError") : new Error(`injected:${label}`);
  }

  async estimate(): Promise<AnimationPackStorageEstimate | undefined> { this.#fault("estimate"); return this.estimateValue; }

  async beginObject(pointer: AnimationPackObjectPointer, owner: Uint8Array): Promise<void> {
    this.#fault("begin");
    this.objects.set(pointerKey(pointer), { archiveParts: [], files: new Map([["owner.json", new Blob([owner as BlobPart])]]) });
  }

  async writeArchive(pointer: AnimationPackObjectPointer, chunk: Uint8Array): Promise<void> {
    this.#fault(this.calls.includes("write") ? "write-next" : "write");
    this.objects.get(pointerKey(pointer))?.archiveParts.push(Uint8Array.from(chunk));
  }

  async closeArchive(pointer: AnimationPackObjectPointer): Promise<void> {
    this.#fault("close");
    const object = this.objects.get(pointerKey(pointer));
    if (object === undefined) throw new Error("missing object");
    object.archive = new Blob(object.archiveParts.map((part) => part as BlobPart));
  }

  async abortArchive(): Promise<void> { this.calls.push("abort"); }
  async readArchive(pointer: AnimationPackObjectPointer): Promise<Blob | undefined> { this.#fault("read-archive"); return this.objects.get(pointerKey(pointer))?.archive; }

  async writeObjectFile(pointer: AnimationPackObjectPointer, file: AnimationPackObjectFile, bytes: Uint8Array): Promise<void> {
    this.#fault(`metadata:${file}`);
    this.objects.get(pointerKey(pointer))?.files.set(file, new Blob([bytes as BlobPart]));
  }

  async readObjectFile(pointer: AnimationPackObjectPointer, file: AnimationPackObjectFile): Promise<Blob | undefined> {
    this.#fault(`read:${file}`);
    return this.objects.get(pointerKey(pointer))?.files.get(file);
  }

  async readJournal(slot: AnimationPackJournalSlot): Promise<Blob | undefined> { this.#fault(`journal-read:${slot}`); return this.journals.get(slot); }

  async writeJournal(slot: AnimationPackJournalSlot, bytes: Uint8Array): Promise<void> {
    this.#fault(`journal-write:${slot}`);
    this.journals.set(slot, new Blob([bytes as BlobPart]));
    this.journalHistory.push(slot);
  }

  async cleanupObject(pointer: AnimationPackObjectPointer, expectedOwner: Uint8Array, referenced: readonly AnimationPackObjectPointer[]): Promise<AnimationPackCleanupResult> {
    this.calls.push("cleanup");
    if (referenced.some((candidate) => pointerKey(candidate) === pointerKey(pointer))) return { status: "preserved", warning: "referenced" };
    if (this.cleanupMode !== "normal") return { status: "preserved", warning: this.cleanupMode };
    const object = this.objects.get(pointerKey(pointer));
    if (object === undefined) return { status: "preserved", warning: "missing" };
    const owner = object.files.get("owner.json");
    if (owner === undefined || !equal(new Uint8Array(await owner.arrayBuffer()), expectedOwner)) return { status: "preserved", warning: "foreign" };
    this.objects.delete(pointerKey(pointer));
    return { status: "deleted" };
  }
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function store(backend = new MemoryBackend()): { backend: MemoryBackend; store: AnimationPackStore } {
  return { backend, store: new AnimationPackStore({ backend, now: () => "2026-08-27T12:00:00Z" }) };
}

async function install(target: AnimationPackStore, descriptor: unknown = fixture.descriptorBytes, archive: Uint8Array = fixture.archive) {
  return target.install(descriptor, new Blob([archive as BlobPart]));
}

function changedFixture(version: string): Promise<Fixture> {
  const descriptor = { ...fixture.descriptor, version };
  // Descriptor identity must still match the archive manifest, so this helper
  // intentionally produces only invalid test input.
  return Promise.resolve({ descriptor, descriptorBytes: encoder.encode(JSON.stringify(descriptor)), archive: fixture.archive });
}

function digest(bytes: Uint8Array): string {
  return [...sha256(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function emptyJournal(generation: number): Blob {
  const payload = encoder.encode(`{"active":null,"generation":${generation},"layoutVersion":1,"previous":null}\n`);
  return new Blob([JSON.stringify({ layoutVersion: 1, generation, active: null, previous: null, checksum: digest(payload) })]);
}

async function derivedFixture(options: {
  manifest?: (value: Record<string, unknown>) => Record<string, unknown>;
  manifestBytes?: Uint8Array;
  removeAsset?: boolean;
  alterAsset?: "size" | "checksum";
  extraFile?: boolean;
  descriptor?: (value: AnimationPackReleaseDescriptor) => AnimationPackReleaseDescriptor;
}): Promise<Fixture> {
  const zip = await JSZip.loadAsync(fixture.archive);
  const manifestPath = fixture.descriptor.manifestPath;
  let manifestBytes = options.manifestBytes;
  if (manifestBytes === undefined) {
    const original = JSON.parse(await zip.file(manifestPath)!.async("string")) as Record<string, unknown>;
    manifestBytes = encoder.encode(`${JSON.stringify(options.manifest?.(original) ?? original)}\n`);
  }
  zip.file(manifestPath, Uint8Array.from(manifestBytes).buffer, { binary: true, date: new Date("1980-01-01T00:00:00Z"), compression: "STORE", createFolders: false, dir: false, unixPermissions: 0o100644 });
  if (options.removeAsset) zip.remove("assets/synthetic-minimal.glb");
  if (options.alterAsset !== undefined) {
    const asset = options.alterAsset === "size" ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array(48).fill(1);
    zip.file("assets/synthetic-minimal.glb", Uint8Array.from(asset).buffer, { binary: true, compression: "STORE", createFolders: false, unixPermissions: 0o100644 });
  }
  if (options.extraFile) zip.file("assets/extra.glb", new Uint8Array([1]).buffer, { binary: true, compression: "STORE", createFolders: false, unixPermissions: 0o100644 });
  const archive = await zip.generateAsync({ type: "uint8array", compression: "STORE", streamFiles: false, platform: "UNIX", comment: "" });
  let descriptor: AnimationPackReleaseDescriptor = {
    ...fixture.descriptor,
    archiveByteSize: archive.length,
    archiveSha256: digest(archive),
    manifestByteSize: manifestBytes.length,
    manifestSha256: digest(manifestBytes)
  };
  descriptor = options.descriptor?.(descriptor) ?? descriptor;
  const parsed = parseAnimationPackReleaseDescriptor(descriptor);
  if (!parsed.success) throw new Error(`invalid derived descriptor ${JSON.stringify(parsed.issues)}`);
  const descriptorBytes = Uint8Array.from(encoder.encode(JSON.stringify(descriptor)));
  const roundTrip = parseAnimationPackReleaseDescriptor(JSON.parse(new TextDecoder().decode(descriptorBytes)));
  if (!roundTrip.success) throw new Error(`invalid derived descriptor bytes ${JSON.stringify(roundTrip.issues)}`);
  return { descriptor, descriptorBytes, archive };
}

interface EntryReadCounter {
  blobCalls: number;
  sliceCalls: number;
}

class InstrumentedBlob extends Blob {
  readonly #counter: EntryReadCounter;

  constructor(bytes: Uint8Array, counter: EntryReadCounter) {
    super([bytes as BlobPart]);
    this.#counter = counter;
  }

  override slice(start?: number, end?: number, contentType?: string): Blob {
    this.#counter.sliceCalls += 1;
    return super.slice(start, end, contentType);
  }
}

async function boundedInventoryFixture(declaredSizes: readonly number[]): Promise<{
  archive: StoreZipArchive;
  descriptor: AnimationPackReleaseDescriptor;
  manifest: AnimationPackManifest;
  counters: EntryReadCounter[];
}> {
  const source = await JSZip.loadAsync(fixture.archive);
  const parsed = parseAnimationPackManifest(JSON.parse(await source.file(fixture.descriptor.manifestPath)!.async("string")));
  if (!parsed.success) throw new Error(`invalid fixture manifest ${JSON.stringify(parsed.issues)}`);
  const originalAsset = parsed.data.assets[0];
  const payloads = declaredSizes.map((_size, index) => new Uint8Array([index + 1]));
  const manifest: AnimationPackManifest = {
    ...parsed.data,
    assets: declaredSizes.map((byteSize, index) => ({
      ...originalAsset,
      id: index === 0 ? originalAsset.id : `asset.aggregate-${index}`,
      path: index === 0 ? originalAsset.path : `assets/aggregate-${index}.glb`,
      byteSize,
      sha256: digest(payloads[index])
    }))
  };
  const validated = parseAnimationPackManifest(manifest);
  if (!validated.success) throw new Error(`invalid bounded manifest ${JSON.stringify(validated.issues)}`);
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest)}\n`);
  const descriptor: AnimationPackReleaseDescriptor = {
    ...fixture.descriptor,
    manifestByteSize: manifestBytes.length,
    manifestSha256: digest(manifestBytes)
  };
  const counters = declaredSizes.map(() => ({ blobCalls: 0, sliceCalls: 0 }));
  const assetEntries = manifest.assets.map((asset, index): StoreZipEntry => {
    const blob = new InstrumentedBlob(payloads[index], counters[index]);
    return {
      path: asset.path,
      byteSize: asset.byteSize,
      crc32: 0,
      dataOffset: 0,
      dataEnd: asset.byteSize,
      blob: () => { counters[index].blobCalls += 1; return blob; }
    };
  });
  const manifestEntry: StoreZipEntry = {
    path: descriptor.manifestPath,
    byteSize: manifestBytes.length,
    crc32: 0,
    dataOffset: 0,
    dataEnd: manifestBytes.length,
    blob: () => new Blob([manifestBytes as BlobPart])
  };
  const entries = [manifestEntry, ...assetEntries];
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  return {
    archive: { byteSize: fixture.archive.length, entries, entry: (path) => byPath.get(path) },
    descriptor,
    manifest,
    counters
  };
}

describe("animation pack lifecycle store", () => {
  it("installs the byte-identical FOUNDATION-03 fixture and exposes verified active state", async () => {
    const target = store();
    const status = await install(target.store);
    expect(status).toMatchObject({ state: "available", generation: 1, active: { status: "active", verification: "verified", packId: fixture.descriptor.packId, version: "1.0.0" } });
    expect(target.backend.journalHistory).toEqual(["a"]);
    expect(target.backend.objects.size).toBe(1);
  });

  it("reads only the exact active verified asset slice", async () => {
    const target = store(); await install(target.store);
    const bytes = new Uint8Array(await (await target.store.readAsset({ packId: fixture.descriptor.packId, version: "1.0.0", assetId: "asset.foundation-03-minimal-glb", path: "assets/synthetic-minimal.glb" })).arrayBuffer());
    expect(bytes.length).toBe(48);
    await expect(target.store.readAsset({ packId: fixture.descriptor.packId, version: "1.0.1", assetId: "asset.foundation-03-minimal-glb", path: "assets/synthetic-minimal.glb" })).rejects.toMatchObject({ error: { code: "missing_asset" } });
    await expect(target.store.readAsset({ packId: fixture.descriptor.packId, version: "1.0.0", assetId: "asset.foundation-03-minimal-glb", path: "manifest/animation-pack.json" })).rejects.toMatchObject({ error: { code: "missing_asset" } });
  });

  it.each(["empty", "short", "long", "wrong checksum"])("rejects %s staging bytes without a journal commit", async (name) => {
    const bytes = name === "empty" ? new Uint8Array()
      : name === "short" ? fixture.archive.slice(0, -1)
        : name === "long" ? new Uint8Array([...fixture.archive, 0])
          : Uint8Array.from(fixture.archive, (value, index) => index === 0 ? value ^ 1 : value);
    const code = name === "wrong checksum" ? "archive_checksum_mismatch" : "archive_size_mismatch";
    const target = store();
    await expect(install(target.store, fixture.descriptorBytes, bytes)).rejects.toMatchObject({ error: { code } });
    expect(target.backend.journals.size).toBe(0);
  });

  it("cancels and does not request a post-limit chunk after an overrun", async () => {
    const target = store(); let reads = 0; let cancelled = false;
    const source: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]() {
      return {
        async next() {
          reads += 1;
          if (reads === 1) return { done: false, value: fixture.archive };
          if (reads === 2) return { done: false, value: new Uint8Array([0]) };
          throw new Error("post-limit read");
        },
        async return() { cancelled = true; return { done: true, value: undefined }; }
      };
    } };
    await expect(target.store.install(fixture.descriptorBytes, source)).rejects.toMatchObject({ error: { code: "archive_size_mismatch" } });
    expect({ reads, cancelled }).toEqual({ reads: 2, cancelled: true });
  });

  it("rejects a throwing stream without changing the selected journal", async () => {
    const target = store();
    const source = { async *[Symbol.asyncIterator]() { yield fixture.archive.slice(0, 10); throw new Error("stream failed"); } };
    await expect(target.store.install(fixture.descriptorBytes, source)).rejects.toBeInstanceOf(AnimationPackStoreError);
    expect(target.backend.journals.size).toBe(0);
  });

  it.each(["begin", "write", "close", "metadata:descriptor.json", "metadata:manifest.json", "metadata:archive-index.json", "metadata:verified.json", "journal-write:a"])("preserves an empty registry when %s fails", async (phase) => {
    const target = store(); target.backend.failAt = phase;
    await expect(install(target.store)).rejects.toBeInstanceOf(AnimationPackStoreError);
    expect(target.backend.journals.size).toBe(0);
  });

  it.each(["metadata:descriptor.json", "metadata:manifest.json", "metadata:archive-index.json", "metadata:verified.json"])("maps write-time quota at %s", async (phase) => {
    const target = store(); target.backend.failAt = `${phase}-quota`;
    // Use the exact label while retaining quota in the thrown name.
    target.backend.failAt = undefined;
    const original = target.backend.writeObjectFile.bind(target.backend);
    target.backend.writeObjectFile = async (pointer, file, bytes) => {
      if (`metadata:${file}` === phase) throw new DOMException("full", "QuotaExceededError");
      return original(pointer, file, bytes);
    };
    await expect(install(target.store)).rejects.toMatchObject({ error: { code: "quota_exceeded" } });
    expect(target.backend.journals.size).toBe(0);
  });

  it("performs optional quota preflight and proceeds when estimate is absent", async () => {
    const insufficient = store(); insufficient.backend.estimateValue = { quota: fixture.archive.length, usage: 0 };
    await expect(install(insufficient.store)).rejects.toMatchObject({ error: { code: "quota_exceeded" } });
    const unknown = store(); unknown.backend.estimateValue = undefined;
    await expect(install(unknown.store)).resolves.toMatchObject({ state: "available" });
    const rejectedEstimate = store(); rejectedEstimate.backend.estimate = async () => { throw new Error("estimate unavailable"); };
    await expect(install(rejectedEstimate.store)).resolves.toMatchObject({ state: "available" });
  });

  it("rejects descriptor resource limits before reading archive bytes", async () => {
    const target = store();
    const oversized = { ...fixture.descriptor, archiveByteSize: 70 * 1024 * 1024 + 1 };
    const unread: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]: () => ({ next: async () => { throw new Error("must not read"); } }) };
    await expect(target.store.install(oversized, unread)).rejects.toMatchObject({ error: { code: "corrupt_archive" } });
    expect(target.backend.objects.size).toBe(0);
  });

  it("accepts exactly 64 MiB of declared assets with bounded entry doubles", async () => {
    const boundary = await boundedInventoryFixture([16 * 1024 * 1024, 16 * 1024 * 1024, 16 * 1024 * 1024, 16 * 1024 * 1024]);
    await expect(verifyInventory(boundary.archive, boundary.descriptor, boundary.manifest)).resolves.toBeUndefined();
    expect(boundary.counters).toEqual(Array.from({ length: 4 }, () => ({ blobCalls: 1, sliceCalls: 1 })));
  });

  it("rejects 64 MiB plus one byte as corrupt_archive before the crossing asset is read or hashed", async () => {
    const overLimit = await boundedInventoryFixture([16 * 1024 * 1024, 16 * 1024 * 1024, 16 * 1024 * 1024, 16 * 1024 * 1024, 1]);
    const error = await verifyInventory(overLimit.archive, overLimit.descriptor, overLimit.manifest).then(() => undefined, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(AnimationPackStoreError);
    expect(error).toMatchObject({ error: { code: "corrupt_archive" } });
    expect(overLimit.counters.at(-1)).toEqual({ blobCalls: 0, sliceCalls: 0 });
  });

  it("rejects malformed, unknown-field, incompatible, and identity-mismatched descriptors before staging", async () => {
    const cases = [
      "{",
      { ...fixture.descriptor, extra: true },
      { ...fixture.descriptor, animationPackSchemaVersion: 2 },
      { ...fixture.descriptor, animationPlayerProtocolVersion: 2 },
      { ...fixture.descriptor, animationCatalogVersion: 2 },
      { ...fixture.descriptor, minimumAppVersion: "99.0.0" },
      (await changedFixture("1.0.1")).descriptor
    ];
    for (const descriptor of cases) {
      const target = store();
      await expect(install(target.store, descriptor)).rejects.toBeInstanceOf(AnimationPackStoreError);
      expect(target.backend.objects.size).toBe(0);
    }
  });

  it.each([
    ["malformed UTF-8", async () => derivedFixture({ manifestBytes: new Uint8Array([0xff]) }), "corrupt_archive"],
    ["malformed JSON", async () => derivedFixture({ manifestBytes: encoder.encode("{") }), "corrupt_archive"],
    ["unknown manifest field", async () => derivedFixture({ manifest: (value) => ({ ...value, unexpected: true }) }), "corrupt_archive"],
    ["descriptor/manifest identity", async () => derivedFixture({ manifest: (value) => ({ ...value, version: "1.0.1" }) }), "descriptor_manifest_identity_mismatch"],
    ["schema incompatibility", async () => derivedFixture({ manifest: (value) => ({ ...value, animationPackSchemaVersion: 2 }), descriptor: (value) => ({ ...value, animationPackSchemaVersion: 2 }) }), "incompatible_schema"],
    ["player incompatibility", async () => derivedFixture({ manifest: (value) => ({ ...value, animationPlayerProtocolVersion: 2 }), descriptor: (value) => ({ ...value, animationPlayerProtocolVersion: 2 }) }), "incompatible_player_protocol"],
    ["catalog incompatibility", async () => derivedFixture({ manifest: (value) => ({ ...value, animationCatalogVersion: 2 }), descriptor: (value) => ({ ...value, animationCatalogVersion: 2 }) }), "incompatible_animation_catalog"],
    ["minimum app incompatibility", async () => derivedFixture({ manifest: (value) => ({ ...value, minimumAppVersion: "99.0.0" }), descriptor: (value) => ({ ...value, minimumAppVersion: "99.0.0" }) }), "incompatible_minimum_app"],
    ["missing asset", async () => derivedFixture({ removeAsset: true }), "missing_asset"],
    ["extra inventory", async () => derivedFixture({ extraFile: true }), "corrupt_archive"],
    ["asset size", async () => derivedFixture({ alterAsset: "size" }), "asset_size_mismatch"],
    ["asset checksum", async () => derivedFixture({ alterAsset: "checksum" }), "asset_checksum_mismatch"]
  ] as const)("rejects %s before activation", async (_name, build, code) => {
    const target = store(); const invalid = await build();
    await expect(install(target.store, invalid.descriptorBytes, invalid.archive)).rejects.toMatchObject({ error: { code } });
    expect(target.backend.journals.size).toBe(0);
  });

  it("rejects descriptor-selected manifest size and checksum mismatches", async () => {
    const wrongSize = await derivedFixture({ descriptor: (value) => ({ ...value, manifestByteSize: value.manifestByteSize + 1 }) });
    await expect(install(store().store, wrongSize.descriptorBytes, wrongSize.archive)).rejects.toMatchObject({ error: { code: "manifest_size_mismatch" } });
    const wrongHash = await derivedFixture({ descriptor: (value) => ({ ...value, manifestSha256: "0".repeat(64) }) });
    await expect(install(store().store, wrongHash.descriptorBytes, wrongHash.archive)).rejects.toMatchObject({ error: { code: "manifest_checksum_mismatch" } });
  });

  it("alternates slots, rejects corrupt/torn slots, and rejects equal generations", async () => {
    const target = store(); await install(target.store);
    const first = target.backend.journals.get("a") as Blob;
    target.backend.journals.set("b", new Blob(["{torn"]));
    expect(await target.store.status()).toMatchObject({ state: "available", generation: 1 });
    target.backend.journals.set("b", first);
    await expect(target.store.status()).rejects.toMatchObject({ error: { code: "activation_failed" } });
    target.backend.journals.set("b", new Blob(["{\"checksum\":\"bad\"}"]));
    expect(await target.store.status()).toMatchObject({ state: "available", generation: 1 });
  });

  it("selects the newest safe generation, overwrites the stale slot, and rejects overflow", async () => {
    const target = store();
    target.backend.journals.set("a", emptyJournal(5));
    target.backend.journals.set("b", emptyJournal(3));
    expect(await install(target.store)).toMatchObject({ state: "available", generation: 6 });
    expect(target.backend.journalHistory).toEqual(["b"]);

    const overflow = store(); overflow.backend.journals.set("a", emptyJournal(Number.MAX_SAFE_INTEGER));
    await expect(install(overflow.store)).rejects.toMatchObject({ error: { code: "activation_failed" } });
    expect(overflow.backend.journalHistory).toEqual([]);
    expect(overflow.backend.objects.size).toBe(0);
  });

  it("ignores an unsafe-generation slot rather than comparing it", async () => {
    const target = store(); target.backend.journals.set("a", emptyJournal(Number.MAX_SAFE_INTEGER + 1));
    expect(await install(target.store)).toMatchObject({ state: "available", generation: 1 });
  });

  it("remove commits empty state before bounded owned cleanup", async () => {
    const target = store(); await install(target.store);
    const result = await target.store.remove();
    expect(result).toEqual({ state: "unavailable", warnings: [] });
    expect(target.backend.journalHistory).toEqual(["a", "b"]);
    expect(target.backend.objects.size).toBe(0);
  });

  it("retains only active and immediate previous after three committed installs", async () => {
    const target = store();
    await install(target.store);
    await install(target.store, updateFixture.descriptorBytes, updateFixture.archive);
    const status = await install(target.store, thirdFixture.descriptorBytes, thirdFixture.archive);
    expect(status).toMatchObject({ state: "available", generation: 3, active: { version: "1.0.2" }, previous: { version: "1.0.1" } });
    expect(target.backend.journalHistory).toEqual(["a", "b", "a"]);
    expect([...target.backend.objects.keys()].sort()).toEqual(expect.arrayContaining([
      expect.stringContaining("/1.0.1/"), expect.stringContaining("/1.0.2/")
    ]));
    expect([...target.backend.objects.keys()].some((key) => key.includes("/1.0.0/"))).toBe(false);
  });

  it("revalidates and swaps the exact previous object on rollback", async () => {
    const target = store(); await install(target.store); await install(target.store, updateFixture.descriptorBytes, updateFixture.archive);
    expect(await target.store.rollback()).toMatchObject({ state: "available", generation: 3, active: { version: "1.0.0" }, previous: { version: "1.0.1" } });
    const previousKey = [...target.backend.objects.keys()].find((key) => key.includes("/1.0.1/")) as string;
    target.backend.objects.get(previousKey)?.files.delete("verified.json");
    await expect(target.store.rollback()).rejects.toMatchObject({ error: { code: "activation_failed" } });
    target.backend.objects.get(previousKey)?.files.set("verified.json", new Blob(["broken"]));
  });

  it("reactivates an exact verified previous install without rewriting referenced bytes", async () => {
    const target = store(); await install(target.store); await install(target.store, updateFixture.descriptorBytes, updateFixture.archive);
    const writesBefore = target.backend.calls.filter((call) => call === "begin").length;
    const status = await install(target.store, fixture.descriptorBytes, fixture.archive);
    expect(status).toMatchObject({ state: "available", generation: 3, active: { version: "1.0.0" }, previous: { version: "1.0.1" } });
    expect(target.backend.calls.filter((call) => call === "begin")).toHaveLength(writesBefore);
  });

  it("promotes a fully revalidated previous object when recovery finds corrupt active bytes", async () => {
    const target = store(); await install(target.store); await install(target.store, updateFixture.descriptorBytes, updateFixture.archive);
    const activeKey = [...target.backend.objects.keys()].find((key) => key.includes("/1.0.1/")) as string;
    target.backend.objects.get(activeKey)?.files.delete("verified.json");
    expect(await target.store.status()).toMatchObject({ state: "available", generation: 3, active: { version: "1.0.0" }, warnings: [expect.stringContaining("Recovered")] });
  });

  it("returns the offline text fallback state when active and previous are both invalid", async () => {
    const target = store(); await install(target.store); await install(target.store, updateFixture.descriptorBytes, updateFixture.archive);
    for (const object of target.backend.objects.values()) object.files.delete("verified.json");
    expect(await target.store.recover()).toMatchObject({ state: "unavailable", error: { code: "activation_failed" }, warnings: [expect.stringContaining("text fallback")] });
  });

  it("keeps a valid active pack available while healing an invalid previous pointer", async () => {
    const target = store(); await install(target.store); await install(target.store, updateFixture.descriptorBytes, updateFixture.archive);
    const previousKey = [...target.backend.objects.keys()].find((key) => key.includes("/1.0.0/")) as string;
    target.backend.objects.get(previousKey)?.files.delete("verified.json");
    const status = await target.store.status();
    expect(status).toMatchObject({ state: "available", generation: 3, active: { version: "1.0.1" }, warnings: [expect.stringContaining("invalid previous")] });
    if (status.state === "available") expect(status.active).not.toHaveProperty("previousPointer");
  });

  it("keeps active and previous unchanged when an update fails before journal commit", async () => {
    const target = store(); await install(target.store); await install(target.store, updateFixture.descriptorBytes, updateFixture.archive);
    const before = await target.store.status();
    target.backend.failAt = "metadata:verified.json";
    await expect(install(target.store, thirdFixture.descriptorBytes, thirdFixture.archive)).rejects.toBeInstanceOf(AnimationPackStoreError);
    target.backend.failAt = undefined;
    expect(await target.store.status()).toEqual(before);
  });

  it.each(["foreign", "aliased", "unreadable"] as const)("preserves %s cleanup targets with a warning", async (mode) => {
    const target = store(); await install(target.store); target.backend.cleanupMode = mode;
    const result = await target.store.remove();
    expect(result).toMatchObject({ state: "unavailable", warnings: [mode] });
    expect(target.backend.objects.size).toBe(1);
  });

  it("serializes concurrent install/remove calls into monotonic history", async () => {
    const target = store();
    const first = install(target.store);
    const second = target.store.remove();
    expect(await first).toMatchObject({ state: "available", generation: 1 });
    expect(await second).toMatchObject({ state: "unavailable" });
    expect(target.backend.journalHistory).toEqual(["a", "b"]);
  });

  it("serializes install/install and install/rollback without lost generations", async () => {
    const target = store();
    const first = install(target.store);
    const second = install(target.store, updateFixture.descriptorBytes, updateFixture.archive);
    await Promise.all([first, second]);
    const third = install(target.store, thirdFixture.descriptorBytes, thirdFixture.archive);
    const rollback = target.store.rollback();
    expect(await third).toMatchObject({ state: "available", generation: 3, active: { version: "1.0.2" } });
    expect(await rollback).toMatchObject({ state: "available", generation: 4, active: { version: "1.0.1" } });
    expect(target.backend.journalHistory).toEqual(["a", "b", "a", "b"]);
  });

  it("serializes recovery/install after corrupt active state", async () => {
    const target = store(); await install(target.store); await install(target.store, updateFixture.descriptorBytes, updateFixture.archive);
    const activeKey = [...target.backend.objects.keys()].find((key) => key.includes("/1.0.1/")) as string;
    target.backend.objects.get(activeKey)?.files.delete("verified.json");
    const recovery = target.store.recover();
    const next = install(target.store, thirdFixture.descriptorBytes, thirdFixture.archive);
    expect(await recovery).toMatchObject({ state: "available", generation: 3, active: { version: "1.0.0" } });
    expect(await next).toMatchObject({ state: "available", generation: 4, active: { version: "1.0.2" }, previous: { version: "1.0.0" } });
  });

  it("does not touch any personal-data backend or backup surface", async () => {
    const personalSnapshot = encoder.encode('{"profile":{"id":"local"},"sessions":[]}');
    const before = personalSnapshot.slice();
    const target = store(); await install(target.store); await target.store.status(); await target.store.remove();
    expect(personalSnapshot).toEqual(before);
    expect(Object.keys(target.backend)).not.toContain("database");
  });
});
