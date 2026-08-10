# Content policy

Core guidance must be bilingual, source-traceable, and reviewed at the movement and equipment-variant levels. Exercise records use immutable IDs and explicit status values: `draft`, `reviewed`, or `deprecated`.

Project-authored guidance points to this policy through `sourcePath`; external material uses an HTTPS `sourceUrl` plus creator, license/terms, attribution, and review date. Placeholder URLs and search-result URLs are rejected.

## Exercise media

- Every reviewed equipment variant must have exactly one direct instructional guide in `content/exercise-video-guides.json`.
- A guide records immutable variant ID, direct YouTube video ID, title, creator, duration, review method, and review date.
- The review gate checks that title/creator metadata corresponds to the exercise and equipment variant. It is a content review, not a medical endorsement.
- Videos are embedded only after a click through `youtube-nocookie.com`; autoplay, download, offline caching, and YouTube search pages are prohibited.
- Missing, blocked, or removed videos fall back to project-authored setup, execution, breathing, and safety cues plus a direct source link.
- Reference images come from the public-domain Free Exercise DB under the Unlicense and remain remote/online-only.

Every new media host must be added to the allowlist in `packages/media`, carry a source record, and add an allowlist test. Automated checks validate direct-video coverage, unique variant IDs, creator metadata, URLs, translations, equipment references, sources, licenses/terms, review dates, and routine-template references.

## Nutrition content

- The offline pack contains only sources declared in `public/nutrition-pack-manifest.json`; byte size and SHA-256 are release gates.
- USDA Foundation, SR Legacy, and FNDDS records are normalized without converting missing micronutrients to zero.
- Vietnamese dish values are labeled as estimates and retain traceable ingredient/source identifiers.
- Vietnamese aliases and accentless aliases are search terms, not duplicate nutrient records.
- Online Open Food Facts results retain their source URL and quality status.

Link availability is reported separately because remote creators/providers can remove content after a release. Any correction keeps historical workout and meal snapshots unchanged.
