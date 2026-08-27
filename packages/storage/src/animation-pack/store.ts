/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import {
  APP_VERSIONS,
  type AnimationPackError,
  type AnimationPackErrorCode,
  type AnimationPackManifest,
  type AnimationPackReleaseDescriptor,
  type InstalledAnimationPack,
  parseAnimationPackManifest,
  parseAnimationPackReleaseDescriptor,
  parseInstalledAnimationPack,
  validateAnimationPackCompatibility
} from "@gym/contracts";
import { sha256 } from "@noble/hashes/sha2.js";
import { ANIMATION_PACK_ZIP_LIMITS, readStoreZip, type StoreZipArchive, StoreZipError } from "./archive";

export type AnimationPackByteSource = Blob | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;
export type AnimationPackObjectFile = "owner.json" | "descriptor.json" | "manifest.json" | "archive-index.json" | "verified.json";
export type AnimationPackJournalSlot = "a" | "b";

export interface AnimationPackObjectPointer {
  packId: string;
  version: string;
  archiveSha256: string;
}

export interface AnimationPackStorageEstimate {
  quota?: number;
  usage?: number;
}

export type AnimationPackCleanupResult =
  | { status: "deleted" }
  | { status: "preserved"; warning: string };

/** Storage-owned adapter surface. It intentionally exposes no filesystem handle. */
export interface AnimationPackBackend {
  estimate(): Promise<AnimationPackStorageEstimate | undefined>;
  beginObject(pointer: AnimationPackObjectPointer, owner: Uint8Array): Promise<void>;
  writeArchive(pointer: AnimationPackObjectPointer, chunk: Uint8Array): Promise<void>;
  closeArchive(pointer: AnimationPackObjectPointer): Promise<void>;
  abortArchive(pointer: AnimationPackObjectPointer): Promise<void>;
  readArchive(pointer: AnimationPackObjectPointer): Promise<Blob | undefined>;
  writeObjectFile(pointer: AnimationPackObjectPointer, file: AnimationPackObjectFile, bytes: Uint8Array): Promise<void>;
  readObjectFile(pointer: AnimationPackObjectPointer, file: AnimationPackObjectFile): Promise<Blob | undefined>;
  readJournal(slot: AnimationPackJournalSlot): Promise<Blob | undefined>;
  writeJournal(slot: AnimationPackJournalSlot, bytes: Uint8Array): Promise<void>;
  cleanupObject(pointer: AnimationPackObjectPointer, expectedOwner: Uint8Array, referenced: readonly AnimationPackObjectPointer[]): Promise<AnimationPackCleanupResult>;
}

export interface AnimationPackStoreOptions {
  backend: AnimationPackBackend;
  currentAppVersion?: string;
  now?: () => string;
}

export interface AnimationPackAssetRequest {
  packId: string;
  version: string;
  assetId: string;
  path: string;
}

export type AnimationPackStoreStatus =
  | { state: "unavailable"; error?: AnimationPackError; warnings: readonly string[] }
  | { state: "available"; generation: number; active: InstalledAnimationPack; previous?: InstalledAnimationPack; warnings: readonly string[] };

export class AnimationPackStoreError extends Error {
  readonly error: AnimationPackError;

  constructor(code: AnimationPackErrorCode, message?: string, options?: ErrorOptions) {
    super(message ?? code, options);
    this.name = "AnimationPackStoreError";
    this.error = message === undefined ? { code } : { code, message };
  }
}

interface VerifiedMarker {
  layoutVersion: 1;
  installedAt: string;
  verifiedAt: string;
  installedByteSize: number;
  manifestSha256: string;
}

interface JournalRecord {
  layoutVersion: 1;
  generation: number;
  active: AnimationPackObjectPointer | null;
  previous: AnimationPackObjectPointer | null;
  checksum: string;
}

interface SelectedJournal {
  slot?: AnimationPackJournalSlot;
  record: JournalRecord;
}

interface VerifiedObject {
  pointer: AnimationPackObjectPointer;
  descriptor: AnimationPackReleaseDescriptor;
  manifest: AnimationPackManifest;
  archive: StoreZipArchive;
  marker: VerifiedMarker;
}

const EMPTY_RECORD: JournalRecord = {
  layoutVersion: 1,
  generation: 0,
  active: null,
  previous: null,
  checksum: ""
};
const textEncoder = new TextEncoder();
const OBJECT_OVERHEAD_BYTES = 128 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;

function fail(code: AnimationPackErrorCode, message: string, cause?: unknown): never {
  throw new AnimationPackStoreError(code, message, cause === undefined ? undefined : { cause });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function hashBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

async function hashBlob(blob: Blob): Promise<string> {
  const hash = sha256.create();
  for (let offset = 0; offset < blob.size; offset += 64 * 1024) {
    hash.update(new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + 64 * 1024)).arrayBuffer()));
  }
  return bytesToHex(hash.digest());
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error("Canonical JSON requires a finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("Canonical JSON cannot encode this value.");
}

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(`${canonicalJson(value)}\n`);
}

function pointerKey(pointer: AnimationPackObjectPointer): string {
  return `${pointer.packId}\u0000${pointer.version}\u0000${pointer.archiveSha256}`;
}

function samePointer(left: AnimationPackObjectPointer | null, right: AnimationPackObjectPointer | null): boolean {
  return left === null || right === null ? left === right : pointerKey(left) === pointerKey(right);
}

function pointerId(pointer: AnimationPackObjectPointer): string {
  return `object.${pointer.archiveSha256}`;
}

function isPointer(value: unknown): value is AnimationPackObjectPointer {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).sort().join(",") === "archiveSha256,packId,version"
    && typeof input.packId === "string"
    && /^[a-z0-9]+(?:(?:__|[._-])[a-z0-9]+)*$/.test(input.packId)
    && typeof input.version === "string"
    && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(input.version)
    && typeof input.archiveSha256 === "string"
    && /^[0-9a-f]{64}$/.test(input.archiveSha256);
}

function ownerFor(pointer: AnimationPackObjectPointer): Uint8Array {
  return jsonBytes({ archiveSha256: pointer.archiveSha256, layoutVersion: 1, owner: "gym-local-animation-pack", packId: pointer.packId, version: pointer.version });
}

function strictJsonText(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error("JSON metadata is not valid UTF-8.", { cause: error });
  }
  rejectDuplicateJsonKeys(text);
  return JSON.parse(text) as unknown;
}

function rejectDuplicateJsonKeys(text: string): void {
  const seen: Array<Set<string>> = [];
  let index = 0;
  const whitespace = () => { while (/\s/.test(text[index] ?? "")) index += 1; };
  const string = (): string => {
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") { index += 2; continue; }
      if (text[index] === "\"") { index += 1; return JSON.parse(text.slice(start, index)) as string; }
      index += 1;
    }
    throw new SyntaxError("Unterminated JSON string.");
  };
  const value = (): void => {
    whitespace();
    if (text[index] === "{") {
      index += 1; seen.push(new Set()); whitespace();
      if (text[index] === "}") { index += 1; seen.pop(); return; }
      while (true) {
        whitespace(); if (text[index] !== "\"") throw new SyntaxError("Expected JSON object key.");
        const key = string(); const keys = seen[seen.length - 1];
        if (keys.has(key)) throw new SyntaxError(`Duplicate JSON key: ${key}`);
        keys.add(key); whitespace(); if (text[index] !== ":") throw new SyntaxError("Expected JSON colon.");
        index += 1; value(); whitespace();
        if (text[index] === "}") { index += 1; seen.pop(); return; }
        if (text[index] !== ",") throw new SyntaxError("Expected JSON object delimiter.");
        index += 1;
      }
    }
    if (text[index] === "[") {
      index += 1; whitespace(); if (text[index] === "]") { index += 1; return; }
      while (true) { value(); whitespace(); if (text[index] === "]") { index += 1; return; } if (text[index] !== ",") throw new SyntaxError("Expected JSON array delimiter."); index += 1; }
    }
    if (text[index] === "\"") { string(); return; }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(index));
    if (match === null) throw new SyntaxError("Invalid JSON value.");
    index += match[0].length;
  };
  value(); whitespace(); if (index !== text.length) throw new SyntaxError("Trailing JSON bytes.");
}

async function boundedBytes(blob: Blob, limit = MAX_JSON_BYTES): Promise<Uint8Array> {
  if (blob.size > limit) throw new Error("Metadata exceeds its byte limit.");
  return new Uint8Array(await blob.arrayBuffer());
}

async function exactFile(backend: AnimationPackBackend, pointer: AnimationPackObjectPointer, file: AnimationPackObjectFile): Promise<Blob> {
  const blob = await backend.readObjectFile(pointer, file);
  if (blob === undefined) throw new Error(`Missing ${file}.`);
  return blob;
}

function compatibilityCode(issues: readonly { code: string }[]): AnimationPackErrorCode {
  const known: AnimationPackErrorCode[] = ["incompatible_schema", "incompatible_player_protocol", "incompatible_animation_catalog", "incompatible_minimum_app", "descriptor_manifest_identity_mismatch", "missing_asset", "missing_variant", "missing_source", "missing_license"];
  const exact = known.find((code) => issues.some((issue) => issue.code === code));
  if (exact !== undefined) return exact;
  if (issues.some((issue) => issue.code === "mapping_catalog_mismatch")) return "incompatible_animation_catalog";
  return "corrupt_archive";
}

function mapError(error: unknown, fallback: AnimationPackErrorCode): AnimationPackStoreError {
  if (error instanceof AnimationPackStoreError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError") return new AnimationPackStoreError("quota_exceeded", "Animation pack storage quota was exceeded.", { cause: error });
  if (error instanceof Error && (error.name === "QuotaExceededError" || /quota/i.test(error.message))) return new AnimationPackStoreError("quota_exceeded", "Animation pack storage quota was exceeded.", { cause: error });
  return new AnimationPackStoreError(fallback, error instanceof Error ? error.message : String(error), { cause: error });
}

function byteSource(source: AnimationPackByteSource): { iterator: AsyncIterator<Uint8Array>; cancel: () => Promise<void> } {
  if (source instanceof Blob) {
    let offset = 0;
    let cancelled = false;
    return {
      iterator: { next: async () => {
        if (cancelled || offset >= source.size) return { done: true, value: undefined };
        const end = Math.min(source.size, offset + 64 * 1024);
        const value = new Uint8Array(await source.slice(offset, end).arrayBuffer());
        offset = end;
        return { done: false, value };
      } },
      cancel: async () => { cancelled = true; }
    };
  }
  if ("getReader" in source) {
    const reader = source.getReader();
    let released = false;
    return {
      iterator: { next: async () => {
        const result = await reader.read();
        if (result.done && !released) { reader.releaseLock(); released = true; }
        return result;
      } },
      cancel: async () => {
        if (released) return;
        try { await reader.cancel(); } finally { reader.releaseLock(); released = true; }
      }
    };
  }
  const iterator = (source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  return { iterator, cancel: async () => { await iterator.return?.(); } };
}

function journalPayload(record: Omit<JournalRecord, "checksum">): Uint8Array {
  return jsonBytes(record);
}

function completeRecord(record: Omit<JournalRecord, "checksum">): JournalRecord {
  return { ...record, checksum: hashBytes(journalPayload(record)) };
}

async function parseJournal(blob: Blob | undefined): Promise<JournalRecord | undefined> {
  if (blob === undefined || blob.size > 16 * 1024) return undefined;
  try {
    const input = strictJsonText(await boundedBytes(blob, 16 * 1024));
    if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
    const value = input as Record<string, unknown>;
    if (Object.keys(value).sort().join(",") !== "active,checksum,generation,layoutVersion,previous") return undefined;
    if (value.layoutVersion !== 1 || !Number.isSafeInteger(value.generation) || (value.generation as number) < 1 || typeof value.checksum !== "string" || !/^[0-9a-f]{64}$/.test(value.checksum)) return undefined;
    if (!(value.active === null || isPointer(value.active)) || !(value.previous === null || isPointer(value.previous)) || (value.active !== null && samePointer(value.active, value.previous as AnimationPackObjectPointer | null))) return undefined;
    const record: JournalRecord = { layoutVersion: 1, generation: value.generation as number, active: value.active as AnimationPackObjectPointer | null, previous: value.previous as AnimationPackObjectPointer | null, checksum: value.checksum };
    const expected = completeRecord({ layoutVersion: 1, generation: record.generation, active: record.active, previous: record.previous });
    return expected.checksum === record.checksum ? record : undefined;
  } catch {
    return undefined;
  }
}

async function selectJournal(backend: AnimationPackBackend): Promise<SelectedJournal> {
  const [a, b] = await Promise.all([backend.readJournal("a").then(parseJournal), backend.readJournal("b").then(parseJournal)]);
  if (a !== undefined && b !== undefined && a.generation === b.generation) fail("activation_failed", "Journal generation tie is ambiguous.");
  if (a === undefined && b === undefined) return { record: EMPTY_RECORD };
  if (b === undefined || (a !== undefined && a.generation > b.generation)) return { slot: "a", record: a as JournalRecord };
  return { slot: "b", record: b };
}

async function writeJournal(backend: AnimationPackBackend, selected: SelectedJournal, active: AnimationPackObjectPointer | null, previous: AnimationPackObjectPointer | null): Promise<SelectedJournal> {
  if (selected.record.generation >= Number.MAX_SAFE_INTEGER) fail("activation_failed", "Journal generation cannot advance safely.");
  const record = completeRecord({ layoutVersion: 1, generation: selected.record.generation + 1, active, previous });
  const slot: AnimationPackJournalSlot = selected.slot === "a" ? "b" : "a";
  const bytes = jsonBytes(record);
  try {
    await backend.writeJournal(slot, bytes);
    const reread = await parseJournal(await backend.readJournal(slot));
    if (reread === undefined || canonicalJson(reread) !== canonicalJson(record)) fail("activation_failed", "Committed journal slot could not be reread exactly.");
  } catch (error) {
    throw mapError(error, "activation_failed");
  }
  return { slot, record };
}

function installed(object: VerifiedObject, status: "active" | "previous", other?: AnimationPackObjectPointer | null): InstalledAnimationPack {
  const common = { packId: object.pointer.packId, version: object.pointer.version, installedByteSize: object.marker.installedByteSize, installedAt: object.marker.installedAt, verifiedAt: object.marker.verifiedAt, verification: "verified" as const };
  const candidate: InstalledAnimationPack = status === "active"
    ? { ...common, status, activePointer: pointerId(object.pointer), ...(other === undefined || other === null ? {} : { previousPointer: pointerId(other) }) }
    : { ...common, status, previousPointer: pointerId(object.pointer) };
  const parsed = parseInstalledAnimationPack(candidate);
  if (!parsed.success) fail("activation_failed", "Stored verification timestamps do not satisfy the public installed-pack contract.");
  return parsed.data;
}

async function verifyObject(backend: AnimationPackBackend, pointer: AnimationPackObjectPointer, currentAppVersion: string): Promise<VerifiedObject> {
  const owner = await boundedBytes(await exactFile(backend, pointer, "owner.json"), 4096);
  if (!equalBytes(owner, ownerFor(pointer))) throw new Error("Object owner marker is invalid.");
  const descriptor = parseAnimationPackReleaseDescriptor(strictJsonText(await boundedBytes(await exactFile(backend, pointer, "descriptor.json"))));
  if (!descriptor.success) throw new Error("Stored descriptor is invalid.");
  if (descriptor.data.packId !== pointer.packId || descriptor.data.version !== pointer.version || descriptor.data.archiveSha256 !== pointer.archiveSha256) throw new Error("Stored descriptor does not identify its object.");
  const storedManifest = await exactFile(backend, pointer, "manifest.json");
  if (storedManifest.size !== descriptor.data.manifestByteSize || await hashBlob(storedManifest) !== descriptor.data.manifestSha256) throw new Error("Stored manifest bytes are invalid.");
  const manifest = parseAnimationPackManifest(strictJsonText(await boundedBytes(storedManifest)));
  if (!manifest.success) throw new Error("Stored manifest is invalid.");
  const compatibility = validateAnimationPackCompatibility(descriptor.data, manifest.data, currentAppVersion);
  if (!compatibility.success) throw new AnimationPackStoreError(compatibilityCode(compatibility.issues), "Stored animation pack is incompatible.");
  const markerInput = strictJsonText(await boundedBytes(await exactFile(backend, pointer, "verified.json"), 16 * 1024));
  if (typeof markerInput !== "object" || markerInput === null || Array.isArray(markerInput)) throw new Error("Verified marker is invalid.");
  const marker = markerInput as unknown as VerifiedMarker;
  if (canonicalJson(markerInput) !== canonicalJson({ installedAt: marker.installedAt, installedByteSize: marker.installedByteSize, layoutVersion: 1, manifestSha256: marker.manifestSha256, verifiedAt: marker.verifiedAt }) || marker.manifestSha256 !== descriptor.data.manifestSha256 || marker.installedByteSize !== descriptor.data.archiveByteSize) throw new Error("Verified marker is invalid.");
  const archiveBlob = await backend.readArchive(pointer);
  if (archiveBlob === undefined || archiveBlob.size !== descriptor.data.archiveByteSize || await hashBlob(archiveBlob) !== descriptor.data.archiveSha256) throw new Error("Stored archive is invalid.");
  const archive = await readStoreZip(archiveBlob, { archiveBytes: descriptor.data.archiveByteSize });
  await verifyInventory(archive, descriptor.data, manifest.data);
  const index = strictJsonText(await boundedBytes(await exactFile(backend, pointer, "archive-index.json")));
  const expectedIndex = archive.entries.map(({ path, byteSize, crc32, dataOffset, dataEnd }) => ({ byteSize, crc32, dataEnd, dataOffset, path }));
  if (canonicalJson(index) !== canonicalJson(expectedIndex)) throw new Error("Stored archive index is invalid.");
  return { pointer, descriptor: descriptor.data, manifest: manifest.data, archive, marker };
}

async function verifyInventory(archive: StoreZipArchive, descriptor: AnimationPackReleaseDescriptor, manifest: AnimationPackManifest): Promise<void> {
  const manifestEntry = archive.entry(descriptor.manifestPath);
  if (manifestEntry === undefined) fail("missing_asset", "Descriptor-selected manifest is missing.");
  if (manifestEntry.byteSize !== descriptor.manifestByteSize) fail("manifest_size_mismatch", "Manifest byte size does not match its descriptor.");
  if (await hashBlob(manifestEntry.blob()) !== descriptor.manifestSha256) fail("manifest_checksum_mismatch", "Manifest checksum does not match its descriptor.");
  const expected = new Set([descriptor.manifestPath, ...manifest.assets.map((asset) => asset.path)]);
  for (const asset of manifest.assets) {
    const entry = archive.entry(asset.path);
    if (entry === undefined) fail("missing_asset", `Missing asset ${asset.id}.`);
    if (entry.byteSize !== asset.byteSize) fail("asset_size_mismatch", `Asset ${asset.id} has the wrong size.`);
    if (await hashBlob(entry.blob()) !== asset.sha256) fail("asset_checksum_mismatch", `Asset ${asset.id} has the wrong checksum.`);
  }
  if (expected.size !== manifest.assets.length + 1 || expected.size !== archive.entries.length) fail("corrupt_archive", "Archive inventory is not exact.");
  for (const entry of archive.entries) if (!expected.has(entry.path)) fail("corrupt_archive", "Archive contains an undeclared file.");
}

async function parseDescriptor(input: unknown): Promise<AnimationPackReleaseDescriptor> {
  try {
    let value: unknown = input;
    if (input instanceof Blob) value = strictJsonText(await boundedBytes(input));
    else if (input instanceof Uint8Array || Object.prototype.toString.call(input) === "[object Uint8Array]") {
      const bytes = input as Uint8Array;
      value = strictJsonText(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    }
    else if (typeof input === "string") value = strictJsonText(textEncoder.encode(input));
    const parsed = parseAnimationPackReleaseDescriptor(value);
    if (!parsed.success) fail("corrupt_archive", `Trusted release descriptor is invalid: ${parsed.issues.map((issue) => `${issue.code}@${issue.path.join(".")}`).join(", ")}.`);
    if (parsed.data.archiveByteSize > ANIMATION_PACK_ZIP_LIMITS.archiveBytes || parsed.data.manifestByteSize > MAX_JSON_BYTES) {
      fail("corrupt_archive", "Trusted release descriptor exceeds the v1 resource limits.");
    }
    return parsed.data;
  } catch (error) {
    throw mapError(error, "corrupt_archive");
  }
}

export class AnimationPackStore {
  readonly #backend: AnimationPackBackend;
  readonly #currentAppVersion: string;
  readonly #now: () => string;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: AnimationPackStoreOptions) {
    this.#backend = options.backend;
    this.#currentAppVersion = options.currentAppVersion ?? APP_VERSIONS.app;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  #serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }

  status(): Promise<AnimationPackStoreStatus> {
    return this.#serialized(() => this.#recover(true));
  }

  recover(): Promise<AnimationPackStoreStatus> {
    return this.#serialized(() => this.#recover(true));
  }

  install(descriptorInput: unknown, source: AnimationPackByteSource): Promise<AnimationPackStoreStatus> {
    return this.#serialized(async () => {
      const descriptor = await parseDescriptor(descriptorInput);
      const pointer: AnimationPackObjectPointer = { packId: descriptor.packId, version: descriptor.version, archiveSha256: descriptor.archiveSha256 };
      let selected = await selectJournal(this.#backend);
      if (samePointer(pointer, selected.record.active)) return this.#statusFrom(selected, []);
      if (samePointer(pointer, selected.record.previous)) {
        await verifyObject(this.#backend, pointer, this.#currentAppVersion).catch((error) => { throw mapError(error, "activation_failed"); });
        const committed = await writeJournal(this.#backend, selected, pointer, selected.record.active);
        return this.#statusFrom(committed, []);
      }
      const estimate = await this.#backend.estimate().catch(() => undefined);
      if (estimate?.quota !== undefined && estimate.usage !== undefined && estimate.quota - estimate.usage < descriptor.archiveByteSize + OBJECT_OVERHEAD_BYTES) {
        fail("quota_exceeded", "Available OPFS quota is insufficient for this animation pack.");
      }
      const expectedOwner = ownerFor(pointer);
      const currentReferences = [selected.record.active, selected.record.previous].filter((value): value is AnimationPackObjectPointer => value !== null);
      if (!currentReferences.some((value) => samePointer(value, pointer))) await this.#backend.cleanupObject(pointer, expectedOwner, currentReferences);
      const stream = byteSource(source);
      try {
        await this.#backend.beginObject(pointer, expectedOwner);
        const hash = sha256.create();
        let count = 0;
        while (true) {
          const result = await stream.iterator.next();
          if (result.done) break;
          if (!(result.value instanceof Uint8Array) || result.value.byteLength === 0) continue;
          if (count + result.value.byteLength > descriptor.archiveByteSize) {
            await stream.cancel();
            fail("archive_size_mismatch", "Archive stream exceeded its trusted byte size.");
          }
          count += result.value.byteLength;
          hash.update(result.value);
          await this.#backend.writeArchive(pointer, result.value);
        }
        if (count !== descriptor.archiveByteSize) fail("archive_size_mismatch", "Archive stream ended before its trusted byte size.");
        if (bytesToHex(hash.digest()) !== descriptor.archiveSha256) fail("archive_checksum_mismatch", "Archive stream checksum does not match its trusted descriptor.");
        await this.#backend.closeArchive(pointer);
        const archiveBlob = await this.#backend.readArchive(pointer);
        if (archiveBlob === undefined || archiveBlob.size !== descriptor.archiveByteSize) fail("archive_size_mismatch", "Staged archive could not be reread exactly.");
        const archive = await readStoreZip(archiveBlob, { archiveBytes: descriptor.archiveByteSize });
        const manifestEntry = archive.entry(descriptor.manifestPath);
        if (manifestEntry === undefined) fail("missing_asset", "Descriptor-selected manifest is missing.");
        if (manifestEntry.byteSize !== descriptor.manifestByteSize) fail("manifest_size_mismatch", "Manifest byte size does not match its descriptor.");
        const manifestBytes = await boundedBytes(manifestEntry.blob());
        if (hashBytes(manifestBytes) !== descriptor.manifestSha256) fail("manifest_checksum_mismatch", "Manifest checksum does not match its descriptor.");
        let manifestValue: unknown;
        try { manifestValue = strictJsonText(manifestBytes); } catch (error) { fail("corrupt_archive", "Manifest is not strict UTF-8 JSON.", error); }
        const parsedManifest = parseAnimationPackManifest(manifestValue);
        if (!parsedManifest.success) fail(compatibilityCode(parsedManifest.issues), "Animation manifest contract validation failed.");
        const compatibility = validateAnimationPackCompatibility(descriptor, parsedManifest.data, this.#currentAppVersion);
        if (!compatibility.success) fail(compatibilityCode(compatibility.issues), "Animation pack compatibility validation failed.");
        await verifyInventory(archive, descriptor, parsedManifest.data);
        const timestamp = this.#now();
        const marker: VerifiedMarker = { layoutVersion: 1, installedAt: timestamp, verifiedAt: timestamp, installedByteSize: descriptor.archiveByteSize, manifestSha256: descriptor.manifestSha256 };
        const index = archive.entries.map(({ path, byteSize, crc32, dataOffset, dataEnd }) => ({ byteSize, crc32, dataEnd, dataOffset, path }));
        await this.#backend.writeObjectFile(pointer, "descriptor.json", jsonBytes(descriptor));
        await this.#backend.writeObjectFile(pointer, "manifest.json", manifestBytes);
        await this.#backend.writeObjectFile(pointer, "archive-index.json", jsonBytes(index));
        await this.#backend.writeObjectFile(pointer, "verified.json", jsonBytes(marker));
        await verifyObject(this.#backend, pointer, this.#currentAppVersion);
        selected = await selectJournal(this.#backend);
        const priorActive = selected.record.active;
        const committed = await writeJournal(this.#backend, selected, pointer, priorActive);
        const retained = [committed.record.active, committed.record.previous].filter((value): value is AnimationPackObjectPointer => value !== null);
        const warnings: string[] = [];
        for (const obsolete of [selected.record.previous]) {
          if (obsolete !== null && !retained.some((value) => samePointer(value, obsolete))) {
            const cleanup = await this.#backend.cleanupObject(obsolete, ownerFor(obsolete), retained);
            if (cleanup.status === "preserved") warnings.push(cleanup.warning);
          }
        }
        return this.#statusFrom(committed, warnings);
      } catch (error) {
        await stream.cancel().catch(() => undefined);
        await this.#backend.abortArchive(pointer).catch(() => undefined);
        const latest = await selectJournal(this.#backend).catch(() => selected);
        const referenced = [latest.record.active, latest.record.previous].filter((value): value is AnimationPackObjectPointer => value !== null);
        if (!referenced.some((value) => samePointer(value, pointer))) await this.#backend.cleanupObject(pointer, expectedOwner, referenced).catch(() => undefined);
        throw mapError(error, error instanceof StoreZipError ? "corrupt_archive" : "activation_failed");
      }
    });
  }

  rollback(): Promise<AnimationPackStoreStatus> {
    return this.#serialized(async () => {
      const selected = await selectJournal(this.#backend);
      if (selected.record.active === null || selected.record.previous === null) fail("activation_failed", "No verified previous animation pack is available.");
      await verifyObject(this.#backend, selected.record.active, this.#currentAppVersion).catch((error) => { throw mapError(error, "activation_failed"); });
      await verifyObject(this.#backend, selected.record.previous, this.#currentAppVersion).catch((error) => { throw mapError(error, "activation_failed"); });
      const committed = await writeJournal(this.#backend, selected, selected.record.previous, selected.record.active);
      return this.#statusFrom(committed, []);
    });
  }

  remove(): Promise<AnimationPackStoreStatus> {
    return this.#serialized(async () => {
      const selected = await selectJournal(this.#backend);
      const objects = [selected.record.active, selected.record.previous].filter((value): value is AnimationPackObjectPointer => value !== null);
      if (objects.length === 0) return { state: "unavailable", warnings: [] };
      await writeJournal(this.#backend, selected, null, null);
      const warnings: string[] = [];
      for (const pointer of objects) {
        const cleanup = await this.#backend.cleanupObject(pointer, ownerFor(pointer), []);
        if (cleanup.status === "preserved") warnings.push(cleanup.warning);
      }
      return { state: "unavailable", warnings };
    });
  }

  readAsset(request: AnimationPackAssetRequest): Promise<Blob> {
    return this.#serialized(async () => {
      const selected = await selectJournal(this.#backend);
      if (selected.record.active === null || selected.record.active.packId !== request.packId || selected.record.active.version !== request.version) fail("missing_asset", "Requested pack is not the exact active pack.");
      const object = await verifyObject(this.#backend, selected.record.active, this.#currentAppVersion).catch((error) => { throw mapError(error, "missing_asset"); });
      const asset = object.manifest.assets.find((candidate) => candidate.id === request.assetId);
      if (asset === undefined || asset.path !== request.path) fail("missing_asset", "Requested asset identity or path is not active.");
      const entry = object.archive.entry(asset.path);
      if (entry === undefined) fail("missing_asset", "Requested active asset is missing.");
      return entry.blob();
    });
  }

  async #recover(commitPromotion: boolean): Promise<AnimationPackStoreStatus> {
    const selected = await selectJournal(this.#backend);
    if (selected.record.active === null) return { state: "unavailable", warnings: [] };
    let active: VerifiedObject;
    try {
      active = await verifyObject(this.#backend, selected.record.active, this.#currentAppVersion);
    } catch (activeError) {
      if (selected.record.previous !== null) {
        try {
          await verifyObject(this.#backend, selected.record.previous, this.#currentAppVersion);
          if (commitPromotion) {
            const promoted = await writeJournal(this.#backend, selected, selected.record.previous, null);
            return this.#statusFrom(promoted, ["Recovered the previous verified animation pack."]);
          }
        } catch {
          // The unavailable result below is intentionally non-destructive.
        }
      }
      const error = mapError(activeError, "activation_failed").error;
      return { state: "unavailable", error, warnings: ["Offline animation is unavailable; use the text fallback."] };
    }
    if (selected.record.previous !== null) {
      try {
        await verifyObject(this.#backend, selected.record.previous, this.#currentAppVersion);
      } catch {
        if (commitPromotion) {
          const healed = await writeJournal(this.#backend, selected, selected.record.active, null);
          return this.#statusFrom(healed, ["Removed an invalid previous animation-pack pointer."]);
        }
        return { state: "available", generation: selected.record.generation, active: installed(active, "active"), warnings: ["The previous animation pack is unavailable."] };
      }
    }
    return this.#statusFrom(selected, []);
  }

  async #statusFrom(selected: SelectedJournal, warnings: readonly string[]): Promise<AnimationPackStoreStatus> {
    if (selected.record.active === null) return { state: "unavailable", warnings };
    const active = await verifyObject(this.#backend, selected.record.active, this.#currentAppVersion);
    let previous: InstalledAnimationPack | undefined;
    if (selected.record.previous !== null) {
      const object = await verifyObject(this.#backend, selected.record.previous, this.#currentAppVersion);
      previous = installed(object, "previous");
    }
    return { state: "available", generation: selected.record.generation, active: installed(active, "active", selected.record.previous), ...(previous === undefined ? {} : { previous }), warnings };
  }
}
