// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { expandPackFiles, readExercisePack, suggestExerciseImageLinks, type PackFile } from "./exercise-pack";

const file = (name: string, bytes = 4, type = ""): PackFile => ({ name, blob: new Blob([new Uint8Array(bytes)], { type }) });
const data = (name: string, value: unknown): PackFile => ({ name, blob: new Blob([JSON.stringify(value)], { type: "application/json" }) });

describe("exercise image pack reading", () => {
  it("keeps one image per file name, the largest of its size variants, and ignores other files", async () => {
    const { images, ignored } = await readExercisePack([
      file("gifs/180/0025.gif", 10),
      file("gifs/720/0025.gif", 90),
      file("gifs/360/0025.gif", 40),
      file("barbell_full-squat.webp", 7),
      file("__MACOSX/gifs/._0025.gif", 3),
      file("readme.txt", 5)
    ]);
    expect(images.map((image) => [image.id, image.name, image.size, image.type])).toEqual([
      ["0025", "0025", 90, "image/gif"],
      ["barbell_full-squat", "barbell full squat", 7, "image/webp"]
    ]);
    expect(ignored).toBe(1);
  });

  it("names images from the pack's data by id or by file reference, wherever the list sits", async () => {
    const { images } = await readExercisePack([
      file("0025.gif"),
      file("abc.gif"),
      file("zzz.gif"),
      data("exercises.json", { exercises: [{ id: "0025", name: "Barbell Bench Press" }, { exerciseId: 7, name: "Cable Pulldown", gif360: "media/360/ABC.gif?v=2" }] }),
      file("0100.gif"),
      data("named-wrapper.json", { name: "My pack", version: 2, exercises: [{ id: "0100", name: "Barbell Deadlift" }] }),
      data("broken.json", "not a list")
    ]);
    expect(Object.fromEntries(images.map((image) => [image.id, image.name]))).toEqual({ "0025": "barbell bench press", "0100": "barbell deadlift", abc: "cable pulldown", zzz: "zzz" });
  });

  it("reads images and data out of a ZIP and leaves loose files alone", async () => {
    const zip = new JSZip();
    zip.file("pack/360/0001.gif", new Uint8Array(12));
    zip.file("pack/exercises.json", JSON.stringify([{ id: "0001", name: "air bike" }]));
    zip.file("pack/license.pdf", new Uint8Array(3));
    zip.file("__MACOSX/pack/360/._0001.gif", new Uint8Array(2));
    const expanded = await expandPackFiles([{ name: "pack.zip", blob: new Blob([await zip.generateAsync({ type: "arraybuffer" })]) }, file("loose.png", 2)]);
    expect(expanded.map((item) => item.name).sort()).toEqual(["loose.png", "pack/360/0001.gif", "pack/exercises.json"]);
    const { images } = await readExercisePack(expanded);
    expect(images.map((image) => [image.id, image.name, image.size])).toEqual([["0001", "air bike", 12], ["loose", "loose", 2]]);
  });
});

describe("exercise image suggestions", () => {
  const images = [
    "barbell bench press",
    "barbell incline bench press",
    "barbell close-grip bench press",
    "dumbbell bench press",
    "smith bench press",
    "lever chest press",
    "barbell full squat",
    "barbell front squat",
    "squat",
    "weighted squat",
    "barbell deadlift",
    "barbell romanian deadlift",
    "cable pulldown",
    "cable one arm pulldown",
    "pull-up",
    "wide grip pull-up",
    "dumbbell hammer curl",
    "dumbbell biceps curl",
    "dumbbell alternate biceps curl",
    "cable pushdown",
    "push-up",
    "dumbbell one arm bent-over row",
    "barbell bent over row",
    "band squat",
    "dumbbell kickback"
  ].map((name, index) => ({ id: `img${index}`, name }));
  const byName = (name: string) => images.find((image) => image.name === name)?.id;
  const variant = (movementId: string, equipment: string) => ({ id: `${movementId}__${equipment}`, movementId, equipment: [equipment] });
  const suggest = (movementId: string, equipment: string) => suggestExerciseImageLinks(images, [variant(movementId, equipment)])[`${movementId}__${equipment}`];

  it("matches a movement only with its own equipment", () => {
    expect(suggest("chest_press", "barbell")).toBe(byName("barbell bench press"));
    expect(suggest("chest_press", "dumbbell")).toBe(byName("dumbbell bench press"));
    expect(suggest("chest_press", "smith")).toBe(byName("smith bench press"));
    expect(suggest("chest_press", "machine")).toBe(byName("lever chest press"));
    expect(suggest("chest_press", "cable")).toBeUndefined();
    expect(suggest("squat", "bodyweight")).toBe(byName("squat"));
    expect(suggest("squat", "resistance_band")).toBe(byName("band squat"));
  });

  it("does not hand a different exercise that shares the phrase", () => {
    expect(suggest("incline_chest_press", "barbell")).toBe(byName("barbell incline bench press"));
    expect(suggest("triceps_press", "barbell")).toBe(byName("barbell close-grip bench press"));
    expect(suggest("squat", "barbell")).toBe(byName("barbell full squat"));
    expect(suggest("deadlift", "barbell")).toBe(byName("barbell deadlift"));
    expect(suggest("romanian_deadlift", "barbell")).toBe(byName("barbell romanian deadlift"));
    expect(suggest("lat_pulldown", "cable")).toBe(byName("cable pulldown"));
    expect(suggest("pull_up", "bodyweight")).toBe(byName("pull-up"));
    expect(suggest("biceps_curl", "dumbbell")).toBe(byName("dumbbell biceps curl"));
    expect(suggest("hammer_curl", "dumbbell")).toBe(byName("dumbbell hammer curl"));
    expect(suggest("horizontal_row", "barbell")).toBe(byName("barbell bent over row"));
    expect(suggest("one_arm_row", "dumbbell")).toBe(byName("dumbbell one arm bent-over row"));
    expect(suggest("horizontal_row", "dumbbell")).toBeUndefined();
    expect(suggest("triceps_kickback", "dumbbell")).toBe(byName("dumbbell kickback"));
  });

  it("suggests nothing for a movement it has no naming for, or from names that are only ids", () => {
    expect(suggestExerciseImageLinks(images, [variant("custom-1", "barbell")])).toEqual({});
    expect(suggestExerciseImageLinks([{ id: "0025", name: "0025" }], [variant("chest_press", "barbell")])).toEqual({});
  });
});
