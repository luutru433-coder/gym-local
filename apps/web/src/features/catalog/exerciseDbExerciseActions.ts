import { storeExerciseDbGifs } from "@gym/media/online-gifs";
import { linkExerciseImage, listExerciseImageLinks, listExerciseImages, type ExerciseImage, type ExerciseImageDetails } from "@gym/storage/exercise-images";
import { useGymStore } from "../../store/useGymStore";
import { saveUserCustomExercise } from "./customExerciseActions";
import { customInputFromExternal } from "./exerciseDbExercise";

export type AddableExercise = ExerciseImage & { details: ExerciseImageDetails };

const key = (name: string) => name.trim().toLocaleLowerCase().replace(/\s+/g, " ");

/** Downloaded ExerciseDB exercises that no exercise in the app shows yet and that the owner has not added. */
export async function listAddableExerciseDbExercises(): Promise<AddableExercise[]> {
  const [images, links] = await Promise.all([listExerciseImages(), listExerciseImageLinks()]);
  const shown = new Set(links.map((link) => link.imageId));
  const state = useGymStore.getState();
  const own = new Set(state.customMovements.filter((movement) => movement.reviewStatus !== "deprecated").map((movement) => key(movement.name.vi)));
  return images.filter((image): image is AddableExercise => Boolean(image.details && image.remoteUrl) && !shown.has(image.id) && !own.has(key(image.name)));
}

/**
 * Adds downloaded exercises to the owner's own exercise list, each with its image, so routines can use them.
 * They are saved like exercises he creates himself: in his personal data, never in the app's bundled catalog.
 */
export async function addExerciseDbExercises(exercises: AddableExercise[], onProgress?: (done: number, total: number) => void): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  const urls: string[] = [];
  for (const exercise of exercises) {
    try {
      const movement = await saveUserCustomExercise(customInputFromExternal(exercise.name, exercise.details));
      const variant = useGymStore.getState().customVariants.find((item) => item.movementId === movement.id);
      if (variant) await linkExerciseImage(variant.id, exercise.id);
      if (exercise.remoteUrl) urls.push(exercise.remoteUrl);
      added++;
    } catch {
      skipped++;
    }
    onProgress?.(added + skipped, exercises.length);
  }
  // Best effort: an image that cannot be saved now is saved when the exercise is opened online.
  await storeExerciseDbGifs(urls).catch(() => undefined);
  const en = useGymStore.getState().profile?.locale === "en";
  useGymStore.setState({ notice: en ? `Added ${added} exercise${added === 1 ? "" : "s"} to your list.` : `Đã thêm ${added} bài tập vào danh sách của bạn.` });
  return { added, skipped };
}
