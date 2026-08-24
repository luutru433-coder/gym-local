# Gym Local coordinated delivery master plan

## Purpose

This document governs the sequential Codex work needed to add licensed offline exercise animation packs without destabilizing Gym Local. It is planning authority, not permission to edit files. Every implementation or review task is authorized only by one coordinate packet under `docs/ai/packets/`.

## Locked operating model

- Use `gpt-5.6-sol`; do not use subagents.
- A coordinator task creates one packet and does not implement it.
- A producer task starts from the packet's immutable base commit, performs preflight, edits only `allowed_paths`, creates a candidate commit, and writes a handoff report.
- A new cold-review task reads only the packet, candidate diff, test evidence, renders, licenses, and handoff report. It does not edit files and returns `PASS`, `FAIL`, or `BLOCKED`.
- A fixer task exists only after `FAIL`, edits only the finding-scoped paths, and must be cold-reviewed again.
- Merge is allowed only after `PASS`. `BLOCKED` stops at the newest safe checkpoint.
- Work is sequential even when Codex worktrees are used, because contracts, pack format, storage, player, and content waves depend on prior decisions.

## Product outcome

Gym Local will provide an installable, versioned animation pack for every reviewed exercise-equipment variant. Installed animations, text guidance, routines, and logs work offline. External instructional video remains an optional online source. Animation packs never enter personal backups and never rewrite user or historical workout data.

## Non-goals

- Do not download, cache, transcode, or redistribute YouTube video or thumbnails.
- Do not scrape animation, model, image, or exercise content.
- Do not generate all 199 production animations before the pilot passes.
- Do not merge history, PRs, or progression between equipment variants.
- Do not put binary pack payloads in the PWA service-worker precache.
- Do not make medical claims or replace the existing bilingual text and safety fallback.

## Architecture direction

The final implementation must preserve the existing dependency direction:

```text
apps/web -> @gym/catalog, @gym/media, @gym/storage, @gym/contracts
@gym/media -> @gym/contracts
@gym/storage -> @gym/contracts
```

Proposed ownership:

| Concern | Owner | Constraint |
| --- | --- | --- |
| Stable variant-to-animation reference | `@gym/catalog` through public contracts | Variant IDs remain immutable |
| Animation manifest and runtime contracts | `@gym/contracts` | Additive and versioned |
| Pack verification, OPFS install, activation, rollback | `@gym/storage` | Atomic; no UI storage access |
| URL/license/runtime policy and player-neutral loading | `@gym/media` | No direct DB access |
| Player controller and accessible UI | `apps/web` composition | Reduced-motion and text fallback required |
| Source assets and manifests | `content/animation-packs` or release assets selected by a later packet | No unclear redistribution rights |

## Foundation version decisions

These decisions are accepted at the design level by ADR 0016. They do not change runtime constants in FOUNDATION-01.

- First installable format: `animationPackSchemaVersion = 1`.
- Player boundary: `animationPlayerProtocolVersion = 1`.
- Variant mapping catalog: `animationCatalogVersion = 1`.
- Pack release version is independent from app, workout catalog, database, backup, and nutrition-pack versions.
- A trusted external `AnimationPackReleaseDescriptor`, published outside the archive bytes in an authenticated release index or sidecar, binds immutable `packId` and semantic `version` to `archiveByteSize`, `archiveSha256`, `manifestPath`, `manifestByteSize`, `manifestSha256`, schema/protocol/minimum-app compatibility, and release/review metadata.
- Version 1 uses a deterministic ZIP container containing a JSON manifest plus glTF 2.0/GLB-compatible assets. The manifest contains neither the complete archive digest nor a digest of its own bytes; it retains deterministic per-asset byte sizes and SHA-256 values plus exact variant/source/license records. A later packet must benchmark the exact decoding/rendering choice before adding a renderer dependency.
- Installation order is trusted descriptor -> stage ZIP -> verify archive size/SHA-256 -> verify the descriptor-selected manifest size/SHA-256 and validate identity/compatibility -> verify per-asset hashes and exact variant/source/license records -> atomic activate. Keep the current and one previous verified pack for rollback.
- Pack binaries and reproducible public metadata are excluded from personal backup. Any future personal animation preference must be separately versioned and backup-reviewed.
- FOUNDATION-01 does not bump app `0.7.0`, database `5`, backup `5`, or catalog `3`. The first runtime contract packet decides the next app/catalog versions; the storage packet decides whether DB6 is necessary.

## Proposed public contracts

The exact TypeScript is deferred to the contract packet. The proposal must preserve these semantic fields:

- `AnimationPackReleaseDescriptor`: trusted external release-index or sidecar record containing immutable pack identity/version, `archiveByteSize`, `archiveSha256`, `manifestPath`, `manifestByteSize`, `manifestSha256`, schema/protocol/minimum-app compatibility, release date, reviewer identity or review-record reference, review date, and approval status.
- `AnimationPackManifest`: in-archive pack identity, schema/protocol versions, minimum app version, created/reviewed dates, entries, sources, and licenses; it contains neither the complete archive digest nor a digest of its own bytes.
- `AnimationPackEntry`: immutable animation ID, exact exercise variant ID, asset path, clip name, duration, loop window, default camera, equipment props, and accessibility fallback key.
- `AnimationAssetDescriptor`: path, media type, byte size, checksum, compression, rig/model compatibility ID, and source/license ID.
- `AnimationSourceRecord`: author, source URL/path, license ID/URL, redistribution scope, attribution, modifications, and reviewed date.
- `InstalledAnimationPack`: active/staged/previous state, installed bytes, installed time, verification result, and failure-safe pointer metadata.
- `AnimationPlayerRequest`: exact variant ID, animation ID, playback speed, camera preset, mirror mode, and reduced-motion preference.
- `AnimationPlayerState`: idle/loading/ready/playing/paused/failed plus recoverable error and offline fallback.
- `AnimationPackError`: stable codes for incompatible schema/protocol/app, size/checksum mismatch, corrupt archive, missing asset/variant/license, quota, and activation failure.

Contract rules:

- One reviewed variant resolves to at most one primary installed animation per animation catalog version.
- No animation lookup may fall back to another equipment variant silently.
- Historical workout snapshots do not store or depend on animation bytes.
- Unknown or unavailable animation states fall back to existing text and optional external video.
- Pack IDs and animation IDs are immutable; deprecate and redirect instead of reuse.

## Required release evidence

- Deterministic manifest and archive generation, with `manifestByteSize`/`manifestSha256` and `archiveByteSize`/`archiveSha256` recorded only in the trusted external `AnimationPackReleaseDescriptor`.
- Install evidence follows the descriptor trust boundary in order: trust descriptor, stage ZIP, verify archive size/SHA-256, verify and validate the descriptor-selected manifest identity/compatibility, verify every asset's size/SHA-256 and exact variant/source/license records, then atomically activate.
- Complete source/license/attribution review for every bundled byte.
- Static mapping audit for exact exercise and equipment variant.
- Corrupt, interrupted, incompatible, quota, and rollback tests.
- Offline install/relaunch playback with the network disabled.
- No personal-data mutation during install, update, removal, or rollback.
- Keyboard, VoiceOver labels, contrast, 320/390 px layout, and `prefers-reduced-motion` behavior.
- iPhone Safari memory, decode, first-frame, playback, battery/thermal, and storage measurements on the pilot.
- Existing optional-video and bilingual text fallback remains usable.
- PWA update remains deferred while a workout is active.

## Sequential packet roadmap

1. `FOUNDATION-01`: ADR, independent version decisions, contract proposal, acceptance tests on paper, and coordination documents only.
2. `FOUNDATION-02`: executable contract schemas and validation tests; no storage/player implementation.
3. `FOUNDATION-03`: deterministic pack builder, manifest/license validator, and tiny synthetic fixtures only.
4. `FOUNDATION-04`: storage staging, integrity verification, atomic activation, rollback, quota behavior, and migration decision.
5. `FOUNDATION-05`: player boundary, loading/failure states, accessibility shell, and test renderer fixture.
6. `ANIMATION-PILOT-01`: 10–12 representative variants covering bodyweight, dumbbell, barbell, cable, machine, Smith, band, unilateral, seated, and compound/isolation movement patterns.
7. `ANIMATION-WAVE-01...N`: production assets only in reviewed waves after the pilot release gate passes.
8. `EXERCISE-DISCOVERY-01`: discovery and substitution using exact variant/equipment capabilities.
9. `WORKOUT-INTEGRATION-01`: player placement in active workout without changing exact-variant history semantics.
10. `NUTRITION-ANIMATION-BOUNDARY-01`: confirm nutrition remains independent; no animation coupling unless a later approved product packet exists.
11. `PLAN-LIBRARY-01`: expose reviewed exercise animation availability in plan discovery without embedding pack data in plans/backups.

## Pilot gate

The pilot must pass before any 199-variant production wave begins. It must include 10–12 variants, at least two low-end iPhone test runs, cold-review `PASS`, confirmed redistribution rights, deterministic reproduction, atomic rollback, offline relaunch, no cross-variant fallback, and agreed performance budgets. A failed or blocked pilot returns to a narrowly scoped fixer packet; it does not authorize bulk asset generation.

## Packet completion rule

A packet is complete only when all deliverables exist, every required check has evidence, the diff is within `allowed_paths`, a candidate commit exists, a schema-valid handoff report exists, and a cold review returns `PASS`. Coordinator notes or conversation summaries are not substitutes for repository evidence.
