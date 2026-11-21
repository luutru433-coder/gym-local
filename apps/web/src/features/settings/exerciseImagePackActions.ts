import { EXERCISE_VARIANTS } from "@gym/catalog";
import { expandPackFiles, readExercisePack, suggestExerciseImageLinks } from "@gym/media/exercise-pack";
import { listExerciseDbImages, storeExerciseDbGifs } from "@gym/media/online-gifs";
import { applyExerciseImageLinksWhereMissing, applySuggestedExerciseImageLinks, importExerciseImages, importRemoteExerciseImages, listExerciseImages, listLinkedRemoteExerciseImageUrls } from "@gym/storage/exercise-images";

export interface ExerciseImagePackImport {
  imported: number;
  ignored: number;
  suggested: number;
}

const BATCH = 50;

/**
 * Reads the files the owner picked (loose images, their JSON data, or a ZIP of both), stores the images on
 * this device and suggests an image for each catalog exercise that has no choice of his own yet.
 */
export async function importExerciseImagePack(files: File[], onProgress?: (stored: number, total: number) => void): Promise<ExerciseImagePackImport> {
  const expanded = await expandPackFiles(files.map((file) => ({ name: file.webkitRelativePath || file.name, blob: file })));
  const { images, ignored } = await readExercisePack(expanded);
  for (let start = 0; start < images.length; start += BATCH) {
    await importExerciseImages(images.slice(start, start + BATCH));
    onProgress?.(Math.min(start + BATCH, images.length), images.length);
  }
  const suggestions = suggestExerciseImageLinks(
    await listExerciseImages(),
    EXERCISE_VARIANTS.map((variant) => ({ id: variant.id, movementId: variant.movementId, equipment: variant.equipment }))
  );
  return { imported: images.length, ignored, suggested: await applySuggestedExerciseImageLinks(suggestions) };
}

export interface ExerciseDbDownload {
  listed: number;
  suggested: number;
  stored: number;
  failed: number;
}

/**
 * Downloads the free ExerciseDB image list, links a GIF to each catalog exercise that has no image yet and
 * saves those GIFs on this device. The device fetches from the service itself; nothing is bundled with the app.
 */
export async function downloadExerciseDbImages(onProgress?: (step: "list" | "gifs", done: number, total: number) => void, signal?: AbortSignal): Promise<ExerciseDbDownload> {
  const listed = await listExerciseDbImages((done, total) => onProgress?.("list", done, total), signal);
  const images = listed.map((item) => ({ id: `exercisedb:${item.id}`, name: item.name, fileName: `${item.id}.gif`, type: "image/gif", size: 0, remoteUrl: item.gifUrl }));
  await importRemoteExerciseImages(images);
  const suggestions = suggestExerciseImageLinks(images, EXERCISE_VARIANTS.map((variant) => ({ id: variant.id, movementId: variant.movementId, equipment: variant.equipment })));
  const suggested = await applyExerciseImageLinksWhereMissing(suggestions);
  const saved = await storeExerciseDbGifs(await listLinkedRemoteExerciseImageUrls(), (done, total) => onProgress?.("gifs", done, total), signal);
  return { listed: images.length, suggested, ...saved };
}
