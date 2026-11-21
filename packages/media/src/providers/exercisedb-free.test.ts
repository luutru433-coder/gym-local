import { afterEach, describe, expect, it, vi } from "vitest";
import { EXERCISEDB_GIF_CACHE, clearExerciseDbGifs, listExerciseDbImages, storeExerciseDbGifs } from "./exercisedb-free";

const gif = (id: string, name: string, origin = "https://static.exercisedb.dev") => ({ exerciseId: id, name, gifUrl: `${origin}/media/${id}.gif` });
const reply = (data: unknown, nextCursor?: string, status = 200) => ({ ok: status === 200, status, json: async () => ({ success: true, meta: { total: 3, nextCursor, hasNextPage: Boolean(nextCursor) }, data }) }) as Response;
const noPause = async () => undefined;

function fakeCaches() {
  const entries = new Map<string, unknown>();
  const cache = { match: async (url: string) => entries.get(url), put: async (url: string, response: unknown) => void entries.set(url, response) };
  const open = vi.fn(async () => cache);
  const remove = vi.fn(async () => { entries.clear(); return true; });
  vi.stubGlobal("caches", { open, delete: remove });
  return { entries, open, remove };
}

describe("free ExerciseDB download", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the list page by page and keeps only GIFs on the ExerciseDB image host", async () => {
    const fetchMock = vi.fn(async (url: string) => (url.includes("after=p2") ? reply([gif("c", "plank"), gif("x", "elsewhere", "https://example.com")]) : reply([gif("a", "barbell bench press"), gif("b", "squat")], "p2")));
    vi.stubGlobal("fetch", fetchMock);
    const progress: string[] = [];
    const images = await listExerciseDbImages((done, total) => progress.push(`${done}/${total}`), undefined, noPause);
    expect(images.map((image) => image.id)).toEqual(["a", "b", "c"]);
    expect(images[0]).toEqual({ id: "a", name: "barbell bench press", gifUrl: "https://static.exercisedb.dev/media/a.gif" });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["https://oss.exercisedb.dev/api/v1/exercises?limit=25", "https://oss.exercisedb.dev/api/v1/exercises?limit=25&after=p2"]);
    expect(progress).toEqual(["2/3", "3/3"]);
  });

  it("waits and asks again when the service is busy, and gives up on other errors", async () => {
    const pauses: number[] = [];
    const answers = [reply([], undefined, 429), reply([], undefined, 503), reply([gif("a", "plank")])];
    vi.stubGlobal("fetch", vi.fn(async () => answers.shift()!));
    expect(await listExerciseDbImages(undefined, undefined, async (ms) => void pauses.push(ms))).toHaveLength(1);
    expect(pauses).toEqual([2000, 4000]);
    vi.stubGlobal("fetch", vi.fn(async () => reply([], undefined, 500)));
    await expect(listExerciseDbImages(undefined, undefined, noPause)).rejects.toThrow("500");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ nope: true }) }) as Response));
    await expect(listExerciseDbImages(undefined, undefined, noPause)).rejects.toThrow();
  });

  it("saves each GIF once in the device cache and counts the ones that failed", async () => {
    const { entries, open } = fakeCaches();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("bad.gif")) throw new TypeError("offline");
      return { type: "opaque", ok: false } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const urls = ["https://static.exercisedb.dev/media/a.gif", "https://static.exercisedb.dev/media/a.gif", "https://static.exercisedb.dev/media/bad.gif", "https://example.com/media/x.gif"];
    const progress: string[] = [];
    expect(await storeExerciseDbGifs(urls, (done, total) => progress.push(`${done}/${total}`))).toEqual({ stored: 1, failed: 1 });
    expect(open).toHaveBeenCalledWith(EXERCISEDB_GIF_CACHE);
    expect([...entries.keys()]).toEqual(["https://static.exercisedb.dev/media/a.gif"]);
    expect(fetchMock.mock.calls.every((call) => (call as unknown as [string, RequestInit])[1].mode === "no-cors")).toBe(true);
    expect(progress.at(-1)).toBe("2/2");

    fetchMock.mockClear();
    expect(await storeExerciseDbGifs(["https://static.exercisedb.dev/media/a.gif"])).toEqual({ stored: 1, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes the saved GIFs", async () => {
    const { remove } = fakeCaches();
    await clearExerciseDbGifs();
    expect(remove).toHaveBeenCalledWith(EXERCISEDB_GIF_CACHE);
  });
});
