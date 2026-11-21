# Third-party notices

Gym Local's own code and authored content are distributed under `LICENSE`. The following external services, data, and media remain subject to their own terms.

## USDA FoodData Central

The optional nutrition pack includes normalized records from Foundation Foods 04/2026, SR Legacy 04/2018, and FNDDS 2021–2023. The source manifest records retrieval dates and identifiers. USDA FoodData Central data are published as CC0/public-domain data.

- Source: https://fdc.nal.usda.gov/download-datasets/
- License: https://creativecommons.org/publicdomain/zero/1.0/

## YouTube instructional videos

The repository stores only direct video identifiers and review metadata. Playback is provided by YouTube's privacy-enhanced embed after user interaction. Gym Local does not redistribute, download, cache, or claim ownership of any creator's audiovisual work.

- Provider terms: https://developers.google.com/youtube/terms/developer-policies
- Per-video creator/title attribution: `content/exercise-video-guides.json`

## Workout Guide exercise artwork

The three-frame exercise drawings in `public/exercise-animations/` are copied unmodified from Workout Guide and are licensed under CC BY-SA 4.0. Copyright (c) 2026 Bryl Lim; 76 first-pose frames upstream are vector-traced adaptations of Everkinetic artwork (CC BY-SA 4.0). The app plays the frames in sequence and shows this credit under every animation.

- Source: https://github.com/bryllim/workout-guide (commit pinned in `content/exercise-animations.json`)
- Upstream attribution: https://github.com/bryllim/workout-guide/blob/main/ATTRIBUTION.md
- Everkinetic: https://github.com/everkinetic/data
- License: https://creativecommons.org/licenses/by-sa/4.0/

## React Muscle Map body artwork

The front and back body outlines in `apps/web/src/components/BodyArtwork.tsx` are ported from React Muscle Map, released into the public domain under the Unlicense.

- Source: https://github.com/Josep1992/react-muscle-map

## Open Food Facts

Barcode lookup calls the public Open Food Facts API at runtime. Open Food Facts records are not bundled in the SQLite nutrition pack; results retain their source URL and may be incomplete.

- API: https://openfoodfacts.github.io/openfoodfacts-server/api/
- Terms: https://world.openfoodfacts.org/terms-of-use

## SQLite WASM

`@sqlite.org/sqlite-wasm` is used under Apache-2.0 to query the optional pack in a web worker and store it in browser OPFS.

- Source: https://github.com/sqlite/sqlite-wasm
- Package license: Apache-2.0
