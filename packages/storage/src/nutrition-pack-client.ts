import type { NutritionPackManifest } from "@gym/contracts";

export {
  commitStagedNutritionPack,
  fetchNutritionPackManifest,
  obsoletePackFileAfterActivation
} from "./providers/nutrition-pack";

interface WorkerEnvelope {
  id: string;
  type: "result" | "error" | "progress";
  payload: unknown;
}

export interface NutritionPackWorkerInfo {
  installed: boolean;
  metadata?: Record<string, string>;
  manifest?: NutritionPackManifest;
  activeFileName?: string;
  recoveredPreviousPack?: boolean;
  recoveredInvalidPack?: boolean;
}

export type NutritionPackProgressListener = (progress: { bytesDownloaded: number; totalBytes?: number }) => void;

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `nutrition-request-${Date.now()}`;
}

export class NutritionPackWorkerClient {
  private worker?: Worker;
  private requestTail: Promise<void> = Promise.resolve();
  private readonly pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    onProgress?: NutritionPackProgressListener;
  }>();

  constructor(private readonly workerFactory: () => Worker = () => new Worker(
    new URL("./nutrition-pack.worker.ts", import.meta.url),
    { type: "module", name: "gym-local-nutrition" }
  )) {}

  private rejectCrashedWorker(worker: Worker, error: Error): void {
    if (this.worker !== worker) return;
    this.worker = undefined;
    worker.terminate();
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    this.worker = worker;
    worker.addEventListener("message", (event: MessageEvent<WorkerEnvelope>) => {
      const message = event.data;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      if (message.type === "progress") {
        pending.onProgress?.(message.payload as { bytesDownloaded: number; totalBytes?: number });
        return;
      }
      this.pending.delete(message.id);
      if (message.type === "error") {
        pending.reject(new Error((message.payload as { message?: string }).message ?? "Nutrition worker failed"));
      } else {
        pending.resolve(message.payload);
      }
    });
    worker.addEventListener("error", (event) => {
      this.rejectCrashedWorker(worker, new Error(event.message || "Nutrition worker crashed"));
    });
    worker.addEventListener("messageerror", () => {
      this.rejectCrashedWorker(worker, new Error("Nutrition worker returned an unreadable response"));
    });
    return worker;
  }

  private dispatch<T>(type: string, payload: Record<string, unknown>, onProgress?: NutritionPackProgressListener): Promise<T> {
    let worker: Worker;
    try {
      worker = this.getWorker();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    const id = requestId();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, onProgress });
      try {
        worker.postMessage({ id, type, ...payload });
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  request<T>(type: string, payload: Record<string, unknown> = {}, onProgress?: NutritionPackProgressListener): Promise<T> {
    const response = this.requestTail.then(
      () => this.dispatch<T>(type, payload, onProgress),
      () => this.dispatch<T>(type, payload, onProgress)
    );
    this.requestTail = response.then(() => undefined, () => undefined);
    return response;
  }
}

const nutritionPackClient = new NutritionPackWorkerClient();

export function getNutritionPackWorkerInfo(): Promise<NutritionPackWorkerInfo> {
  return nutritionPackClient.request("init");
}

export function installNutritionPackFile(
  manifest: NutritionPackManifest,
  onProgress?: NutritionPackProgressListener
): Promise<NutritionPackWorkerInfo & { checksum: string; bytesDownloaded: number }> {
  return nutritionPackClient.request("install", { manifest }, onProgress);
}

export function searchNutritionPackRows(query: string, limit: number): Promise<Record<string, unknown>[]> {
  return nutritionPackClient.request("search", { query, limit });
}

export function removeNutritionPackFiles(): Promise<{ removed: boolean }> {
  return nutritionPackClient.request("remove");
}
