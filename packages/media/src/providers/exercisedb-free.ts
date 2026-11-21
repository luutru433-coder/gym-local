import { z } from "zod";
import { exerciseSearchPhrases, suggestExerciseImageLinks, type PackVariant } from "../exercise-pack";

/**
 * Free ExerciseDB tier by AscendAPI: personal, non-commercial use with credit. Their caching policy forbids
 * storing what the API returns and media URLs rotate weekly, so every lookup is live and nothing is kept:
 * no cache, no database, no service-worker rule, no id or URL in the repository.
 */
export const ONLINE_GIF_CREDIT = { name: "ExerciseDB by AscendAPI", url: "https://ascendapi.com" } as const;

const SEARCH_URL = "https://oss.exercisedb.dev/api/v1/exercises/search";
const MEDIA_ORIGIN = "https://static.exercisedb.dev";

const searchSchema = z.object({
  data: z.array(z.object({ exerciseId: z.string(), name: z.string(), gifUrl: z.string() }))
});

export interface OnlineExerciseGif {
  name: string;
  gifUrl: string;
}

async function search(phrase: string, signal?: AbortSignal): Promise<{ id: string; name: string; gifUrl: string }[]> {
  const response = await fetch(`${SEARCH_URL}?search=${encodeURIComponent(phrase)}&threshold=0.3`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Online exercise images are unavailable");
  return searchSchema
    .parse(await response.json())
    .data.filter((item) => {
      try {
        return new URL(item.gifUrl).origin === MEDIA_ORIGIN;
      } catch {
        return false;
      }
    })
    .map((item) => ({ id: item.exerciseId, name: item.name, gifUrl: item.gifUrl }));
}

/**
 * Looks one catalog variant up live and returns the GIF whose name fits the movement and its equipment,
 * or nothing. At most two requests, one per likely name.
 */
export async function findOnlineExerciseGif(variant: PackVariant, signal?: AbortSignal): Promise<OnlineExerciseGif | undefined> {
  for (const phrase of exerciseSearchPhrases(variant).slice(0, 2)) {
    const results = await search(phrase, signal);
    const match = results.find((item) => item.id === suggestExerciseImageLinks(results, [variant])[variant.id]);
    if (match) return { name: match.name, gifUrl: match.gifUrl };
  }
  return undefined;
}
