import { z } from "zod";

export const EXERCISEDB_CREDIT = { name: "AscendAPI.com", url: "https://ascendapi.com" } as const;

/** Must match the runtime cache name for this host in vite.config.ts, so the service worker serves what is saved here. */
export const EXERCISEDB_GIF_CACHE = "exercisedb-gifs";

const LIST_URL = "https://oss.exercisedb.dev/api/v1/exercises";
const MEDIA_ORIGIN = "https://static.exercisedb.dev";
const PAGE_SIZE = 25;
const MAX_PAGES = 200;
const RETRIES = 4;
const PARALLEL = 4;

const words = z.array(z.string()).catch([]).default([]);

const pageSchema = z.object({
  meta: z.object({ total: z.number().optional(), nextCursor: z.string().nullish(), hasNextPage: z.boolean().optional() }).optional(),
  data: z.array(z.object({
    exerciseId: z.string(),
    name: z.string(),
    gifUrl: z.string(),
    bodyParts: words,
    equipments: words,
    targetMuscles: words,
    secondaryMuscles: words,
    instructions: words
  }))
});

export interface ExerciseDbImage {
  id: string;
  name: string;
  gifUrl: string;
  details: ExerciseDbDetails;
}

/** What the service says about one exercise, in its own English vocabulary. */
export interface ExerciseDbDetails {
  bodyParts: string[];
  equipments: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isMediaUrl(url: string): boolean {
  try {
    return new URL(url).origin === MEDIA_ORIGIN;
  } catch {
    return false;
  }
}

async function page(cursor: string | undefined, signal: AbortSignal | undefined, pause: (ms: number) => Promise<void>) {
  const url = `${LIST_URL}?limit=${PAGE_SIZE}${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`;
  for (let attempt = 0; ; attempt++) {
    // A busy answer (429, 502, 503) can arrive without cross-origin headers, which the browser reports as a
    // failed request instead of a status; both are worth waiting for and asking again.
    let status = 0;
    try {
      const response = await fetch(url, { signal });
      if (response.ok) return pageSchema.parse(await response.json());
      status = response.status;
    } catch (error) {
      if (signal?.aborted || !(error instanceof TypeError)) throw error;
    }
    if (attempt >= RETRIES || ![0, 429, 502, 503].includes(status)) throw new Error(status ? `ExerciseDB list request failed (${status})` : "ExerciseDB could not be reached");
    await pause(2000 * 2 ** attempt);
  }
}

/** Every exercise name with its GIF address from the free ExerciseDB list, read page by page. */
export async function listExerciseDbImages(onProgress?: (done: number, total: number) => void, signal?: AbortSignal, pause: (ms: number) => Promise<void> = sleep): Promise<ExerciseDbImage[]> {
  const images = new Map<string, ExerciseDbImage>();
  let cursor: string | undefined;
  for (let index = 0; index < MAX_PAGES; index++) {
    const result = await page(cursor, signal, pause);
    for (const item of result.data) if (isMediaUrl(item.gifUrl)) images.set(item.exerciseId, {
        id: item.exerciseId,
        name: item.name,
        gifUrl: item.gifUrl,
        details: { bodyParts: item.bodyParts, equipments: item.equipments, targetMuscles: item.targetMuscles, secondaryMuscles: item.secondaryMuscles, instructions: item.instructions }
      });
    onProgress?.(images.size, Math.max(result.meta?.total ?? 0, images.size));
    const next = result.meta?.nextCursor ?? undefined;
    if (!next || next === cursor || result.meta?.hasNextPage === false || result.data.length === 0) break;
    cursor = next;
    await pause(400);
  }
  return [...images.values()];
}

function showsAsImage(url: string): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(true);
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(false), 20000);
    const done = (ok: boolean) => () => { clearTimeout(timer); resolve(ok); };
    image.onload = done(true);
    image.onerror = done(false);
    image.src = url;
  });
}

/**
 * Saves GIFs in the browser's cache storage on this device. The image server sends no cross-origin permission,
 * so the files cannot be read into the app's database; they are kept as the browser fetched them and the
 * service worker hands them back offline.
 */
export async function storeExerciseDbGifs(
  urls: string[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  shows: (url: string) => Promise<boolean> = showsAsImage
): Promise<{ stored: number; failed: number }> {
  const wanted = [...new Set(urls.filter(isMediaUrl))];
  const cache = await caches.open(EXERCISEDB_GIF_CACHE);
  let stored = 0;
  let failed = 0;
  let next = 0;
  async function worker() {
    while (next < wanted.length && !signal?.aborted) {
      const url = wanted[next++];
      try {
        if (!(await cache.match(url))) {
          const response = await fetch(url, { mode: "no-cors", signal });
          if (response.type !== "opaque" && !response.ok) throw new Error("not saved");
          await cache.put(url, response);
          // The saved answer cannot be read, so an error page would be kept as if it were the GIF: keep it
          // only when the browser can draw it.
          if (!(await shows(url))) {
            await cache.delete(url);
            throw new Error("not an image");
          }
        }
        stored++;
      } catch {
        failed++;
      }
      onProgress?.(stored + failed, wanted.length);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return { stored, failed };
}

/** Removes every saved ExerciseDB GIF from this device. */
export async function clearExerciseDbGifs(): Promise<void> {
  if (typeof caches !== "undefined") await caches.delete(EXERCISEDB_GIF_CACHE);
}
