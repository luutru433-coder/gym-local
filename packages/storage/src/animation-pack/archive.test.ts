/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from "vitest";
import { readStoreZip, StoreZipError, updateCrc32 } from "./archive";

interface ZipFile { name: string; bytes: Uint8Array; flags?: number }

function u16(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint16(offset, value, true);
}

function u32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint32(offset, value, true);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function zip(files: readonly ZipFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = updateCrc32(0, file.bytes);
    const local = new Uint8Array(30 + name.length + file.bytes.length);
    u32(local, 0, 0x04034b50); u16(local, 4, 20); u16(local, 6, file.flags ?? 0); u16(local, 8, 0);
    u32(local, 14, crc); u32(local, 18, file.bytes.length); u32(local, 22, file.bytes.length); u16(local, 26, name.length);
    local.set(name, 30); local.set(file.bytes, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    u32(central, 0, 0x02014b50); u16(central, 4, 20); u16(central, 6, 20); u16(central, 8, file.flags ?? 0); u16(central, 10, 0);
    u32(central, 16, crc); u32(central, 20, file.bytes.length); u32(central, 24, file.bytes.length); u16(central, 28, name.length); u32(central, 42, localOffset);
    central.set(name, 46);
    locals.push(local); centrals.push(central); localOffset += local.length;
  }
  const central = concat(centrals);
  const eocd = new Uint8Array(22);
  u32(eocd, 0, 0x06054b50); u16(eocd, 8, files.length); u16(eocd, 10, files.length); u32(eocd, 12, central.length); u32(eocd, 16, localOffset);
  return concat([...locals, central, eocd]);
}

function mutate(input: Uint8Array, offset: number, value: number, width: 1 | 2 | 4 = 1): Uint8Array {
  const result = input.slice();
  if (width === 1) result[offset] = value;
  else if (width === 2) u16(result, offset, value);
  else u32(result, offset, value);
  return result;
}

function centralOffset(bytes: Uint8Array): number {
  return new DataView(bytes.buffer).getUint32(bytes.length - 6, true);
}

async function rejected(bytes: Uint8Array): Promise<void> {
  await expect(readStoreZip(new Blob([bytes as BlobPart]))).rejects.toBeInstanceOf(StoreZipError);
}

describe("STORE ZIP reader", () => {
  it("returns exact bounded Blob slices without extracting paths", async () => {
    const bytes = zip([{ name: "manifest.json", bytes: new TextEncoder().encode("{}") }, { name: "assets/a.glb", bytes: new Uint8Array([1, 2, 3]) }]);
    const archive = await readStoreZip(new Blob([bytes as BlobPart]));
    expect(archive.entries.map((entry) => entry.path)).toEqual(["manifest.json", "assets/a.glb"]);
    const asset = archive.entry("assets/a.glb");
    expect(asset).toBeDefined();
    expect(new Uint8Array(await (asset as NonNullable<typeof asset>).blob().arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(archive.entry("../assets/a.glb")).toBeUndefined();
  });

  it.each([
    ["missing terminal EOCD", (value: Uint8Array) => mutate(value, value.length - 22, 0)],
    ["trailing bytes", (value: Uint8Array) => concat([value, new Uint8Array([0])])],
    ["comment", (value: Uint8Array) => mutate(concat([value, new Uint8Array([0])]), value.length - 2, 1, 2)],
    ["multi-disk", (value: Uint8Array) => mutate(value, value.length - 18, 1, 2)],
    ["entry count mismatch", (value: Uint8Array) => mutate(value, value.length - 12, 2, 2)],
    ["ZIP64 entry count", (value: Uint8Array) => mutate(value, value.length - 12, 0xffff, 2)],
    ["central size", (value: Uint8Array) => mutate(value, value.length - 10, 1, 4)],
    ["central offset", (value: Uint8Array) => mutate(value, value.length - 6, 1, 4)]
  ])("rejects EOCD corruption: %s", async (_name, corrupt) => rejected(corrupt(zip([{ name: "a", bytes: new Uint8Array([1]) }]))));

  it.each([
    ["signature", 0, 0], ["version needed", 6, 45], ["flags/encryption", 8, 1], ["flags/data descriptor", 8, 8], ["method/DEFLATE", 10, 8],
    ["compressed size", 20, 2], ["uncompressed size", 24, 2], ["extra", 30, 1], ["comment", 32, 1],
    ["disk", 34, 1], ["local offset", 42, 1]
  ])("rejects central corruption: %s", async (_name, relative, value) => {
    const original = zip([{ name: "a", bytes: new Uint8Array([1]) }]);
    await rejected(mutate(original, centralOffset(original) + relative, value, relative === 0 || relative === 20 || relative === 24 || relative === 42 ? 4 : 2));
  });

  it.each([
    ["signature", 0, 0], ["version needed", 4, 45], ["flags", 6, 1], ["method", 8, 8], ["CRC", 14, 0],
    ["compressed size", 18, 2], ["uncompressed size", 22, 2], ["name length", 26, 2], ["extra", 28, 1]
  ])("rejects local/central disagreement: %s", async (_name, offset, value) => {
    const original = zip([{ name: "a", bytes: new Uint8Array([1]) }]);
    await rejected(mutate(original, offset, value, offset === 0 || offset === 14 || offset === 18 || offset === 22 ? 4 : 2));
  });

  it("rejects CRC corruption", async () => {
    const original = zip([{ name: "a", bytes: new Uint8Array([1]) }]);
    await rejected(mutate(original, 31, 2));
  });

  it("rejects overlaps, gaps, and bytes outside entries", async () => {
    const original = zip([{ name: "a", bytes: new Uint8Array([1]) }, { name: "b", bytes: new Uint8Array([2]) }]);
    const secondCentral = centralOffset(original) + 47;
    await rejected(mutate(original, secondCentral + 42, 1, 4));
    await rejected(mutate(original, secondCentral + 42, 33, 4));
  });

  it.each(["", "/a", "a/", "a//b", "a/./b", "a/../b", "a\\b", "C:a", "a%2fb", "a?b", "a#b", "con", "aux.txt", "a. ", "a.", "a\u0000b"])("rejects non-portable path %j", async (name) => {
    await rejected(zip([{ name, bytes: new Uint8Array([1]) }]));
  });

  it.each([
    [["a", "a"], "duplicate"],
    [["Asset.glb", "asset.glb"], "ASCII case collision"],
    [["caf\u00e9", "cafe\u0301"], "NFC collision"]
  ])("rejects %s path pairs", async (names) => {
    await rejected(zip((names as string[]).map((name) => ({ name, bytes: new Uint8Array([1]), flags: [...name].some((character) => character.charCodeAt(0) > 0x7f) ? 0x0800 : 0 }))));
  });

  it("rejects directories and configured limits before large reads", async () => {
    await rejected(zip([{ name: "a/", bytes: new Uint8Array() }]));
    const bytes = zip([{ name: "a", bytes: new Uint8Array([1]) }]);
    await expect(readStoreZip(new Blob([bytes as BlobPart]), { archiveBytes: bytes.length - 1 })).rejects.toBeInstanceOf(StoreZipError);
    await expect(readStoreZip(new Blob([bytes as BlobPart]), { entries: 0 })).rejects.toBeInstanceOf(StoreZipError);
    await expect(readStoreZip(new Blob([bytes as BlobPart]), { entryBytes: 0 })).rejects.toBeInstanceOf(StoreZipError);
    await expect(readStoreZip(new Blob([bytes as BlobPart]), { nameBytes: 0 })).rejects.toBeInstanceOf(StoreZipError);
  });

  it("rejects Unix special-file attributes", async () => {
    const original = zip([{ name: "a", bytes: new Uint8Array([1]) }]);
    const offset = centralOffset(original);
    const special = mutate(original, offset + 4, (3 << 8) | 20, 2);
    u32(special, offset + 38, 0xa000 << 16);
    await rejected(special);
  });

  it("rejects multiple structurally terminal EOCD candidates", async () => {
    const original = zip([{ name: "a", bytes: new Uint8Array(40) }]);
    const first = 31;
    u32(original, first, 0x06054b50);
    u16(original, first + 20, original.length - first - 22);
    await rejected(original);
  });
});
