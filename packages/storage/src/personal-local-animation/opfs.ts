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

import type { PersonalLocalAnimationRecord } from "@gym/contracts";
import type { PersonalLocalAnimationBackend } from "./store";

const ROOT = ["gym-local", "personal-local-animations", "v1"] as const;

async function directory(root: FileSystemDirectoryHandle, parts: readonly string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const part of parts) current = await current.getDirectoryHandle(part, { create });
  return current;
}

async function existingDirectory(root: FileSystemDirectoryHandle, parts: readonly string[]): Promise<FileSystemDirectoryHandle | undefined> {
  try { return await directory(root, parts, false); } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return undefined;
    throw error;
  }
}

async function read(folder: FileSystemDirectoryHandle, name: string): Promise<Blob | undefined> {
  try { return await (await folder.getFileHandle(name)).getFile(); } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return undefined;
    throw error;
  }
}

async function write(folder: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> {
  const writable = await (await folder.getFileHandle(name, { create: true })).createWritable();
  try { await writable.write(Uint8Array.from(bytes).buffer); await writable.close(); } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function owner(record: PersonalLocalAnimationRecord): Uint8Array {
  const sorted = { layoutVersion: 1, owner: "gym-local-personal-local-animation", personalLocalAnimationId: record.personalLocalAnimationId };
  return new TextEncoder().encode(`${JSON.stringify(sorted)}\n`);
}

export class OpfsPersonalLocalAnimationBackend implements PersonalLocalAnimationBackend {
  readonly #root: Promise<FileSystemDirectoryHandle>;

  constructor(root: Promise<FileSystemDirectoryHandle> = navigator.storage.getDirectory()) {
    this.#root = root;
  }

  async estimate(): Promise<{ quota?: number; usage?: number } | undefined> {
    if (navigator.storage.estimate === undefined) return undefined;
    const value = await navigator.storage.estimate();
    return { ...(value.quota === undefined ? {} : { quota: value.quota }), ...(value.usage === undefined ? {} : { usage: value.usage }) };
  }

  async writeObject(record: PersonalLocalAnimationRecord, recordBytes: Uint8Array, asset: Uint8Array): Promise<void> {
    const folder = await directory(await this.#root, [...ROOT, "objects", record.personalLocalAnimationId], true);
    await write(folder, "owner.json", owner(record));
    await write(folder, "record.json", recordBytes);
    await write(folder, "animation.glb", asset);
  }

  async readRecord(id: string): Promise<Blob | undefined> {
    const folder = await existingDirectory(await this.#root, [...ROOT, "objects", id]);
    return folder === undefined ? undefined : read(folder, "record.json");
  }

  async readAsset(id: string): Promise<Blob | undefined> {
    const folder = await existingDirectory(await this.#root, [...ROOT, "objects", id]);
    return folder === undefined ? undefined : read(folder, "animation.glb");
  }

  async deleteObject(id: string, expectedOwner: Uint8Array): Promise<boolean> {
    try {
      const root = await this.#root;
      const parts = [...ROOT, "objects", id];
      const folder = await existingDirectory(root, parts);
      if (folder === undefined) return false;
      const resolved = await root.resolve(folder);
      const marker = await read(folder, "owner.json");
      if (resolved === null || resolved.join("/") !== parts.join("/") || marker === undefined || !equal(new Uint8Array(await marker.arrayBuffer()), expectedOwner)) return false;
      const parent = await directory(root, parts.slice(0, -1), false);
      await parent.removeEntry(id, { recursive: true });
      return true;
    } catch { return false; }
  }

  async readRegistry(slot: "a" | "b"): Promise<Blob | undefined> {
    const folder = await existingDirectory(await this.#root, [...ROOT, "registry"]);
    return folder === undefined ? undefined : read(folder, `slot-${slot}.json`);
  }

  async writeRegistry(slot: "a" | "b", bytes: Uint8Array): Promise<void> {
    const folder = await directory(await this.#root, [...ROOT, "registry"], true);
    await write(folder, `slot-${slot}.json`, bytes);
  }
}

export function createOpfsPersonalLocalAnimationBackend(): PersonalLocalAnimationBackend {
  return new OpfsPersonalLocalAnimationBackend();
}
