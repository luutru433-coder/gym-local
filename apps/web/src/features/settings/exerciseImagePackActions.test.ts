// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearExerciseImagePack, exerciseImagePackSummary, getExerciseImage, linkExerciseImage } from "@gym/storage/exercise-images";
import { importExerciseImagePack } from "./exerciseImagePackActions";

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
    expect((await getExerciseImage("squat__barbell"))?.blob.size).toBe(20);
    expect(await getExerciseImage("chest_press__dumbbell")).toBeUndefined();
    expect(await exerciseImagePackSummary()).toEqual({ imageCount: 3, linkedCount: 2, bytes: 60 });
  });

  it("keeps an image the owner chose himself when the pack is imported again", async () => {
    await importExerciseImagePack(pack());
    await linkExerciseImage("chest_press__barbell", "9999");
    const again = await importExerciseImagePack(pack());
    expect(again.suggested).toBe(1);
    expect((await getExerciseImage("chest_press__barbell"))?.id).toBe("9999");
  });

  it("reports a selection without images instead of storing anything", async () => {
    expect(await importExerciseImagePack([new File(["x"], "notes.txt")])).toEqual({ imported: 0, ignored: 1, suggested: 0 });
    expect((await exerciseImagePackSummary()).imageCount).toBe(0);
  });
});
