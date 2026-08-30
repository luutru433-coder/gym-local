/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import type {
  AnimationPlayerRenderer,
  AnimationPlayerRendererMount,
  AnimationPlayerRendererSession
} from "./animation-player";

export type TestRendererSessionMethod = "play" | "pause" | "seek" | "dispose";

export interface TestRendererSessionCalls {
  play: number;
  pause: number;
  seek: readonly number[];
  dispose: number;
}

export interface TestAnimationRenderer {
  renderer: AnimationPlayerRenderer;
  mountCount(): number;
  mountInput(index?: number): AnimationPlayerRendererMount;
  resolveMount(index?: number): void;
  rejectMount(error?: unknown, index?: number): void;
  frame(positionSeconds: number, index?: number): void;
  ended(index?: number): void;
  fail(error?: unknown, index?: number): void;
  throwOnNext(method: TestRendererSessionMethod, error?: unknown, index?: number): void;
  sessionCalls(index?: number): TestRendererSessionCalls;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

interface MountRecord {
  input: AnimationPlayerRendererMount;
  deferred: Deferred<AnimationPlayerRendererSession>;
  session: AnimationPlayerRendererSession;
  settled: boolean;
  calls: {
    play: number;
    pause: number;
    seek: number[];
    dispose: number;
  };
  nextErrors: Partial<Record<TestRendererSessionMethod, unknown>>;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function requestedRecord(records: readonly MountRecord[], index: number): MountRecord {
  const record = records[index];
  if (record === undefined) throw new Error(`No deterministic renderer mount at index ${index}.`);
  return record;
}

function consumeError(record: MountRecord, method: TestRendererSessionMethod): void {
  if (!Object.prototype.hasOwnProperty.call(record.nextErrors, method)) return;
  const error = record.nextErrors[method];
  delete record.nextErrors[method];
  throw error;
}

export function createTestAnimationRenderer(): TestAnimationRenderer {
  const records: MountRecord[] = [];

  const renderer: AnimationPlayerRenderer = {
    mount(input) {
      const mount = deferred<AnimationPlayerRendererSession>();
      const record: MountRecord = {
        input,
        deferred: mount,
        settled: false,
        calls: { play: 0, pause: 0, seek: [], dispose: 0 },
        nextErrors: {},
        session: undefined as unknown as AnimationPlayerRendererSession
      };
      record.session = {
        play() {
          record.calls.play += 1;
          consumeError(record, "play");
        },
        pause() {
          record.calls.pause += 1;
          consumeError(record, "pause");
        },
        seek(positionSeconds) {
          record.calls.seek.push(positionSeconds);
          consumeError(record, "seek");
        },
        dispose() {
          record.calls.dispose += 1;
          consumeError(record, "dispose");
        }
      };
      records.push(record);
      return mount.promise;
    }
  };

  return {
    renderer,
    mountCount: () => records.length,
    mountInput: (index = 0) => requestedRecord(records, index).input,
    resolveMount(index = 0) {
      const record = requestedRecord(records, index);
      if (record.settled) throw new Error(`Renderer mount ${index} is already settled.`);
      record.settled = true;
      record.deferred.resolve(record.session);
    },
    rejectMount(error = new Error("deterministic mount failure"), index = 0) {
      const record = requestedRecord(records, index);
      if (record.settled) throw new Error(`Renderer mount ${index} is already settled.`);
      record.settled = true;
      record.deferred.reject(error);
    },
    frame(positionSeconds, index = 0) {
      requestedRecord(records, index).input.events.frame(positionSeconds);
    },
    ended(index = 0) {
      requestedRecord(records, index).input.events.ended();
    },
    fail(error = new Error("deterministic renderer failure"), index = 0) {
      requestedRecord(records, index).input.events.failed(error);
    },
    throwOnNext(method, error = new Error(`deterministic ${method} failure`), index = 0) {
      requestedRecord(records, index).nextErrors[method] = error;
    },
    sessionCalls(index = 0) {
      const calls = requestedRecord(records, index).calls;
      return Object.freeze({
        play: calls.play,
        pause: calls.pause,
        seek: Object.freeze([...calls.seek]),
        dispose: calls.dispose
      });
    }
  };
}
