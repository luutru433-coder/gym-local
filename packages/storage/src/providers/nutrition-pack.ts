export async function fetchNutritionPackManifest(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load the nutrition pack manifest");
  return response.json();
}

export async function downloadNutritionPack(url: string): Promise<Response> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`Could not download the nutrition pack (${response.status})`);
  return response;
}

export function obsoletePackFileAfterActivation(
  oldPreviousFileName: string | undefined,
  nextActiveFileName: string,
  nextPreviousFileName: string | undefined
): string | undefined {
  if (!oldPreviousFileName) return undefined;
  if (oldPreviousFileName === nextActiveFileName || oldPreviousFileName === nextPreviousFileName) return undefined;
  return oldPreviousFileName;
}

export async function commitStagedNutritionPack<TPrepared, TResult>(operations: {
  prepare: () => Promise<TPrepared>;
  activate: (prepared: TPrepared) => Promise<TResult>;
  discardStaged: () => void | Promise<void>;
}): Promise<TResult> {
  try {
    const prepared = await operations.prepare();
    return await operations.activate(prepared);
  } catch (error) {
    try {
      await operations.discardStaged();
    } catch {
      // Preserve the original install failure; staging cleanup is best effort.
    }
    throw error;
  }
}
