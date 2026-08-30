# ADR 0018: Renderer-neutral animation player controller and accessible shell

## Status

Accepted for FOUNDATION-05.

## Context

ADR 0016 defines reviewed, immutable animation-pack contracts and exact equipment-variant identity. ADR 0017 gives `@gym/storage` sole ownership of verified installed bytes and an exact asset-read operation. Neither ADR chooses a production animation renderer or permits UI code to read OPFS directly.

The app needs a lifecycle boundary that can consume one already-verified `Blob`, coordinate an eventual renderer, expose contract-valid state to React, and remain useful when rendering fails or motion is disabled. Selecting a decoder before the animation pilot would turn an unmeasured implementation choice into a dependency, asset, service-worker, and device-performance commitment.

## Decision

### Ownership and injection boundaries

`@gym/media` owns the in-memory animation player controller and its public TypeScript interfaces. The controller depends only on public `@gym/contracts` animation types and parsers. It does not import storage, catalog, app, UI, filesystem, or renderer implementations.

An injected asset loader receives the immutable, validated `AnimationPlayerRequest` and an abort signal. It returns exactly one contract-shaped `AnimationPackEntry`, one `AnimationAssetDescriptor`, and the verified `Blob` for that request. A later integration owner may adapt the public exact-read operation from `@gym/storage`; this controller neither knows pack locations nor searches for an entry.

An injected renderer adapter receives the attached `HTMLElement`, exact verified `Blob`, parsed entry and descriptor, and the same immutable request. Its session owns its rendering resources and implements play, pause, seek, and dispose. The controller owns session lifecycle, not renderer internals. The deterministic adapter in `animation-player.test-renderer.ts` is a test fixture only and is deliberately absent from the public `@gym/media` exports.

The web `ExerciseAnimationPlayer` owns presentation and accessibility only. It consumes the public controller, never reads storage or a catalog, and is not mounted on a feature page by this decision. Existing external video remains byte-identical, optional, online-only, and independently user-started.

### Exact identity and source validation

Every request is parsed with `parseAnimationPlayerRequest` before `loading` can be published or a loader can run. IDs remain case-sensitive and byte-for-byte exact. There is no lowercase conversion, alias, fuzzy match, redirect, equipment substitution, or similar-variant retry.

Before renderer mount, the controller parses the entry and descriptor and requires all of the following:

- entry exercise-variant ID equals the request variant ID;
- entry animation ID equals the request animation ID;
- entry asset ID and path equal the descriptor ID and path;
- entry and descriptor durations agree;
- source and license identities agree;
- the descriptor has a protocol-supported glTF media type;
- blob byte size agrees with the descriptor, and a nonempty blob media type agrees with it.

A variant mismatch becomes `missing_variant`. An animation, asset ID/path, duration, media, byte, or malformed-source mismatch becomes `missing_asset`. A malformed request becomes nonrecoverable `activation_failed`. All of these fail before renderer mount.

### State and commands

The exact initial and post-dispose snapshot is `{ status: "idle", offlineFallback: "none" }`. Every proposed snapshot is passed through `parseAnimationPlayerState`; an invalid internal proposal is replaced by a nonrecoverable `activation_failed` state with text fallback. Published state and nested request/error values are frozen.

The controller follows this command model:

| Current state | Command | Result |
| --- | --- | --- |
| attached | `load` | synchronous `loading`; asynchronous `ready` only after exact source validation and renderer mount |
| `ready` or `paused` | `play` | one session play call, then `playing`; disabled under reduced motion |
| `playing` | `pause` | one session pause call, then `paused` |
| `ready`, `playing`, or `paused` | `seek` | finite input clamped to `[0, duration]`; remains `playing` or becomes `paused` |
| `playing` or `paused` | renderer frame | finite, clamped, generation-scoped monotonic position update |
| `playing` or `paused` | renderer ended | `paused` at duration; replay explicitly seeks to zero before play |
| recoverable `failed` | `retry` | reload only the last byte-for-byte exact request |
| any live state | `detach`, replacement attach/load, or `dispose` | cancel obsolete work and dispose its session exactly once |

Loading never autoplays. Commands that are not valid for the current state are no-ops. Renderer events do not contain application policy and cannot select another identity.

### Cancellation and disposal

Every attach replacement, detach, load, renderer failure, and dispose advances a controller generation. Loader and renderer callbacks capture their generation and attached viewport; callbacks that no longer match cannot publish state. An `AbortController` asks obsolete loaders to stop, but correctness does not depend on loader cooperation.

If a superseded asynchronous mount later returns a session, that session is disposed immediately. A session identity is disposed at most once even when detach, replacement load, failure, and dispose overlap. `dispose` is idempotent, clears subscribers and the retry request, leaves idle state, and makes subsequent commands inert.

Loader errors that already satisfy the public `AnimationPackError` contract are preserved. Unknown loader failures become `missing_asset`. Renderer mount, event, or session-command failures become `activation_failed`. A failed snapshot always selects written text fallback. The shell maps stable recoverability to localized generic text and never displays an exception message or path.

### Reduced motion

A request with `reducedMotion: true` may mount the source so a renderer can expose its first static frame, but controller play is disabled and never calls the renderer session. Ready and paused snapshots use text fallback in this mode.

The web shell observes `(prefers-reduced-motion: reduce)` when `matchMedia` exists. It computes effective reduced motion as the logical OR of the explicit request and operating-system preference. It reloads only when that effective value changes. Consequently, an operating-system change can strengthen a false request to true, while turning the preference off cannot weaken an explicit true request.

### Accessible and resilient shell

React reads snapshots through `useSyncExternalStore`, so state is not mirrored by polling or an effect. The figure is an accessible group with a Vietnamese/English name. The renderer viewport has an exercise-specific image role and label. A polite atomic status region announces lifecycle labels, never per-frame positions.

Play, pause, replay, and retry use native buttons. Position uses a native labeled range with localized current/total text. Unavailable actions are disabled semantically; there are no global keyboard handlers, programmatic focus moves, or autoplay triggers. Written exercise guidance is always present in the DOM, connected to the viewport description, and visibly emphasized for failure and static-reference modes.

Locally prefixed CSS constrains width and overflow, wraps controls, provides 44-pixel minimum targets and visible focus outlines, and stacks controls and metadata below 390 pixels. The reduced-motion media query removes animation, transitions, and smooth scrolling. These source and jsdom checks do not constitute physical Safari, VoiceOver, or 320/390-pixel device validation.

### Offline, production renderer, and protocol boundary

This decision adds no production decoder or renderer, dependency, network call, object URL, canvas, WebGL/WebGPU path, animation asset, pack, catalog mapping, feature-page integration, or service-worker entry. Installed source bytes and written text can remain offline; external video retains its separate online behavior.

The app stays at 0.7.0, database 5, backup 5, catalog 3, animation-pack schema 1, animation-player protocol 1, and animation catalog 1. The controller interfaces are an in-process public `@gym/media` API, not new persisted protocol fields. A future serialized contract change still requires a compatibility decision and ADR.

The ANIMATION-PILOT-01 owner will benchmark candidate production renderers and real content on target iPhones, including decoding, first-frame latency, clip/camera behavior, memory, thermal/battery behavior, and visual quality. The deterministic fixture proves only controller calls, state, races, and disposal; it makes none of those production claims.

## Consequences

- Catalog and workout integrations can compose a stable public controller later without granting UI storage access.
- Exact identity failures remain visible instead of silently mixing performance history or equipment variants.
- Renderer replacement is isolated behind an injected adapter, but every real adapter must independently prove resource cleanup and pilot performance.
- Written instructions remain useful through missing assets, renderer failure, offline operation, and reduced-motion mode.
- The shell exists as an internal tested component only; users see no new route or automatic animation in this packet.
