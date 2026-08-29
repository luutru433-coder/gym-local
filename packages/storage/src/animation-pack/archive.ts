/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

/** The deliberately small ZIP subset accepted by offline animation packs. */
export interface StoreZipLimits {
  archiveBytes: number;
  entryBytes: number;
  entries: number;
  nameBytes: number;
}

export const ANIMATION_PACK_ZIP_LIMITS: Readonly<StoreZipLimits> = {
  archiveBytes: 70 * 1024 * 1024,
  entryBytes: 16 * 1024 * 1024,
  entries: 512,
  nameBytes: 240
};

export interface StoreZipEntry {
  readonly path: string;
  readonly byteSize: number;
  readonly crc32: number;
  readonly dataOffset: number;
  readonly dataEnd: number;
  blob(): Blob;
}

export interface StoreZipArchive {
  readonly byteSize: number;
  readonly entries: readonly StoreZipEntry[];
  entry(path: string): StoreZipEntry | undefined;
}

export class StoreZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreZipError";
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const UTF8_FLAG = 0x0800;
const ZIP64_SENTINEL = 0xffffffff;
const CRC_TABLE = buildCrcTable();
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

interface CentralEntry {
  path: string;
  rawName: Uint8Array;
  flags: number;
  crc32: number;
  byteSize: number;
  localOffset: number;
  dataOffset?: number;
  dataEnd?: number;
}

function corrupt(message: string): never {
  throw new StoreZipError(message);
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
}

export function updateCrc32(crc: number, bytes: Uint8Array): number {
  let state = crc ^ 0xffffffff;
  for (const byte of bytes) state = CRC_TABLE[(state ^ byte) & 0xff] ^ (state >>> 8);
  return (state ^ 0xffffffff) >>> 0;
}

export async function crc32Blob(blob: Blob): Promise<number> {
  let crc = 0;
  for (let offset = 0; offset < blob.size; offset += 64 * 1024) {
    crc = updateCrc32(crc, new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + 64 * 1024)).arrayBuffer()));
  }
  return crc;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

async function read(blob: Blob, start: number, length: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > blob.size) {
    corrupt("ZIP range is outside the archive.");
  }
  return new Uint8Array(await blob.slice(start, start + length).arrayBuffer());
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function decodeName(raw: Uint8Array, flags: number): string {
  if ((flags & ~UTF8_FLAG) !== 0) corrupt("ZIP flags are not supported.");
  if ((flags & UTF8_FLAG) === 0 && raw.some((byte) => byte > 0x7f)) corrupt("Non-ASCII names must use the UTF-8 flag.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return corrupt("ZIP entry name is not valid UTF-8.");
  }
}

function pathKey(path: string): string {
  return path.normalize("NFC").replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function validatePath(path: string): void {
  if (path.length === 0 || path.startsWith("/") || path.endsWith("/") || path.includes("\\") || path.includes("?") || path.includes("#")) {
    corrupt("ZIP entry path is not a canonical relative file path.");
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) || /%(?:[0-9a-f]{2})/i.test(path)) corrupt("ZIP entry path is ambiguous.");
  if (path !== path.normalize("NFC")) corrupt("ZIP entry path is not Unicode-normalized.");
  if ([...path].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  })) corrupt("ZIP entry path contains a control character.");
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === ".." || segment.endsWith(".") || segment.endsWith(" ") || WINDOWS_DEVICE.test(segment)) {
      corrupt("ZIP entry path contains a forbidden segment.");
    }
  }
}

function checkedEnd(start: number, length: number, boundary: number): number {
  const end = start + length;
  if (!Number.isSafeInteger(end) || end < start || end > boundary) corrupt("ZIP record exceeds its structural boundary.");
  return end;
}

function readEocd(bytes: Uint8Array, archiveSize: number): { entries: number; centralSize: number; centralOffset: number } {
  if (bytes.length !== 22 || view(bytes).getUint32(0, true) !== EOCD_SIGNATURE) corrupt("ZIP has no terminal EOCD record.");
  const data = view(bytes);
  if (data.getUint16(4, true) !== 0 || data.getUint16(6, true) !== 0) corrupt("Multi-disk ZIP is not supported.");
  const diskEntries = data.getUint16(8, true);
  const entries = data.getUint16(10, true);
  const centralSize = data.getUint32(12, true);
  const centralOffset = data.getUint32(16, true);
  if (data.getUint16(20, true) !== 0) corrupt("ZIP comments are not supported.");
  if (entries === 0xffff || diskEntries === 0xffff || centralSize === ZIP64_SENTINEL || centralOffset === ZIP64_SENTINEL) corrupt("ZIP64 is not supported.");
  if (diskEntries !== entries || centralOffset + centralSize !== archiveSize - 22) corrupt("ZIP central directory is not structurally terminal.");
  return { entries, centralSize, centralOffset };
}

/**
 * Parses and verifies a STORE-only ZIP using bounded Blob slices. It never
 * extracts archive-controlled names into a filesystem path.
 */
export async function readStoreZip(blob: Blob, requested: Partial<StoreZipLimits> = {}): Promise<StoreZipArchive> {
  const limits = { ...ANIMATION_PACK_ZIP_LIMITS, ...requested };
  if (!Number.isSafeInteger(blob.size) || blob.size < 22 || blob.size > limits.archiveBytes) corrupt("ZIP archive size is outside the accepted limit.");
  const eocd = readEocd(await read(blob, blob.size - 22, 22), blob.size);
  if (eocd.entries < 1 || eocd.entries > limits.entries) corrupt("ZIP entry count is outside the accepted limit.");
  if (eocd.centralSize > eocd.entries * (46 + limits.nameBytes)) corrupt("ZIP central directory exceeds the accepted limit.");
  const centralBytes = await read(blob, eocd.centralOffset, eocd.centralSize);
  const centralView = view(centralBytes);
  const entries: CentralEntry[] = [];
  const exactPaths = new Set<string>();
  const portablePaths = new Set<string>();
  let cursor = 0;
  for (let index = 0; index < eocd.entries; index += 1) {
    if (cursor + 46 > centralBytes.length || centralView.getUint32(cursor, true) !== CENTRAL_SIGNATURE) corrupt("ZIP central entry is malformed.");
    const madeByPlatform = centralView.getUint16(cursor + 4, true) >>> 8;
    const versionNeeded = centralView.getUint16(cursor + 6, true);
    const flags = centralView.getUint16(cursor + 8, true);
    const method = centralView.getUint16(cursor + 10, true);
    const crc32 = centralView.getUint32(cursor + 16, true);
    const compressedSize = centralView.getUint32(cursor + 20, true);
    const byteSize = centralView.getUint32(cursor + 24, true);
    const nameLength = centralView.getUint16(cursor + 28, true);
    const extraLength = centralView.getUint16(cursor + 30, true);
    const commentLength = centralView.getUint16(cursor + 32, true);
    const disk = centralView.getUint16(cursor + 34, true);
    const externalAttributes = centralView.getUint32(cursor + 38, true);
    const localOffset = centralView.getUint32(cursor + 42, true);
    if (versionNeeded > 20 || method !== 0 || compressedSize !== byteSize) corrupt("Only classic uncompressed STORE entries are supported.");
    if (compressedSize === ZIP64_SENTINEL || localOffset === ZIP64_SENTINEL) corrupt("ZIP64 is not supported.");
    if (extraLength !== 0 || commentLength !== 0 || disk !== 0) corrupt("ZIP entry extras, comments, and multiple disks are not supported.");
    if (nameLength < 1 || nameLength > limits.nameBytes || byteSize > limits.entryBytes) corrupt("ZIP entry exceeds an accepted limit.");
    const unixType = (externalAttributes >>> 16) & 0xf000;
    if ((externalAttributes & 0x10) !== 0 || (madeByPlatform === 3 && unixType !== 0x8000) || (madeByPlatform !== 0 && madeByPlatform !== 3)) {
      corrupt("ZIP directory and special-file entries are not supported.");
    }
    const recordEnd = checkedEnd(cursor + 46, nameLength, centralBytes.length);
    const rawName = centralBytes.slice(cursor + 46, recordEnd);
    const path = decodeName(rawName, flags);
    validatePath(path);
    const portable = pathKey(path);
    if (exactPaths.has(path) || portablePaths.has(portable)) corrupt("ZIP entry path collides with another entry.");
    exactPaths.add(path);
    portablePaths.add(portable);
    entries.push({ path, rawName, flags, crc32, byteSize, localOffset });
    cursor = recordEnd;
  }
  if (cursor !== centralBytes.length) corrupt("ZIP central directory has trailing bytes.");

  const ordered = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  let expectedOffset = 0;
  for (const entry of ordered) {
    if (entry.localOffset !== expectedOffset) corrupt("ZIP local entries overlap or contain unaccounted bytes.");
    const local = await read(blob, entry.localOffset, 30);
    const localView = view(local);
    if (localView.getUint32(0, true) !== LOCAL_SIGNATURE) corrupt("ZIP local entry signature is invalid.");
    const versionNeeded = localView.getUint16(4, true);
    const flags = localView.getUint16(6, true);
    const method = localView.getUint16(8, true);
    const crc32 = localView.getUint32(14, true);
    const compressedSize = localView.getUint32(18, true);
    const byteSize = localView.getUint32(22, true);
    const nameLength = localView.getUint16(26, true);
    const extraLength = localView.getUint16(28, true);
    if (versionNeeded > 20 || flags !== entry.flags || method !== 0 || crc32 !== entry.crc32 || compressedSize !== entry.byteSize || byteSize !== entry.byteSize || extraLength !== 0 || nameLength !== entry.rawName.length) {
      corrupt("ZIP local and central entries disagree.");
    }
    const rawName = await read(blob, entry.localOffset + 30, nameLength);
    if (!equalBytes(rawName, entry.rawName)) corrupt("ZIP local and central names disagree.");
    const dataOffset = entry.localOffset + 30 + nameLength;
    const dataEnd = checkedEnd(dataOffset, entry.byteSize, eocd.centralOffset);
    entry.dataOffset = dataOffset;
    entry.dataEnd = dataEnd;
    expectedOffset = dataEnd;
    const actualCrc = await crc32Blob(blob.slice(dataOffset, dataEnd));
    if (actualCrc !== entry.crc32) corrupt("ZIP entry CRC-32 is invalid.");
  }
  if (expectedOffset !== eocd.centralOffset) corrupt("ZIP contains bytes outside its entries and directory.");

  const resultEntries: StoreZipEntry[] = entries.map((entry) => ({
    path: entry.path,
    byteSize: entry.byteSize,
    crc32: entry.crc32,
    dataOffset: entry.dataOffset as number,
    dataEnd: entry.dataEnd as number,
    blob: () => blob.slice(entry.dataOffset as number, entry.dataEnd as number)
  }));
  const byPath = new Map(resultEntries.map((entry) => [entry.path, entry]));
  return { byteSize: blob.size, entries: resultEntries, entry: (path) => byPath.get(path) };
}
