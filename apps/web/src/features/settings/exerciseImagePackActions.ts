import { EXERCISE_VARIANTS } from "@gym/catalog";
import { expandPackFiles, readExercisePack, suggestExerciseImageLinks } from "@gym/media/exercise-pack";
import { applySuggestedExerciseImageLinks, importExerciseImages, listExerciseImages } from "@gym/storage/exercise-images";

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
