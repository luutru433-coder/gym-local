# Content rules

- IDs are immutable and unique across all releases.
- Every item needs Vietnamese and English names, source/license metadata, and review status.
- Never add scraped or ownership-unclear media.
- Deprecated items remain resolvable and point to `supersededBy` when applicable.
- Run `pnpm content:validate` for every content change.
