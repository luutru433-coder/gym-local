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

export function nutritionPackTransferSizeMatches(response: Pick<Response, "headers">, expectedBytes: number): boolean {
  const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  // Fetch exposes the compressed transfer length while streaming the decoded
  // response body. The decoded byte count and SHA-256 are verified after the
  // stream completes, so a compressed response cannot be checked up front.
  if (contentEncoding && contentEncoding !== "identity") return true;

  const contentLength = response.headers.get("content-length");
  if (!contentLength) return true;
  const declaredBytes = Number(contentLength);
  return Number.isInteger(declaredBytes) && declaredBytes === expectedBytes;
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
