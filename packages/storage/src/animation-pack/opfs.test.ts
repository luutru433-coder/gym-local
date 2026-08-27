/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { beforeEach, describe, expect, it } from "vitest";
import { OpfsAnimationPackBackend } from "./opfs";
import type { AnimationPackObjectPointer } from "./store";

type Node = FakeDirectory | FakeFile;

class FakeFile {
  blob = new Blob();
  unreadable = false;
}

class FakeWritable {
  readonly #file: FakeFile;
  readonly #parts: BlobPart[] = [];
  closed = false;
  aborted = false;

  constructor(file: FakeFile) { this.#file = file; }
  async write(chunk: FileSystemWriteChunkType): Promise<void> {
    if (this.closed || this.aborted) throw new Error("writer closed");
    if (typeof chunk === "object" && chunk !== null && "type" in chunk) throw new Error("commands not used");
    this.#parts.push(chunk as BlobPart);
  }
  async close(): Promise<void> { this.#file.blob = new Blob(this.#parts); this.closed = true; }
  async abort(): Promise<void> { this.aborted = true; }
}

class FakeFileHandle {
  readonly kind = "file" as const;
  readonly name: string;
  readonly file: FakeFile;
  lastWriter?: FakeWritable;
  constructor(name: string, file: FakeFile) { this.name = name; this.file = file; }
  async getFile(): Promise<File> {
    if (this.file.unreadable) throw new Error("unreadable");
    return new File([await this.file.blob.arrayBuffer()], this.name);
  }
  async createWritable(): Promise<FileSystemWritableFileStream> {
    this.lastWriter = new FakeWritable(this.file);
    return this.lastWriter as unknown as FileSystemWritableFileStream;
  }
}

class FakeDirectory {
  readonly kind = "directory" as const;
  readonly name: string;
  readonly children = new Map<string, Node>();
  readonly root: FakeDirectory;
  resolveAsAlias = false;
  constructor(name: string, root?: FakeDirectory) { this.name = name; this.root = root ?? this; }

  async getDirectoryHandle(name: string, options: FileSystemGetDirectoryOptions = {}): Promise<FileSystemDirectoryHandle> {
    const node = this.children.get(name);
    if (node instanceof FakeDirectory) return node as unknown as FileSystemDirectoryHandle;
    if (node !== undefined) throw new DOMException("type", "TypeMismatchError");
    if (!options.create) throw new DOMException("missing", "NotFoundError");
    const created = new FakeDirectory(name, this.root); this.children.set(name, created);
    return created as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options: FileSystemGetFileOptions = {}): Promise<FileSystemFileHandle> {
    const node = this.children.get(name);
    if (node instanceof FakeFile) return new FakeFileHandle(name, node) as unknown as FileSystemFileHandle;
    if (node !== undefined) throw new DOMException("type", "TypeMismatchError");
    if (!options.create) throw new DOMException("missing", "NotFoundError");
    const created = new FakeFile(); this.children.set(name, created);
    return new FakeFileHandle(name, created) as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string, options: FileSystemRemoveOptions = {}): Promise<void> {
    const node = this.children.get(name);
    if (node === undefined) throw new DOMException("missing", "NotFoundError");
    if (node instanceof FakeDirectory && node.children.size > 0 && !options.recursive) throw new DOMException("not empty", "InvalidModificationError");
    this.children.delete(name);
  }

  async resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    if (this.resolveAsAlias) return ["alias"];
    const search = (folder: FakeDirectory, path: string[]): string[] | undefined => {
      if ((folder as unknown) === possibleDescendant) return path;
      for (const [name, child] of folder.children) {
        if (child instanceof FakeDirectory) { const result = search(child, [...path, name]); if (result !== undefined) return result; }
      }
      return undefined;
    };
    return search(this, []) ?? null;
  }
}

const pointer: AnimationPackObjectPointer = {
  packId: "gym-local.test",
  version: "1.2.3",
  archiveSha256: "a".repeat(64)
};
const owner = new TextEncoder().encode("owner\n");

function child(root: FakeDirectory, path: string): Node | undefined {
  let node: Node = root;
  for (const part of path.split("/")) {
    if (!(node instanceof FakeDirectory)) return undefined;
    const next = node.children.get(part);
    if (next === undefined) return undefined;
    node = next;
  }
  return node;
}

function backend(root = new FakeDirectory("")): { root: FakeDirectory; backend: OpfsAnimationPackBackend } {
  return { root, backend: new OpfsAnimationPackBackend(Promise.resolve(root as unknown as FileSystemDirectoryHandle)) };
}

beforeEach(() => {
  Object.defineProperty(navigator, "storage", { configurable: true, value: { estimate: async () => ({ quota: 1000, usage: 200 }) } });
});

describe("OPFS animation pack backend", () => {
  it("streams an archive into the exact content-addressed layout and commits only on close", async () => {
    const target = backend();
    await target.backend.beginObject(pointer, owner);
    await target.backend.writeArchive(pointer, new Uint8Array([1, 2]));
    await target.backend.writeArchive(pointer, new Uint8Array([3]));
    expect((await target.backend.readArchive(pointer))?.size).toBe(0);
    await target.backend.closeArchive(pointer);
    expect(new Uint8Array(await (await target.backend.readArchive(pointer) as Blob).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(child(target.root, `gym-local/animation-packs/v1/objects/${pointer.packId}/${pointer.version}/${pointer.archiveSha256}/owner.json`)).toBeInstanceOf(FakeFile);
  });

  it("abort leaves previously committed bytes unchanged", async () => {
    const target = backend(); await target.backend.beginObject(pointer, owner); await target.backend.writeArchive(pointer, new Uint8Array([1])); await target.backend.closeArchive(pointer);
    await target.backend.beginObject(pointer, owner); await target.backend.writeArchive(pointer, new Uint8Array([2])); await target.backend.abortArchive(pointer);
    expect(new Uint8Array(await (await target.backend.readArchive(pointer) as Blob).arrayBuffer())).toEqual(new Uint8Array([1]));
  });

  it("writes only allowlisted object metadata and rereads exact bytes", async () => {
    const target = backend(); await target.backend.beginObject(pointer, owner); await target.backend.closeArchive(pointer);
    await target.backend.writeObjectFile(pointer, "verified.json", new Uint8Array([4, 5]));
    expect(new Uint8Array(await (await target.backend.readObjectFile(pointer, "verified.json") as Blob).arrayBuffer())).toEqual(new Uint8Array([4, 5]));
    await expect(target.backend.writeObjectFile(pointer, "owner.json", new Uint8Array())).rejects.toThrow();
  });

  it("writes and closes independent registry slots without rename", async () => {
    const target = backend();
    await target.backend.writeJournal("a", new Uint8Array([1])); await target.backend.writeJournal("b", new Uint8Array([2]));
    expect(new Uint8Array(await (await target.backend.readJournal("a") as Blob).arrayBuffer())).toEqual(new Uint8Array([1]));
    expect(new Uint8Array(await (await target.backend.readJournal("b") as Blob).arrayBuffer())).toEqual(new Uint8Array([2]));
  });

  it("reports browser quota estimates without requiring them", async () => {
    const target = backend(); expect(await target.backend.estimate()).toEqual({ quota: 1000, usage: 200 });
    Object.defineProperty(navigator, "storage", { configurable: true, value: {} });
    expect(await target.backend.estimate()).toBeUndefined();
  });

  it("deletes only an exact unreferenced object with the exact owner marker", async () => {
    const target = backend(); await target.backend.beginObject(pointer, owner); await target.backend.closeArchive(pointer);
    expect(await target.backend.cleanupObject(pointer, owner, [])).toEqual({ status: "deleted" });
    expect(await target.backend.readArchive(pointer)).toBeUndefined();
  });

  it("preserves referenced, aliased, markerless, mismatched, and unreadable objects", async () => {
    const referenced = backend(); await referenced.backend.beginObject(pointer, owner); await referenced.backend.closeArchive(pointer);
    expect((await referenced.backend.cleanupObject(pointer, owner, [pointer])).status).toBe("preserved");

    const aliased = backend(); await aliased.backend.beginObject(pointer, owner); await aliased.backend.closeArchive(pointer); aliased.root.resolveAsAlias = true;
    expect((await aliased.backend.cleanupObject(pointer, owner, [])).status).toBe("preserved");

    const markerless = backend(); await markerless.backend.beginObject(pointer, owner); await markerless.backend.closeArchive(pointer);
    const folder = child(markerless.root, `gym-local/animation-packs/v1/objects/${pointer.packId}/${pointer.version}/${pointer.archiveSha256}`) as FakeDirectory;
    folder.children.delete("owner.json");
    expect((await markerless.backend.cleanupObject(pointer, owner, [])).status).toBe("preserved");

    const mismatched = backend(); await mismatched.backend.beginObject(pointer, owner); await mismatched.backend.closeArchive(pointer);
    expect((await mismatched.backend.cleanupObject(pointer, new Uint8Array([9]), [])).status).toBe("preserved");

    const unreadable = backend(); await unreadable.backend.beginObject(pointer, owner); await unreadable.backend.closeArchive(pointer);
    (child(unreadable.root, `gym-local/animation-packs/v1/objects/${pointer.packId}/${pointer.version}/${pointer.archiveSha256}/owner.json`) as FakeFile).unreadable = true;
    expect((await unreadable.backend.cleanupObject(pointer, owner, [])).status).toBe("preserved");
  });

  it("rejects a foreign preexisting directory before opening a writer", async () => {
    const target = backend(); await target.backend.beginObject(pointer, owner); await target.backend.closeArchive(pointer);
    await expect(target.backend.beginObject(pointer, new Uint8Array([9]))).rejects.toThrow(/not owned/);
  });
});
