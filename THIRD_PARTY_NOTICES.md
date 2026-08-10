# Third-party notices

Gym Local's own code and authored content are distributed under `LICENSE`. The following external services, data, and media remain subject to their own terms.

## USDA FoodData Central

The optional nutrition pack includes normalized records from Foundation Foods 04/2026, SR Legacy 04/2018, and FNDDS 2021–2023. The source manifest records retrieval dates and identifiers. USDA FoodData Central data are published as CC0/public-domain data.

- Source: https://fdc.nal.usda.gov/download-datasets/
- License: https://creativecommons.org/publicdomain/zero/1.0/

## Free Exercise DB

Selected remote reference images point to Free Exercise DB. The upstream project is released under the Unlicense. Gym Local does not copy those image files into its offline bundle.

- Source: https://github.com/yuhonas/free-exercise-db
- License: https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md

## YouTube instructional videos

The repository stores only direct video identifiers and review metadata. Playback is provided by YouTube's privacy-enhanced embed after user interaction. Gym Local does not redistribute, download, cache, or claim ownership of any creator's audiovisual work.

- Provider terms: https://developers.google.com/youtube/terms/developer-policies
- Per-video creator/title attribution: `content/exercise-video-guides.json`

## Open Food Facts

Barcode lookup calls the public Open Food Facts API at runtime. Open Food Facts records are not bundled in the SQLite nutrition pack; results retain their source URL and may be incomplete.

- API: https://openfoodfacts.github.io/openfoodfacts-server/api/
- Terms: https://world.openfoodfacts.org/terms-of-use

## SQLite WASM

`@sqlite.org/sqlite-wasm` is used under Apache-2.0 to query the optional pack in a web worker and store it in browser OPFS.

- Source: https://github.com/sqlite/sqlite-wasm
- Package license: Apache-2.0
