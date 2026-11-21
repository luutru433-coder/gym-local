# ADR 0021: Free ExerciseDB images downloaded onto the device

## Status

Accepted. (0019 is taken by the technique figures; 0020 is used twice, by the image pack and the set timer.)

## Context

The owner wants realistic exercise GIFs available offline. The free ExerciseDB service (AscendAPI) allows personal, non-commercial use with attribution, and its published caching policy forbids storing returned data without explicit permission. The owner holds that permission: an email from AscendAPI (hello@ascendapi.com, "Permission to Use Images from AscendAPI.com") allows him to download and use the images for his project, on the condition that the app carries a credit to AscendAPI.com; one mention anywhere in the app is enough. The permission is his and says nothing about redistribution, and this repository and its Pages site are public.

Two facts about the service shape the design:

- Its search endpoint fails under light use (429 and 503 after about fifteen requests in testing), so looking a GIF up live per exercise is unreliable. The plain list endpoint is steadier.
- The image host sends no cross-origin headers, so a web page can display a GIF but cannot read its bytes. The files therefore cannot be copied into IndexedDB.

## Decision

- Settings → Exercise images has "Download free ExerciseDB images". The device itself fetches from the service; no ExerciseDB file or data is in the repository, the build, the release assets or the deployed site.
- `@gym/media/online-gifs` (`packages/media/src/providers/exercisedb-free.ts`) is the only code that calls the service. It reads the list page by page (25 per page, waiting and retrying on 429/502/503), accepts only GIF addresses on `static.exercisedb.dev`, and saves GIFs with `fetch(…, { mode: "no-cors" })` into the Cache Storage cache `exercisedb-gifs`. The service worker serves that host cache-first from the same cache, so the saved GIFs show offline.
- The list (id, name, GIF address) is stored as image records with a `remoteUrl` and no blob in the existing `gym-local-exercise-images` database (ADR 0020). `remoteUrl` is an unindexed optional field: no version bump. The personal database and backups are untouched.
- The service worker only reads that cache. The app writes it, and keeps a GIF only after the browser has drawn it, so error answers and picker previews are never kept.
- Only GIFs linked to an exercise are saved, not all 1,500: the app can show an image only on its own catalog exercises, and browsers charge each cross-origin cached file several megabytes of padding against the storage quota. A linked GIF that is not saved yet is saved when its exercise page is opened online, which covers a newly picked image.
- Links are suggested with the image-pack name matching, and only for exercises that have no image and no choice of the owner's yet. His own imported pack and his manual choices, including removals, win.
- The credit "AscendAPI.com", linked, is shown in the Settings card and under every ExerciseDB GIF.
- "Remove pack" deletes the list, the links and the saved GIFs.

## Consequences

- The saved GIFs live in browser cache storage, which the browser may evict under storage pressure and which is cleared with the site data. A GIF that is missing offline shows a short note instead; opening the exercise online loads and saves it again.
- Offline use depends on the service worker controlling the page, which is the case for the installed app after its first load.
- The quota padding on cross-origin cached files is browser-specific and was not measured on iOS Safari.
- Matching is a name heuristic and can pick a wrong or no GIF; the per-exercise picker is the correction path. Custom exercises get an image only through the picker.
- The free service gives no stability promise; a failed download can be repeated and continues where files are missing.
- If the permission is withdrawn, "Remove pack" clears everything from the device and the download button is removed in a follow-up.
