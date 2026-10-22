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

import { PERSONAL_LOCAL_ANIMATION_MAX_BYTES } from "@gym/contracts";

export interface ValidatedPersonalLocalGlb {
  clipName: string;
  durationSeconds: number;
  loop: { startSeconds: number; endSeconds: number };
  nodeCount: number;
  accessorCount: number;
  bufferViewCount: number;
  imageCount: number;
}

export class PersonalLocalGlbError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PersonalLocalGlbError";
    this.code = code;
  }
}

type JsonRecord = Record<string, unknown>;

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function fail(code: string, message: string): never {
  throw new PersonalLocalGlbError(code, message);
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_structure", `${label} must be an object.`);
  return value as JsonRecord;
}

function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail("invalid_structure", `${label} is missing or exceeds its bound.`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail("invalid_structure", `${label} must be a bounded integer.`);
  return value as number;
}

function rejectEmbeddedEgress(value: unknown, path = "gltf"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectEmbeddedEgress(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) {
    if (typeof value === "string" && /^(?:https?:|data:|javascript:|file:|blob:)/i.test(value)) fail("external_resource", `${path} contains an external or executable URI.`);
    return;
  }
  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (key === "uri") fail("external_resource", `${path}.${key} is forbidden in a self-contained GLB.`);
    if (key === "extras" || key === "extensions") fail("hidden_payload", `${path}.${key} is not accepted by the bounded personal-local profile.`);
    rejectEmbeddedEgress(item, `${path}.${key}`);
  }
}

function componentBytes(componentType: number): number {
  if (componentType === 5120 || componentType === 5121) return 1;
  if (componentType === 5122 || componentType === 5123) return 2;
  if (componentType === 5125 || componentType === 5126) return 4;
  fail("invalid_accessor", "Accessor component type is unsupported.");
}

function componentCount(type: unknown): number {
  const counts: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  if (typeof type !== "string" || counts[type] === undefined) fail("invalid_accessor", "Accessor type is unsupported.");
  return counts[type];
}

function parseJsonChunk(bytes: Uint8Array): JsonRecord {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    while (text.endsWith("\0") || text.endsWith(" ")) text = text.slice(0, -1);
  } catch {
    fail("invalid_json", "GLB JSON is not valid UTF-8.");
  }
  try {
    return record(JSON.parse(text) as unknown, "gltf");
  } catch {
    fail("invalid_json", "GLB JSON is malformed.");
  }
}

export function validatePersonalLocalGlb(bytes: Uint8Array): ValidatedPersonalLocalGlb {
  if (bytes.byteLength <= 20 || bytes.byteLength > PERSONAL_LOCAL_ANIMATION_MAX_BYTES) fail("invalid_byte_size", "GLB byte size is outside the personal-local limit.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) fail("invalid_magic", "Only binary glTF GLB files are accepted.");
  if (view.getUint32(4, true) !== 2) fail("invalid_version", "Only GLB 2.0 is accepted.");
  if (view.getUint32(8, true) !== bytes.byteLength) fail("trailing_payload", "GLB declared length must equal the selected file exactly.");

  let offset = 12;
  const chunks: Array<{ type: number; bytes: Uint8Array }> = [];
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) fail("truncated", "GLB chunk header is truncated.");
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    if (length === 0 || offset + length > bytes.byteLength) fail("truncated", "GLB chunk is truncated.");
    chunks.push({ type, bytes: bytes.subarray(offset, offset + length) });
    offset += length;
  }
  if (offset !== bytes.byteLength || chunks.length !== 2 || chunks[0].type !== JSON_CHUNK || chunks[1].type !== BIN_CHUNK) {
    fail("invalid_chunks", "GLB must contain exactly one JSON chunk followed by one BIN chunk.");
  }

  const gltf = parseJsonChunk(chunks[0].bytes);
  if (gltf.asset === undefined || record(gltf.asset, "asset").version !== "2.0") fail("invalid_version", "glTF asset.version must be 2.0.");
  if (gltf.extensionsRequired !== undefined && array(gltf.extensionsRequired, "extensionsRequired", 0).length !== 0) fail("unsafe_extension", "Required extensions are not accepted.");
  if (gltf.extensionsUsed !== undefined && array(gltf.extensionsUsed, "extensionsUsed", 0).length !== 0) fail("unsafe_extension", "Extensions are not accepted by this bounded profile.");
  rejectEmbeddedEgress(gltf);

  const nodes = array(gltf.nodes ?? [], "nodes", 512);
  const accessors = array(gltf.accessors, "accessors", 2048);
  const bufferViews = array(gltf.bufferViews, "bufferViews", 2048);
  const buffers = array(gltf.buffers, "buffers", 1);
  const images = array(gltf.images ?? [], "images", 64);
  const animations = array(gltf.animations, "animations", 1);
  if (buffers.length !== 1 || animations.length !== 1) fail("invalid_structure", "GLB requires exactly one buffer and one animation clip.");

  const buffer = record(buffers[0], "buffers[0]");
  const declaredBufferBytes = integer(buffer.byteLength, "buffers[0].byteLength", 1);
  const bin = chunks[1].bytes;
  if (declaredBufferBytes > bin.byteLength || bin.byteLength - declaredBufferBytes > 3) fail("hidden_payload", "BIN chunk size does not match its declared buffer.");
  for (const byte of bin.subarray(declaredBufferBytes)) if (byte !== 0) fail("hidden_payload", "BIN alignment padding must be zero.");

  const coverage = new Uint8Array(declaredBufferBytes);
  const parsedViews = bufferViews.map((value, index) => {
    const input = record(value, `bufferViews[${index}]`);
    if (input.buffer !== 0) fail("invalid_structure", "Every buffer view must use the embedded GLB buffer.");
    const byteOffset = input.byteOffset === undefined ? 0 : integer(input.byteOffset, `bufferViews[${index}].byteOffset`);
    const byteLength = integer(input.byteLength, `bufferViews[${index}].byteLength`, 1);
    if (byteOffset + byteLength > declaredBufferBytes) fail("truncated", "Buffer view exceeds the embedded buffer.");
    for (let cursor = byteOffset; cursor < byteOffset + byteLength; cursor += 1) coverage[cursor] = 1;
    const byteStride = input.byteStride === undefined ? undefined : integer(input.byteStride, `bufferViews[${index}].byteStride`, 4);
    return { byteOffset, byteLength, byteStride };
  });
  coverage.forEach((used, index) => { if (used === 0 && bin[index] !== 0) fail("hidden_payload", "Undeclared nonzero BIN bytes are forbidden."); });

  const parsedAccessors = accessors.map((value, index) => {
    const input = record(value, `accessors[${index}]`);
    if (input.sparse !== undefined) fail("invalid_accessor", "Sparse accessors are not accepted.");
    const bufferView = integer(input.bufferView, `accessors[${index}].bufferView`);
    if (bufferView >= parsedViews.length) fail("invalid_accessor", "Accessor bufferView is missing.");
    const componentType = integer(input.componentType, `accessors[${index}].componentType`);
    const count = integer(input.count, `accessors[${index}].count`, 1);
    if (count > 1_000_000) fail("invalid_accessor", "Accessor count exceeds the bounded profile.");
    const elements = componentCount(input.type);
    const width = componentBytes(componentType) * elements;
    const byteOffset = input.byteOffset === undefined ? 0 : integer(input.byteOffset, `accessors[${index}].byteOffset`);
    const source = parsedViews[bufferView];
    const stride = source.byteStride ?? width;
    if (stride < width || byteOffset + (count - 1) * stride + width > source.byteLength) fail("invalid_accessor", "Accessor exceeds its buffer view.");
    return { componentType, count, elements, byteOffset: source.byteOffset + byteOffset, stride, type: input.type };
  });

  const animation = record(animations[0], "animations[0]");
  if (typeof animation.name !== "string" || animation.name.length === 0 || animation.name.length > 256 || animation.name.trim() !== animation.name) fail("invalid_clip", "The one animation clip must have a finite name.");
  const samplers = array(animation.samplers, "animations[0].samplers", 1024);
  const channels = array(animation.channels, "animations[0].channels", 2048);
  if (samplers.length === 0 || channels.length === 0) fail("invalid_clip", "The animation clip must contain samplers and channels.");
  let duration = 0;
  samplers.forEach((value, index) => {
    const sampler = record(value, `animations[0].samplers[${index}]`);
    const inputIndex = integer(sampler.input, `animations[0].samplers[${index}].input`);
    const outputIndex = integer(sampler.output, `animations[0].samplers[${index}].output`);
    const accessor = parsedAccessors[inputIndex];
    if (accessor === undefined || parsedAccessors[outputIndex] === undefined || accessor.componentType !== 5126 || accessor.type !== "SCALAR" || accessor.count < 2) fail("invalid_clip", "Animation sampler accessors are invalid.");
    let prior = -1;
    for (let item = 0; item < accessor.count; item += 1) {
      const time = view.getFloat32(12 + 8 + chunks[0].bytes.byteLength + 8 + accessor.byteOffset + item * accessor.stride, true);
      if (!Number.isFinite(time) || time < 0 || time <= prior) fail("invalid_clip", "Animation input times must be finite and strictly increasing.");
      prior = time;
    }
    duration = Math.max(duration, prior);
  });
  channels.forEach((value, index) => {
    const channel = record(value, `animations[0].channels[${index}]`);
    if (integer(channel.sampler, `animations[0].channels[${index}].sampler`) >= samplers.length) fail("invalid_clip", "Animation channel sampler is missing.");
    const target = record(channel.target, `animations[0].channels[${index}].target`);
    if (target.node !== undefined && integer(target.node, `animations[0].channels[${index}].target.node`) >= nodes.length) fail("invalid_clip", "Animation channel node is missing.");
    if (!["translation", "rotation", "scale", "weights"].includes(String(target.path))) fail("invalid_clip", "Animation channel path is invalid.");
  });
  images.forEach((value, index) => {
    const image = record(value, `images[${index}]`);
    if (image.bufferView === undefined || integer(image.bufferView, `images[${index}].bufferView`) >= bufferViews.length) fail("external_resource", "Images must be embedded in a buffer view.");
  });
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400) fail("invalid_clip", "Animation duration is invalid.");
  return {
    clipName: animation.name,
    durationSeconds: duration,
    loop: { startSeconds: 0, endSeconds: duration },
    nodeCount: nodes.length,
    accessorCount: accessors.length,
    bufferViewCount: bufferViews.length,
    imageCount: images.length
  };
}
