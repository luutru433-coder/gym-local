/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import type {
  AnimationPackBackend,
  AnimationPackCleanupResult,
  AnimationPackJournalSlot,
  AnimationPackObjectFile,
  AnimationPackObjectPointer,
  AnimationPackStorageEstimate
} from "./store";

const ROOT_PARTS = ["gym-local", "animation-packs", "v1"] as const;
const OBJECT_FILES = new Set<AnimationPackObjectFile>(["owner.json", "descriptor.json", "manifest.json", "archive-index.json", "verified.json"]);

function key(pointer: AnimationPackObjectPointer): string {
  return `${pointer.packId}\u0000${pointer.version}\u0000${pointer.archiveSha256}`;
}

function objectParts(pointer: AnimationPackObjectPointer): string[] {
  return [...ROOT_PARTS, "objects", pointer.packId, pointer.version, pointer.archiveSha256];
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

async function directory(root: FileSystemDirectoryHandle, parts: readonly string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const part of parts) current = await current.getDirectoryHandle(part, { create });
  return current;
}

async function existingDirectory(root: FileSystemDirectoryHandle, parts: readonly string[]): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await directory(root, parts, false);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return undefined;
    throw error;
  }
}

async function readFile(folder: FileSystemDirectoryHandle, name: string): Promise<Blob | undefined> {
  try {
    return await (await folder.getFileHandle(name)).getFile();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return undefined;
    throw error;
  }
}

async function writeFile(folder: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> {
  const handle = await folder.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(Uint8Array.from(bytes).buffer);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

/** Sole OPFS adapter for animation-pack object bytes and the activation journal. */
export class OpfsAnimationPackBackend implements AnimationPackBackend {
  readonly #root: Promise<FileSystemDirectoryHandle>;
  readonly #writers = new Map<string, FileSystemWritableFileStream>();

  constructor(root: Promise<FileSystemDirectoryHandle> = navigator.storage.getDirectory()) {
    this.#root = root;
  }

  async estimate(): Promise<AnimationPackStorageEstimate | undefined> {
    if (navigator.storage.estimate === undefined) return undefined;
    const estimate = await navigator.storage.estimate();
    return { ...(estimate.quota === undefined ? {} : { quota: estimate.quota }), ...(estimate.usage === undefined ? {} : { usage: estimate.usage }) };
  }

  async beginObject(pointer: AnimationPackObjectPointer, owner: Uint8Array): Promise<void> {
    const root = await this.#root;
    const parts = objectParts(pointer);
    const existing = await existingDirectory(root, parts);
    if (existing !== undefined) {
      const marker = await readFile(existing, "owner.json");
      if (marker === undefined || !equalBytes(new Uint8Array(await marker.arrayBuffer()), owner)) throw new Error("Existing animation-pack object is not owned by this exact identity.");
    }
    const folder = existing ?? await directory(root, parts, true);
    if (existing === undefined) await writeFile(folder, "owner.json", owner);
    const archive = await folder.getFileHandle("animation-pack.zip", { create: true });
    const writable = await archive.createWritable();
    const objectKey = key(pointer);
    if (this.#writers.has(objectKey)) {
      await writable.abort();
      throw new Error("An archive writer is already open for this object.");
    }
    this.#writers.set(objectKey, writable);
  }

  async writeArchive(pointer: AnimationPackObjectPointer, chunk: Uint8Array): Promise<void> {
    const writer = this.#writers.get(key(pointer));
    if (writer === undefined) throw new Error("Animation-pack archive writer is not open.");
    await writer.write(Uint8Array.from(chunk).buffer);
  }

  async closeArchive(pointer: AnimationPackObjectPointer): Promise<void> {
    const objectKey = key(pointer);
    const writer = this.#writers.get(objectKey);
    if (writer === undefined) throw new Error("Animation-pack archive writer is not open.");
    try {
      await writer.close();
    } finally {
      this.#writers.delete(objectKey);
    }
  }

  async abortArchive(pointer: AnimationPackObjectPointer): Promise<void> {
    const objectKey = key(pointer);
    const writer = this.#writers.get(objectKey);
    if (writer === undefined) return;
    try {
      await writer.abort();
    } finally {
      this.#writers.delete(objectKey);
    }
  }

  async readArchive(pointer: AnimationPackObjectPointer): Promise<Blob | undefined> {
    const folder = await existingDirectory(await this.#root, objectParts(pointer));
    return folder === undefined ? undefined : readFile(folder, "animation-pack.zip");
  }

  async writeObjectFile(pointer: AnimationPackObjectPointer, file: AnimationPackObjectFile, bytes: Uint8Array): Promise<void> {
    if (!OBJECT_FILES.has(file) || file === "owner.json") throw new Error("Object metadata filename is not writable through this boundary.");
    const folder = await existingDirectory(await this.#root, objectParts(pointer));
    if (folder === undefined) throw new Error("Animation-pack object directory is missing.");
    await writeFile(folder, file, bytes);
  }

  async readObjectFile(pointer: AnimationPackObjectPointer, file: AnimationPackObjectFile): Promise<Blob | undefined> {
    if (!OBJECT_FILES.has(file)) throw new Error("Object metadata filename is invalid.");
    const folder = await existingDirectory(await this.#root, objectParts(pointer));
    return folder === undefined ? undefined : readFile(folder, file);
  }

  async readJournal(slot: AnimationPackJournalSlot): Promise<Blob | undefined> {
    const folder = await existingDirectory(await this.#root, [...ROOT_PARTS, "registry"]);
    return folder === undefined ? undefined : readFile(folder, `slot-${slot}.json`);
  }

  async writeJournal(slot: AnimationPackJournalSlot, bytes: Uint8Array): Promise<void> {
    const folder = await directory(await this.#root, [...ROOT_PARTS, "registry"], true);
    await writeFile(folder, `slot-${slot}.json`, bytes);
  }

  async cleanupObject(pointer: AnimationPackObjectPointer, expectedOwner: Uint8Array, referenced: readonly AnimationPackObjectPointer[]): Promise<AnimationPackCleanupResult> {
    if (referenced.some((candidate) => key(candidate) === key(pointer))) return { status: "preserved", warning: "Referenced animation-pack object was preserved." };
    const root = await this.#root;
    const parts = objectParts(pointer);
    try {
      const folder = await existingDirectory(root, parts);
      if (folder === undefined) return { status: "preserved", warning: "Missing animation-pack object required no cleanup." };
      const resolved = await root.resolve(folder);
      if (resolved === null || resolved.length !== parts.length || resolved.some((part, index) => part !== parts[index])) return { status: "preserved", warning: "Aliased animation-pack object was preserved." };
      const owner = await readFile(folder, "owner.json");
      if (owner === undefined || !equalBytes(new Uint8Array(await owner.arrayBuffer()), expectedOwner)) return { status: "preserved", warning: "Foreign or markerless animation-pack object was preserved." };
      const parent = await existingDirectory(root, parts.slice(0, -1));
      if (parent === undefined) return { status: "preserved", warning: "Animation-pack object parent disappeared during cleanup." };
      await parent.removeEntry(parts[parts.length - 1], { recursive: true });
      return { status: "deleted" };
    } catch {
      return { status: "preserved", warning: "Unreadable animation-pack object was preserved." };
    }
  }
}

export function createOpfsAnimationPackBackend(): AnimationPackBackend {
  return new OpfsAnimationPackBackend();
}
