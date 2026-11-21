// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ExerciseImageDatabase,
  applyExerciseImageLinksWhereMissing,
  applySuggestedExerciseImageLinks,
  clearExerciseImagePack,
  exerciseImagePackSummary,
  getExerciseImage,
  importExerciseImages,
  importRemoteExerciseImages,
  linkExerciseImage,
  listExerciseImageLinks,
  listLinkedRemoteExerciseImageUrls,
  listExerciseImages,
  type ExerciseImageInput
} from "./exercise-images";

const image = (id: string, name: string, bytes = 4): ExerciseImageInput => ({
  id,
  name,
  fileName: `${id}.gif`,
  type: "image/gif",
  size: bytes,
  blob: new Blob([new Uint8Array(bytes)], { type: "image/gif" })
});

describe("exercise image pack storage", () => {
  let db: ExerciseImageDatabase;

  beforeEach(() => {
    db = new ExerciseImageDatabase(`exercise-images-test-${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("stores images, lists them by name without the file data, and totals their size", async () => {
    await importExerciseImages([image("0025", "barbell bench press", 10), image("0001", "air bike", 6)], db);
    const listed = await listExerciseImages(db);
    expect(listed.map((item) => item.name)).toEqual(["air bike", "barbell bench press"]);
    expect(listed[0]).not.toHaveProperty("blob");
    expect(await exerciseImagePackSummary(db)).toEqual({ imageCount: 2, linkedCount: 0, bytes: 16, remoteCount: 0 });
  });

  it("returns the linked image for a variant and nothing for an unlinked one", async () => {
    await importExerciseImages([image("0025", "barbell bench press", 10)], db);
    expect(await applySuggestedExerciseImageLinks({ chest_press__barbell: "0025", squat__barbell: "missing" }, db)).toBe(1);
    const found = await getExerciseImage("chest_press__barbell", db);
    expect(found?.name).toBe("barbell bench press");
    expect(found?.blob?.size).toBe(10);
    expect(await getExerciseImage("squat__barbell", db)).toBeUndefined();
    expect((await exerciseImagePackSummary(db)).linkedCount).toBe(1);
  });

  it("keeps the owner's own choice, including a removal, when suggestions run again", async () => {
    await importExerciseImages([image("a", "barbell bench press"), image("b", "barbell wide bench press"), image("c", "barbell full squat")], db);
    await applySuggestedExerciseImageLinks({ chest_press__barbell: "a", squat__barbell: "c" }, db);
    await linkExerciseImage("chest_press__barbell", "b", db);
    await linkExerciseImage("squat__barbell", undefined, db);
    expect(await applySuggestedExerciseImageLinks({ chest_press__barbell: "a", squat__barbell: "c" }, db)).toBe(0);
    expect((await getExerciseImage("chest_press__barbell", db))?.id).toBe("b");
    expect(await getExerciseImage("squat__barbell", db)).toBeUndefined();
    expect((await listExerciseImageLinks(db)).every((link) => link.manual)).toBe(true);
    await expect(linkExerciseImage("squat__barbell", "nope", db)).rejects.toThrow("Exercise image not found");
  });

  it("replaces a re-imported image in place so its link survives", async () => {
    await importExerciseImages([image("a", "barbell bench press", 4)], db);
    await applySuggestedExerciseImageLinks({ chest_press__barbell: "a" }, db);
    await importExerciseImages([image("a", "barbell bench press", 9)], db);
    expect((await getExerciseImage("chest_press__barbell", db))?.blob?.size).toBe(9);
    expect((await exerciseImagePackSummary(db)).imageCount).toBe(1);
  });

  it("keeps remote images without file data and links them only where nothing is linked yet", async () => {
    const remote = (id: string, name: string) => ({ id, name, fileName: `${id}.gif`, type: "image/gif", size: 0, remoteUrl: `https://static.exercisedb.dev/media/${id}.gif` });
    await importExerciseImages([image("own", "barbell bench press", 5)], db);
    await applySuggestedExerciseImageLinks({ chest_press__barbell: "own" }, db);
    await linkExerciseImage("plank__bodyweight", undefined, db);
    await importRemoteExerciseImages([remote("r1", "barbell bench press"), remote("r2", "barbell full squat"), remote("r3", "plank")], db);
    expect(await applyExerciseImageLinksWhereMissing({ chest_press__barbell: "r1", squat__barbell: "r2", plank__bodyweight: "r3", lunge__dumbbell: "nope" }, db)).toBe(1);
    expect((await getExerciseImage("chest_press__barbell", db))?.id).toBe("own");
    const squat = await getExerciseImage("squat__barbell", db);
    expect(squat?.remoteUrl).toBe("https://static.exercisedb.dev/media/r2.gif");
    expect(squat?.blob).toBeUndefined();
    expect(await getExerciseImage("plank__bodyweight", db)).toBeUndefined();
    expect(await listLinkedRemoteExerciseImageUrls(db)).toEqual(["https://static.exercisedb.dev/media/r2.gif"]);
    expect(await exerciseImagePackSummary(db)).toEqual({ imageCount: 4, linkedCount: 2, bytes: 5, remoteCount: 3 });
  });

  it("removes every image and link from the device", async () => {
    await importExerciseImages([image("a", "barbell bench press")], db);
    await applySuggestedExerciseImageLinks({ chest_press__barbell: "a" }, db);
    await clearExerciseImagePack(db);
    expect(await exerciseImagePackSummary(db)).toEqual({ imageCount: 0, linkedCount: 0, bytes: 0, remoteCount: 0 });
    expect(await getExerciseImage("chest_press__barbell", db)).toBeUndefined();
  });
});
