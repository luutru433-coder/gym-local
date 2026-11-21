// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearExerciseImagePack, exerciseImagePackSummary, getExerciseImage, linkExerciseImage } from "@gym/storage/exercise-images";
import { downloadExerciseDbImages, importExerciseImagePack } from "./exerciseImagePackActions";

const remote = vi.hoisted(() => ({ stored: [] as string[] }));
vi.mock("@gym/media/online-gifs", () => ({
  listExerciseDbImages: async (onProgress?: (done: number, total: number) => void) => {
    onProgress?.(3, 3);
    return ["barbell bench press", "barbell full squat", "wrist roller"].map((name, index) => ({ id: `e${index}`, name, gifUrl: `https://static.exercisedb.dev/media/e${index}.gif` }));
  },
  storeExerciseDbGifs: async (urls: string[], onProgress?: (done: number, total: number) => void) => {
    remote.stored = urls;
    onProgress?.(urls.length, urls.length);
    return { stored: urls.length, failed: 0 };
  }
}));

const gif = (name: string, bytes: number) => new File([new Uint8Array(bytes)], name, { type: "image/gif" });
const pack = () => [
  gif("0025.gif", 30),
  gif("0043.gif", 20),
  gif("9999.gif", 10),
  new File([JSON.stringify([{ id: "0025", name: "barbell bench press" }, { id: "0043", name: "barbell full squat" }, { id: "9999", name: "wrist roller" }])], "exercises.json", { type: "application/json" }),
  new File(["licence"], "LICENSE.txt")
];

describe("exercise image pack import", () => {
  beforeEach(async () => {
    await clearExerciseImagePack();
  });

  it("stores the picked images on the device and suggests them for matching catalog exercises", async () => {
    const progress: string[] = [];
    const result = await importExerciseImagePack(pack(), (stored, total) => progress.push(`${stored}/${total}`));
    expect(result).toEqual({ imported: 3, ignored: 1, suggested: 2 });
    expect(progress).toEqual(["3/3"]);
    expect((await getExerciseImage("chest_press__barbell"))?.name).toBe("barbell bench press");
    expect((await getExerciseImage("squat__barbell"))?.blob?.size).toBe(20);
    expect(await getExerciseImage("chest_press__dumbbell")).toBeUndefined();
    expect(await exerciseImagePackSummary()).toEqual({ imageCount: 3, linkedCount: 2, bytes: 60, remoteCount: 0 });
  });

  it("keeps an image the owner chose himself when the pack is imported again", async () => {
    await importExerciseImagePack(pack());
    await linkExerciseImage("chest_press__barbell", "9999");
    const again = await importExerciseImagePack(pack());
    expect(again.suggested).toBe(1);
    expect((await getExerciseImage("chest_press__barbell"))?.id).toBe("9999");
  });

  it("downloads the ExerciseDB list, links GIFs only where no image is set, and saves just the linked GIFs", async () => {
    await importExerciseImagePack(pack());
    await linkExerciseImage("squat__barbell", undefined);
    const steps: string[] = [];
    const result = await downloadExerciseDbImages((step, done, total) => steps.push(`${step} ${done}/${total}`));
    expect(result.listed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.stored).toBe(remote.stored.length);
    expect(steps[0]).toBe("list 3/3");
    // The owner's own pack image and his removal are kept.
    expect((await getExerciseImage("chest_press__barbell"))?.id).toBe("0025");
    expect(await getExerciseImage("squat__barbell")).toBeUndefined();
    expect(remote.stored.every((url) => url.startsWith("https://static.exercisedb.dev/media/"))).toBe(true);
    expect(remote.stored).not.toContain("https://static.exercisedb.dev/media/e2.gif");
    expect((await exerciseImagePackSummary()).remoteCount).toBe(3);
  });

  it("links the downloaded GIFs when there is no pack of his own", async () => {
    const result = await downloadExerciseDbImages();
    expect(result.suggested).toBeGreaterThanOrEqual(2);
    expect((await getExerciseImage("chest_press__barbell"))?.remoteUrl).toBe("https://static.exercisedb.dev/media/e0.gif");
    expect(remote.stored).toEqual(expect.arrayContaining(["https://static.exercisedb.dev/media/e0.gif", "https://static.exercisedb.dev/media/e1.gif"]));
  });

  it("reports a selection without images instead of storing anything", async () => {
    expect(await importExerciseImagePack([new File(["x"], "notes.txt")])).toEqual({ imported: 0, ignored: 1, suggested: 0 });
    expect((await exerciseImagePackSummary()).imageCount).toBe(0);
  });
});
