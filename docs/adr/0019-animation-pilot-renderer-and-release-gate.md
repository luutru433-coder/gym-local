# ADR 0019: Animation pilot renderer and automated release gate

## Status

Accepted for ANIMATION-PILOT-01-REV-02 when its automated verification passes.

## Context

The renderer-neutral controller from ADR 0018 needs one production GLB adapter. The pilot must also demonstrate deterministic project-authored content without adding pack binaries to Git, the default app bundle, or the service-worker precache. Governance in ADR 0021 makes machine-verifiable evidence the merge gate; human and physical-device observations remain optional and are not inferred.

## Decision

Select direct `three@0.185.1` for the pilot renderer. Its pinned npm integrity is `sha512-5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==`, its license is MIT, and its direct dependency closure is empty. The automated desktop benchmark resolves every candidate from its exact lockfile pin and walks the installed runtime closure. It then sends the same generated 12-variant, two-release Blob set through the actual Three loader/adapter, Babylon GLB loader with `NullEngine`, and model-viewer caching GLTF loader for ten cycles. Operation traces, remote-request attempts, parser and controller counters, disposal state, closure bytes, hard gates, and deterministic scores are computed from those executions. Real wall-clock elapsed timing is measured around the same workload and emitted only as a noncommitted, nonselection diagnostic; it is excluded from the evidence JSON, hard gates, score, ordering, tie-break, and renderer selection.

`three-direct` is the highest-scoring hard-gate passer. Model-viewer passes the measured controller and disposal workload but has a 13-package measured closure and scores lower. Babylon parses and animates every Blob but its `NullEngine` resize observation does not satisfy the comparable controller gate, so the measured report excludes it before scoring can authorize selection. Benchmark-only packages remain development dependencies and cannot enter the default or pilot production bundle. A tie between eligible candidates selects the smaller measured closure.

The adapter accepts one already-verified bounded `Blob` and exact entry/asset/request values. It parses without object URLs or external resource loading, selects the exact clip, draws one static frame before readiness, and implements play, pause, seek, loop, speed, camera, mirror, reduced-motion, resize, visibility suspension, context-loss failure, and idempotent disposal. It owns and releases its RAF, observer, listeners, canvas, scene, mixer, materials, textures, geometry, renderer, and WebGL context. The renderer never imports storage or catalog code.

The two pilot releases use the immutable pack ID `gym-local.animation-pilot-01` and semantic versions `1.0.0` and `1.0.1`. Exactly 12 catalog records map exact case-sensitive exercise/equipment variants. Every GLB is generated deterministically from committed declarative geometry, rig, movement, and prop data authored by Gym Local contributors under MIT. Each GLB is self-contained and contains the exact clip, `rig.gym-local-pilot-v1` metadata, finite monotonic animation tracks, declared prop nodes, and a release sentinel. The releases differ only by semantic version and declared sentinel/provenance metadata.

Generated source roots and release outputs live only under ignored `outputs/animation-pilot`. Two clean materializations per version must match byte-for-byte for GLB, manifest, ZIP, and external descriptor. No release GLB, manifest, ZIP, or descriptor is tracked. Compatibility review fields contain deterministic automation record IDs and dates; they make no human-review claim.

The normal build compiles `__ANIMATION_PILOT__` to false, retains its existing routes, and excludes the pilot composition and `three` renderer from reachable default chunks. Mode `animation-pilot` compiles the local-file harness in, but it accepts only user-selected descriptor and ZIP files. Neither mode fetches animation data. Pack bytes remain in OPFS through `@gym/storage`, outside personal IndexedDB, backup v5, public assets, and service-worker precache.

## Automated release gate

The pilot is eligible for merge only when all packet commands pass against the immutable candidate, all seven evidence reports are finite and schema-valid, exact mapping and provenance relations hold, storage lifecycle and cancellation preserve journal and personal IndexedDB data, backup v5 excludes measured descriptor/manifest/archive/GLB bytes, offline OPFS relaunch renders all 12 verified Blobs with zero animation-network attempts, responsive automation passes at 320 and 390 CSS px, configured size/bundle/disposal budgets pass, protected objects remain unchanged, and the handoff records automated `PASS` with `merge_authorized: true`.

Optional visual, biomechanics, legal, VoiceOver, battery, thermal, memory, or physical-device evidence may be attached but is not required and is never reported as passed when absent.

## Consequences

- The default product behavior and active-workout PWA update deferral remain unchanged.
- A later production wave may reuse the pack format and renderer only after this checkpoint exists; it must not infer visual or biomechanical quality from the automated pilot.
- Changing the renderer package, asset rights, serialized contracts, versions, storage layout, backup ownership, or default product integration requires a separately authorized packet.
