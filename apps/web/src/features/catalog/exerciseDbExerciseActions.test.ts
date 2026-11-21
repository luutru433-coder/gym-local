// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearExerciseImagePack, getExerciseImage, importRemoteExerciseImages, linkExerciseImage } from "@gym/storage/exercise-images";
import { useGymStore } from "../../store/useGymStore";
import { addExerciseDbExercises, listAddableExerciseDbExercises } from "./exerciseDbExerciseActions";

const saved = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("@gym/media/online-gifs", () => ({
  storeExerciseDbGifs: async (urls: string[]) => { saved.urls = urls; return { stored: urls.length, failed: 0 }; }
}));
vi.mock("@gym/storage/custom-exercises", () => ({ saveCustomExercise: async () => undefined, deleteCustomExercise: async () => false }));

const remote = (id: string, name: string, withDetails = true) => ({
  id, name, fileName: `${id}.gif`, type: "image/gif", size: 0, remoteUrl: `https://static.exercisedb.dev/media/${id}.gif`,
  ...(withDetails ? { details: { bodyParts: ["upper arms"], equipments: ["dumbbell"], targetMuscles: ["biceps"], secondaryMuscles: ["forearms"], instructions: ["Step:1 Curl."] } } : {})
});

describe("adding downloaded ExerciseDB exercises", () => {
  beforeEach(async () => {
    await clearExerciseImagePack();
    saved.urls = [];
    useGymStore.setState({ customMovements: [], customVariants: [], sessions: [], routines: [] });
  });

  it("offers only exercises the app does not show yet, and adds one with its image and steps", async () => {
    await importRemoteExerciseImages([remote("a", "barbell bench press"), remote("b", "dumbbell zottman curl"), remote("c", "old download", false)]);
    await linkExerciseImage("chest_press__barbell", "a");
    const addable = await listAddableExerciseDbExercises();
    expect(addable.map((item) => item.id)).toEqual(["b"]);

    const progress: string[] = [];
    expect(await addExerciseDbExercises(addable, (done, total) => progress.push(`${done}/${total}`))).toEqual({ added: 1, skipped: 0 });
    expect(progress).toEqual(["1/1"]);
    const { customMovements, customVariants } = useGymStore.getState();
    expect(customMovements[0].name.en).toBe("Dumbbell Zottman Curl");
    expect(customMovements[0].primaryMuscles).toEqual(["biceps"]);
    expect(customVariants[0].equipment).toEqual(["dumbbell"]);
    expect(customVariants[0].instructions).toEqual([{ vi: "Curl.", en: "Curl." }]);
    expect((await getExerciseImage(customVariants[0].id))?.id).toBe("b");
    expect(saved.urls).toEqual(["https://static.exercisedb.dev/media/b.gif"]);
    // Added once: it is no longer offered, and a second try does not create a duplicate.
    expect(await listAddableExerciseDbExercises()).toEqual([]);
    expect(await addExerciseDbExercises(addable)).toEqual({ added: 0, skipped: 1 });
    expect(useGymStore.getState().customMovements).toHaveLength(1);
    // Deleted again: its leftover image link no longer hides it from the list.
    useGymStore.setState({ customMovements: [], customVariants: [] });
    expect((await listAddableExerciseDbExercises()).map((item) => item.id)).toEqual(["b"]);
  });
});
