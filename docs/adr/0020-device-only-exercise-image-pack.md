# ADR 0020: Device-only exercise image pack

## Status

Accepted. (0019 is taken by the technique figures proposed in a parallel change.)

## Context

The owner wants realistic anatomical exercise images of the kind sold by paid libraries. Those licences allow use inside an app but forbid redistributing the files. This repository and its GitHub Pages site are public, so licensed files can be neither committed nor deployed (ADR 0016 covers only media whose licence allows bundling).

## Decision

- The owner imports the image files he holds a licence for on his own device, from Settings. The app never downloads a pack, and no pack file is part of the repository, the build, the release assets or the deployed site.
- Imported images live in a separate IndexedDB database, `gym-local-exercise-images` (stores `images`, `blobs`, `links`), owned by `@gym/storage/exercise-images`. The personal database `gym-local` is not touched: no version bump, no migration.
- The images are licensed media, not user data: they are left out of backups and CSV export on purpose. After restoring a backup on another device the pack is imported again there.
- `@gym/media/exercise-pack` reads the selection without knowing any one vendor's layout: loose image files (GIF, WebP, PNG, APNG, JPEG, AVIF), an optional JSON file whose records carry a name and reference an image by id or file name, or a ZIP of both. The same file name in several folders (size variants) is one image and the largest file is kept.
- After an import the app suggests one image per catalog variant from the image names: the movement's usual phrase, the variant's equipment, and no word that marks a different exercise. Suggestions never replace a choice the owner made himself, including a removal.
- The exercise page shows the linked image above the bundled drawing and lets the owner choose, change or remove it per variant. Without a pack the page is unchanged.

## Consequences

- The pack exists only on the device it was imported on, and clearing the browser's site data removes it.
- A ZIP is unpacked in memory, so a very large pack should be imported as one size folder of loose files instead.
- Suggestions are name heuristics and can be wrong or missing; the per-exercise picker is the correction path. A pack with no readable names gets no suggestions, only the picker.
- The import was developed and tested with a pack built from the app's own bundled drawings. No vendor pack was available, so a real pack's file and data layout is unverified.
