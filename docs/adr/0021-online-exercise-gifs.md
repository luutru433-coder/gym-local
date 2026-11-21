# ADR 0021: Online-only exercise GIFs from the free ExerciseDB service

## Status

Accepted. (0019 is taken by the technique figures proposed in a parallel change.)

## Context

The owner wants realistic exercise GIFs. The free ExerciseDB service (AscendAPI) allows personal, non-commercial use with attribution, serves 180p GIFs, and is rate limited. AscendAPI's caching policy forbids storing anything the API returns unless the plan explicitly permits caching; persistent storage and bulk downloads need their written permission, and media addresses rotate. The free tier grants no caching right, so a download for offline use is not allowed.

## Decision

- The GIFs are shown live and only while the device is online. The feature is off by default and is switched on in Settings, because opening an exercise then sends its name to a third-party server.
- `@gym/media/online-gifs` (`packages/media/src/providers/exercisedb-free.ts`) is the only code that calls the service. It searches by the movement's usual phrase and the variant's equipment, reuses the image-pack name matching to pick a result, and accepts only GIF addresses on `static.exercisedb.dev`.
- Nothing returned by the service is stored: no IndexedDB or localStorage write, no backup field, `cache: "no-store"` on every lookup, and no service-worker runtime cache rule for its hosts. The result lives in component state and is dropped when the exercise changes, the device goes offline or the page closes. The only stored value is the on/off switch, a device preference outside backups.
- No file or data from the service is in the repository, the build, the release assets or the deployed site.
- The credit "ExerciseDB by AscendAPI", linked to ascendapi.com, is shown under every GIF and beside the switch.
- Offline, switched off, on any error, or when no result fits, nothing is shown and the bundled drawings (ADR 0016) remain the visual. An image from the owner's own pack (ADR 0020) takes priority for that exercise.

## Consequences

- The GIFs are never available offline. Changing that requires AscendAPI's explicit permission or a plan that allows caching, and a new ADR.
- The service's documentation describes the free endpoints as meant for exploration, with strict rate limits and no stability promise; lookups can fail or the service can change, in which case the page falls back to the drawings.
- The browser's own HTTP cache may hold a GIF for as long as the server's response headers allow; the app does not control or extend that.
- Matching is a name heuristic and can pick a wrong or no GIF; there is no per-exercise correction, since a chosen result may not be stored.
- Custom exercises get no online GIF.
