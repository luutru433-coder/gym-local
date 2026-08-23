# ADR 0016: Licensed offline exercise animation packs

## Status

Accepted for FOUNDATION-01 design; runtime implementation is deferred to later coordinate packets.

## Context

Gym Local currently treats rich media as online-only. Reviewed exercise variants have bilingual offline text and one optional direct YouTube guide, while remote images and video are never cached. The new product direction requires installed exercise animations to remain available offline without accounts or operating cost.

Treating every rich-media type identically creates a conflict: external video must remain on its provider and cannot be redistributed, while a project-authored or explicitly redistributable animation pack can be downloaded, integrity-checked, installed, and used locally. The system also has 199 reviewed equipment variants whose histories and PRs must remain isolated. Producing all animations before proving the format, player, storage, licensing, accessibility, and iPhone performance would create unacceptable rework and licensing risk.

## Decision

### Media boundary

Replace the broad invariant with:

> Text, workout data, and installed animation packs must work offline; external video is an optional online source.

External video and thumbnails remain online-only and are not downloaded, transcoded, bundled, or placed in the service-worker cache. Existing bilingual setup, execution, cue, mistake, and safety text remains the universal fallback.

### Installable pack

Use an independently versioned, deterministic animation-pack format. Version 1 is a ZIP container with a JSON manifest and glTF 2.0/GLB-compatible assets. This records an interchange and integrity boundary; it does not authorize a renderer dependency until a later benchmark packet selects one.

The manifest must include:

- immutable pack, animation, and exact exercise-variant IDs;
- pack schema, animation catalog, and player protocol versions;
- semantic pack version and minimum compatible app version;
- every entry path, media type, clip name, duration, byte size, and SHA-256;
- rig/model compatibility, camera and loop metadata needed for deterministic playback;
- source, author, license/terms URL, explicit offline redistribution scope, attribution, modifications, and review date for every bundled byte;
- whole-pack byte size and SHA-256.

An installed pack is reproducible public content, not personal data. It is excluded from backup. Installation follows stage -> verify -> activate, retains one previous verified pack for rollback, and cannot update workout history, routines, sessions, custom exercises, nutrition data, pantry, saved plans, or backups.

### Independent versions

Reserve these design-level version boundaries:

| Boundary | Initial value | Changes when |
| --- | ---: | --- |
| Animation pack schema | 1 | Manifest/container compatibility changes |
| Animation player protocol | 1 | Player request or asset/runtime compatibility changes |
| Animation catalog | 1 | Reviewed variant-to-animation mapping changes |
| Pack release | independent semantic version | Assets or reviewed metadata change |

FOUNDATION-01 does not change the runtime app `0.7.0`, database `5`, catalog `3`, backup `5`, or nutrition-pack schema `3`. The executable contract packet decides the next app/catalog release. The storage packet decides whether a DB6 table is necessary and must provide migration/rollback tests if it is.

### Contract boundary

Later packets will add public contracts corresponding to `AnimationPackManifest`, `AnimationPackEntry`, `AnimationAssetDescriptor`, `AnimationSourceRecord`, `InstalledAnimationPack`, `AnimationPlayerRequest`, `AnimationPlayerState`, and `AnimationPackError` as proposed in `docs/ai/master-plan.md`.

Mapping is exact-variant only. A missing animation must never silently display another equipment variant's motion. Stable IDs are immutable; corrections deprecate and redirect rather than reuse. Workout records do not depend on animation bytes or player versions.

### Sequential delivery

Complete contract, builder, storage, and player foundation packets before a 10–12 variant pilot. The pilot must pass cold review, licensing, deterministic build, corruption/rollback, offline relaunch, accessibility, and physical iPhone performance gates before any production wave toward all 199 reviewed variants.

## Acceptance criteria for later implementation

1. A deterministic rebuild produces the same manifest and pack SHA-256.
2. Every bundled byte has explicit offline redistribution rights and complete attribution; unclear sources are excluded.
3. The installed pilot resolves exactly 10–12 declared equipment variants, with no cross-variant fallback.
4. Network-disabled relaunch plays installed animations and preserves bilingual text fallback.
5. Interrupted, corrupt, size-mismatched, checksum-mismatched, incompatible, quota-failed, and activation-failed installs retain the current verified pack.
6. Install, update, removal, and rollback do not alter personal tables or historical snapshots.
7. The player has keyboard and VoiceOver labels, visible non-motion controls, reduced-motion behavior, 320/390 px coverage, and a text-only failure state.
8. Pilot evidence records iPhone first-frame time, steady playback, memory, storage, battery/thermal behavior, and offline relaunch before bulk production.
9. Animation payloads remain outside the PWA precache, and a PWA update still cannot activate during an active workout.
10. External video remains optional, privacy-enhanced, online-only, and source-attributed.

## Consequences

- The architecture gains a second optional offline public pack beside the nutrition pack, but personal backup ownership does not expand.
- Storage and player implementation require explicit future packets and may not be inferred from this ADR.
- Release size is controlled by optional wave packs rather than the core PWA.
- Licenses and deterministic provenance become hard release gates, not post-production documentation.
- The pilot can block bulk production without affecting existing workout, nutrition, or video behavior.

## Rejected alternatives

- **Cache YouTube video for offline use:** rejected because provider content is not authorized for redistribution and existing policy prohibits it.
- **Bundle all 199 animations in the core PWA:** rejected due to install size, update coupling, iPhone memory risk, and inability to roll back assets independently.
- **Produce all assets before foundation work:** rejected because pack/player/rig changes would multiply rework and license review risk.
- **Use animation from a similar equipment variant:** rejected because it can teach the wrong setup and violates exact-variant semantics.
- **Store pack data in personal backup:** rejected because packs are reproducible release artifacts and would make backups large and version-coupled.
