# ADR 0016: Bundled offline exercise animations

## Status

Accepted.

## Context

Exercise demonstrations were YouTube links only, and 14 of 199 variants had one hot-linked reference image. Nothing visual worked offline, and earlier policy kept all rich media online-only. The owner uses the app locally on a personal phone, non-commercially, asked for a drawn animation with highlighted muscles for every exercise, and set no storage limit.

## Decision

- Lift the "rich media is online-only" rule for licensed exercise drawings. Video remains online-only and is never downloaded or cached.
- Bundle three SVG frames per reviewed variant from Workout Guide (CC BY-SA 4.0), unmodified and pinned to an upstream commit in `content/exercise-animations.json`. The app plays them as a start-to-end-to-start loop, with a pause control and no autoplay under reduced-motion settings.
- Variants with no upstream drawing for their exact equipment reuse the closest drawing, are marked `closest`, and show the name of the exercise drawn.
- Remove the 14 hot-linked Free Exercise DB reference photos: they needed the network and were real-person photos, which the owner turned down. No exercise image is fetched remotely any more.
- All drawings were reviewed by eye against the variants that use them. Upstream frames with a broken trace are skipped via `frameOverrides` (currently `pallof-press` frame 2).
- Show primary and secondary muscles on a bundled front/back body diagram (React Muscle Map, Unlicense).
- Frames live in `public/exercise-animations/` and are precached by the service worker under a separate 16 MiB budget; the 3.5 MiB app-shell budget is unchanged.
- `ExerciseAnimation` is a new catalog-side contract looked up by variant ID. `ExerciseVariant` and all stored or backed-up records are unchanged, so no migration is needed. Custom exercises show the muscle diagram only.

## Consequences

- First install downloads about 11 MB more.
- CC BY-SA attribution is shown under each animation and recorded in `THIRD_PARTY_NOTICES.md`. Edited frames would have to be shared under the same license.
- The catalog and media tests in `pnpm run verify` fail when a reviewed variant has no animation, a frame file is missing, or a frame points at a remote URL.
