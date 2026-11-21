import { afterEach, describe, expect, it, vi } from "vitest";
import { findOnlineExerciseGif } from "./exercisedb-free";

const gif = (id: string, name: string, origin = "https://static.exercisedb.dev") => ({ exerciseId: id, name, gifUrl: `${origin}/media/${id}.gif` });
const reply = (data: unknown, ok = true) => ({ ok, json: async () => ({ success: true, data }) }) as Response;
const variant = (movementId: string, equipment: string) => ({ id: `${movementId}__${equipment}`, movementId, equipment: [equipment] });

describe("free ExerciseDB lookup", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks live, without caching, and returns the GIF that fits the movement and equipment", async () => {
    const fetchMock = vi.fn(async () => reply([gif("b", "dumbbell bench press"), gif("a", "barbell bench press"), gif("c", "barbell jm bench press")]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await findOnlineExerciseGif(variant("chest_press", "barbell"))).toEqual({ name: "barbell bench press", gifUrl: "https://static.exercisedb.dev/media/a.gif" });
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oss.exercisedb.dev/api/v1/exercises/search?search=barbell%20bench%20press&threshold=0.3");
    expect(options.cache).toBe("no-store");
    await findOnlineExerciseGif(variant("chest_press", "barbell"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tries the movement's second name, then gives up after two requests", async () => {
    const fetchMock = vi.fn(async (url: string) => reply(url.includes("chest%20press") ? [gif("m", "lever chest press")] : [gif("x", "lever seated fly")]));
    vi.stubGlobal("fetch", fetchMock);
    expect((await findOnlineExerciseGif(variant("chest_press", "machine")))?.name).toBe("lever chest press");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => reply([]));
    expect(await findOnlineExerciseGif(variant("horizontal_row", "cable"))).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores media from another host and makes no request for a movement it cannot name", async () => {
    const fetchMock = vi.fn(async () => reply([gif("a", "barbell bench press", "https://evil.example")]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await findOnlineExerciseGif(variant("chest_press", "barbell"))).toBeUndefined();
    fetchMock.mockClear();
    expect(await findOnlineExerciseGif(variant("custom-movement-1", "barbell"))).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails on a server error or an unexpected reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply([], false)));
    await expect(findOnlineExerciseGif(variant("chest_press", "barbell"))).rejects.toThrow("unavailable");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: "nope" }) }) as Response));
    await expect(findOnlineExerciseGif(variant("chest_press", "barbell"))).rejects.toThrow();
  });
});
