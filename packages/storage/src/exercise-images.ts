import Dexie, { type EntityTable } from "dexie";

/** An image the owner imported from a pack he holds a licence for. Lives on this device only. */
export interface ExerciseImage {
  id: string;
  name: string;
  fileName: string;
  type: string;
  size: number;
  /** Set for an image whose file is kept by the browser cache under this address instead of in `blobs`. */
  remoteUrl?: string;
}

export interface ExerciseImageInput extends ExerciseImage {
  blob: Blob;
}

/** `imageId` undefined means the owner removed the image from this variant; a suggestion must not put one back. */
export interface ExerciseImageLink {
  variantId: string;
  imageId?: string;
  manual: boolean;
}

export interface ExerciseImagePackSummary {
  imageCount: number;
  linkedCount: number;
  bytes: number;
  remoteCount: number;
}

/**
 * Separate from the personal database on purpose: imported pack images are licensed media, not user data,
 * so they stay out of backups and need no migration of `gym-local`.
 */
export class ExerciseImageDatabase extends Dexie {
  images!: EntityTable<ExerciseImage, "id">;
  blobs!: EntityTable<{ id: string; blob: Blob }, "id">;
  links!: EntityTable<ExerciseImageLink, "variantId">;

  constructor(name = "gym-local-exercise-images") {
    super(name);
    this.version(1).stores({ images: "id, name", blobs: "id", links: "variantId, imageId" });
  }
}

export const exerciseImageDb = new ExerciseImageDatabase();

/** Adds or replaces images by id. Existing links to a replaced id keep pointing at the new file. */
export async function importExerciseImages(inputs: ExerciseImageInput[], db: ExerciseImageDatabase = exerciseImageDb): Promise<number> {
  await db.transaction("rw", db.images, db.blobs, async () => {
    await db.images.bulkPut(inputs.map(({ id, name, fileName, type, size }) => ({ id, name, fileName, type, size })));
    await db.blobs.bulkPut(inputs.map(({ id, blob }) => ({ id, blob })));
  });
  return inputs.length;
}

/** Adds or replaces images that have no stored file of their own, only a `remoteUrl`. */
export async function importRemoteExerciseImages(images: (ExerciseImage & { remoteUrl: string })[], db: ExerciseImageDatabase = exerciseImageDb): Promise<number> {
  await db.images.bulkPut(images);
  return images.length;
}

/** Suggested links for variants that have no link of any kind yet, so nothing already chosen or imported is replaced. */
export async function applyExerciseImageLinksWhereMissing(suggestions: Record<string, string>, db: ExerciseImageDatabase = exerciseImageDb): Promise<number> {
  return db.transaction("rw", db.links, db.images, async () => {
    const images = new Map((await db.images.toArray()).map((image) => [image.id, image]));
    const taken = new Set((await db.links.toArray()).filter((link) => link.manual || (link.imageId && images.has(link.imageId))).map((link) => link.variantId));
    const links = Object.entries(suggestions)
      .filter(([variantId, imageId]) => !taken.has(variantId) && images.has(imageId))
      .map(([variantId, imageId]) => ({ variantId, imageId, manual: false }));
    await db.links.bulkPut(links);
    return links.length;
  });
}

/** Addresses of the remote images that an exercise is linked to. */
export async function listLinkedRemoteExerciseImageUrls(db: ExerciseImageDatabase = exerciseImageDb): Promise<string[]> {
  const [images, links] = await Promise.all([db.images.toArray(), db.links.toArray()]);
  const remote = new Map(images.flatMap((image) => (image.remoteUrl ? [[image.id, image.remoteUrl] as const] : [])));
  return [...new Set(links.flatMap((link) => (link.imageId && remote.has(link.imageId) ? [remote.get(link.imageId)!] : [])))];
}

export async function listExerciseImages(db: ExerciseImageDatabase = exerciseImageDb): Promise<ExerciseImage[]> {
  return db.images.orderBy("name").toArray();
}

export async function listExerciseImageLinks(db: ExerciseImageDatabase = exerciseImageDb): Promise<ExerciseImageLink[]> {
  return db.links.toArray();
}

/** Stores suggested links, never replacing a choice the owner made himself. Resolves to the number stored. */
export async function applySuggestedExerciseImageLinks(suggestions: Record<string, string>, db: ExerciseImageDatabase = exerciseImageDb): Promise<number> {
  return db.transaction("rw", db.links, db.images, async () => {
    const manual = new Set((await db.links.filter((link) => link.manual).toArray()).map((link) => link.variantId));
    const known = new Set((await db.images.toCollection().primaryKeys()) as string[]);
    const links = Object.entries(suggestions)
      .filter(([variantId, imageId]) => !manual.has(variantId) && known.has(imageId))
      .map(([variantId, imageId]) => ({ variantId, imageId, manual: false }));
    await db.links.bulkPut(links);
    return links.length;
  });
}

/** The owner's own choice for one variant; `undefined` removes the image from it. */
export async function linkExerciseImage(variantId: string, imageId: string | undefined, db: ExerciseImageDatabase = exerciseImageDb): Promise<void> {
  if (imageId !== undefined && !(await db.images.get(imageId))) throw new Error("Exercise image not found");
  await db.links.put({ variantId, manual: true, ...(imageId === undefined ? {} : { imageId }) });
}

export async function getExerciseImage(variantId: string, db: ExerciseImageDatabase = exerciseImageDb): Promise<(ExerciseImage & { blob?: Blob }) | undefined> {
  const link = await db.links.get(variantId);
  if (!link?.imageId) return undefined;
  const [image, stored] = await Promise.all([db.images.get(link.imageId), db.blobs.get(link.imageId)]);
  if (!image) return undefined;
  if (stored) return { ...image, blob: stored.blob };
  return image.remoteUrl ? image : undefined;
}

export async function getExerciseImageBlob(imageId: string, db: ExerciseImageDatabase = exerciseImageDb): Promise<Blob | undefined> {
  return (await db.blobs.get(imageId))?.blob;
}

export async function exerciseImagePackSummary(db: ExerciseImageDatabase = exerciseImageDb): Promise<ExerciseImagePackSummary> {
  const [images, links] = await Promise.all([db.images.toArray(), db.links.toArray()]);
  const known = new Set(images.map((image) => image.id));
  return {
    imageCount: images.length,
    linkedCount: links.filter((link) => link.imageId && known.has(link.imageId)).length,
    bytes: images.reduce((total, image) => total + image.size, 0),
    remoteCount: images.filter((image) => image.remoteUrl).length
  };
}

/** Removes every imported image and every link from this device. */
export async function clearExerciseImagePack(db: ExerciseImageDatabase = exerciseImageDb): Promise<void> {
  await db.transaction("rw", db.images, db.blobs, db.links, async () => {
    await Promise.all([db.images.clear(), db.blobs.clear(), db.links.clear()]);
  });
}
