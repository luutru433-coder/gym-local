# Gym Local coordinated delivery master plan

## Purpose

This document governs the sequential Codex work needed to add licensed offline exercise animation packs without destabilizing Gym Local. It is planning authority, not permission to edit files. Every implementation or review task is authorized only by one coordinate packet under `docs/ai/packets/`.

## Locked operating model

- Use `gpt-5.6-sol`; do not use subagents.
- A coordinator task creates one packet and does not implement it.
- A producer task starts from the packet's immutable base commit, performs preflight, edits only `allowed_paths`, creates a candidate commit, and prepares a schema-valid handoff with exact automated-command evidence.
- Automated verification checks the immutable candidate, scope, handoff schema, required command results, and safety stop gates. Only `PASS` with every required command passed may set `merge_authorized: true`.
- Cold review, owner review, independent review, manual review, named reviewers, and physical-device review are optional evidence only. They have no completion or merge-gate effect, and absent optional evidence is never inferred to have run or passed.
- A fixer task exists after automated `FAIL`, or after `BLOCKED` prerequisites are resolved. It edits only finding-scoped paths and returns through automated verification.
- Merge is allowed only after automated verification records `PASS` with `merge_authorized: true`. Automated `FAIL` or `BLOCKED`, or any triggered safety stop gate, prevents merge.
- Work is sequential even when Codex worktrees are used, because contracts, pack format, storage, player, and content waves depend on prior decisions.

## Product outcome

Gym Local will provide an installable, versioned animation pack for every validated exercise-equipment variant. Installed animations, text guidance, routines, and logs work offline. External instructional video remains an optional online source. Animation packs never enter personal backups and never rewrite user or historical workout data.

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
| Source assets and manifests | `content/animation-packs` or release assets selected by a later packet | Automated provenance validation; no unclear redistribution rights |

## Foundation version decisions

These decisions are accepted at the design level by ADR 0016. They do not change runtime constants in FOUNDATION-01.

- First installable format: `animationPackSchemaVersion = 1`.
- Player boundary: `animationPlayerProtocolVersion = 1`.
- Variant mapping catalog: `animationCatalogVersion = 1`.
- Pack release version is independent from app, workout catalog, database, backup, and nutrition-pack versions.
- A trusted external `AnimationPackReleaseDescriptor`, published outside the archive bytes in an authenticated release index or sidecar, binds immutable `packId` and semantic `version` to `archiveByteSize`, `archiveSha256`, `manifestPath`, `manifestByteSize`, `manifestSha256`, schema/protocol/minimum-app compatibility, and the existing release/provenance metadata. Existing review-named contract fields remain compatibility data and do not require a named human reviewer.
- Version 1 uses a deterministic ZIP container containing a JSON manifest plus glTF 2.0/GLB-compatible assets. The manifest contains neither the complete archive digest nor a digest of its own bytes; it retains deterministic per-asset byte sizes and SHA-256 values plus exact variant/source/license records. A later packet must benchmark the exact decoding/rendering choice before adding a renderer dependency.
- Installation order is trusted descriptor -> stage ZIP -> verify archive size/SHA-256 -> verify the descriptor-selected manifest size/SHA-256 and validate identity/compatibility -> verify per-asset hashes and exact variant/source/license records -> atomic activate. Keep the current and one previous verified pack for rollback.
- Pack binaries and reproducible public metadata are excluded from personal backup. Any future personal animation preference must be separately versioned and backup-reviewed.
- FOUNDATION-01 does not bump app `0.7.0`, database `5`, backup `5`, or catalog `3`. The first runtime contract packet decides the next app/catalog versions; the storage packet decides whether DB6 is necessary.

## Proposed public contracts

The exact TypeScript is deferred to the contract packet. The proposal must preserve these semantic fields:

- `AnimationPackReleaseDescriptor`: trusted external release-index or sidecar record containing immutable pack identity/version, `archiveByteSize`, `archiveSha256`, `manifestPath`, `manifestByteSize`, `manifestSha256`, schema/protocol/minimum-app compatibility, release date, and existing schema-versioned review/provenance fields. Governance does not interpret those compatibility fields as a named-human gate.
- `AnimationPackManifest`: in-archive pack identity, schema/protocol versions, minimum app version, created/reviewed dates, entries, sources, and licenses; it contains neither the complete archive digest nor a digest of its own bytes.
- `AnimationPackEntry`: immutable animation ID, exact exercise variant ID, asset path, clip name, duration, loop window, default camera, equipment props, and accessibility fallback key.
- `AnimationAssetDescriptor`: path, media type, byte size, checksum, compression, rig/model compatibility ID, and source/license ID.
- `AnimationSourceRecord`: author, source URL/path, license ID/URL, redistribution scope, attribution, modifications, and reviewed date.
- `InstalledAnimationPack`: active/staged/previous state, installed bytes, installed time, verification result, and failure-safe pointer metadata.
- `AnimationPlayerRequest`: exact variant ID, animation ID, playback speed, camera preset, mirror mode, and reduced-motion preference.
- `AnimationPlayerState`: idle/loading/ready/playing/paused/failed plus recoverable error and offline fallback.
- `AnimationPackError`: stable codes for incompatible schema/protocol/app, size/checksum mismatch, corrupt archive, missing asset/variant/license, quota, and activation failure.

Contract rules:

- One validated variant resolves to at most one primary installed animation per animation catalog version.
- No animation lookup may fall back to another equipment variant silently.
- Historical workout snapshots do not store or depend on animation bytes.
- Unknown or unavailable animation states fall back to existing text and optional external video.
- Pack IDs and animation IDs are immutable; deprecate and redirect instead of reuse.

## Required automated release evidence

- Deterministic manifest and archive generation, with `manifestByteSize`/`manifestSha256` and `archiveByteSize`/`archiveSha256` recorded only in the trusted external `AnimationPackReleaseDescriptor`.
- Install evidence follows the descriptor trust boundary in order: trust descriptor, stage ZIP, verify archive size/SHA-256, verify and validate the descriptor-selected manifest identity/compatibility, verify every asset's size/SHA-256 and exact variant/source/license records, then atomically activate.
- Machine-validated source, license, redistribution scope, attribution, modification, and provenance metadata for every bundled byte; missing or unclear rights trigger a stop gate.
- Automated static mapping validation for the exact exercise and equipment variant.
- Corrupt, interrupted, incompatible, quota, and rollback tests.
- Automated offline install/relaunch playback tests with the network disabled.
- Automated assertions that install, update, removal, and rollback do not mutate personal data and that pack bytes remain isolated from backups.
- Automated accessibility semantics, keyboard behavior, responsive layout constraints, reduced-motion behavior, and text-fallback tests.
- Required lint, typecheck, architecture audit, unit tests, production build, deterministic build/checksum checks, and configured performance budgets.
- Automated assertions that pack binaries are absent from the service-worker precache and PWA updates remain deferred during active workouts.
- Automated assertions that existing optional-video and bilingual text fallbacks remain usable.

Physical iPhone or other device runs, human VoiceOver use, visual-quality inspection, battery, thermal, memory, biomechanics, motion, equipment, and rights review are optional evidence. They do not block a candidate or merge and must not be described as passed when they were not run.

## Sequential packet roadmap

1. `FOUNDATION-01`: ADR, independent version decisions, contract proposal, acceptance tests on paper, and coordination documents only.
2. `FOUNDATION-02`: executable contract schemas and validation tests; no storage/player implementation.
3. `FOUNDATION-03`: deterministic pack builder, manifest/license validator, and tiny synthetic fixtures only.
4. `FOUNDATION-04`: storage staging, integrity verification, atomic activation, rollback, quota behavior, and migration decision.
5. `FOUNDATION-05`: player boundary, loading/failure states, accessibility shell, and test renderer fixture.
6. `ANIMATION-PILOT-01`: 10–12 representative variants covering bodyweight, dumbbell, barbell, cable, machine, Smith, band, unilateral, seated, and compound/isolation movement patterns.
7. `ANIMATION-WAVE-01...N`: production assets only in validated waves after the pilot automated gate passes.
8. `EXERCISE-DISCOVERY-01`: discovery and substitution using exact variant/equipment capabilities.
9. `WORKOUT-INTEGRATION-01`: player placement in active workout without changing exact-variant history semantics.
10. `NUTRITION-ANIMATION-BOUNDARY-01`: confirm nutrition remains independent; no animation coupling unless a later approved product packet exists.
11. `PLAN-LIBRARY-01`: expose validated exercise animation availability in plan discovery without embedding pack data in plans/backups.

## Pilot gate

The pilot's automated verification must pass before any 199-variant production wave begins. It must include 10–12 variants and automated evidence for valid source/license/provenance metadata, deterministic build reproduction and checksums, atomic rollback, offline relaunch, exact equipment-variant mapping with no cross-variant fallback, personal-data safety, backup isolation, required lint/typecheck/architecture/unit/build checks, configured performance budgets, and exclusion of pack binaries from the service-worker precache. Missing or unclear rights, a failed test, a module-boundary violation, or another safety stop gate blocks the pilot. Human or named reviewers and physical iPhone, VoiceOver, visual, battery, thermal, memory, motion, equipment, or other device-run evidence are optional and have no candidate or merge-gate effect.

## Personal-local animation trust domain

ADR 0022 adds a second, non-interchangeable animation trust domain: personal-local GLB imports are unreviewed device-only material in a separate `@gym/storage` OPFS namespace. They use exact immutable local ID plus case-sensitive variant binding, remain absent from backup, transfer, build, precache, and network paths, and can never satisfy or relax release-pack source, license, provenance, catalog, or review gates. Active-workout consumption remains deferred to a later packet.

## Packet completion rule

A packet is complete and mergeable only when an immutable candidate commit exists, its diff is within `allowed_paths`, a schema-valid handoff exists, every required automated command records `pass`, no safety stop gate is triggered, and automated verification records `status: PASS` with `merge_authorized: true`. No `APPROVED`, cold-review `PASS`, `OWNER_APPROVED`, named reviewer, owner verification, manual review, or device evidence is required. Optional evidence never substitutes for required automated results and is never inferred to have run.
