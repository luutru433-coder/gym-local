# ADR 0022: Personal-local animation imports

- Status: Accepted
- Date: 2026-10-22

## Context

Gym Local's release animation packs are distributable product content. They require the strict, reviewable source, license, provenance, checksum, catalog, and compatibility evidence defined by ADRs 0016–0019. A user may also want to preview a GLB they already possess without claiming that it satisfies any release gate.

## Decision

We define two non-interchangeable trust domains:

1. Release packs remain distributable, catalog-bound artifacts. Their existing schemas, validators, builders, OPFS journal, source and license evidence, and review gates remain unchanged.
2. Personal-local animations are unreviewed device-only material. Their additive v1 record uses an immutable `personal-local.*` ID, an exact case-sensitive exercise-variant ID, a content SHA-256, bounded clip/camera/loop metadata, an origin assertion, `personal_local_only` scope, an import timestamp, and literal no-egress fields.

Only `@gym/storage` may read or write the separate `gym-local/personal-local-animations/v1` OPFS namespace. Import accepts one explicitly selected, self-contained GLB 2.0 no larger than 16 MiB, with exactly one finite clip and bounded structures. It rejects external URIs, extensions, malformed or trailing bytes, undeclared payload, and integrity mismatch. A two-slot checksummed registry makes import, activation, recovery, and removal explicit and serialized.

Every read and player request must match both the immutable personal-local ID and the exact variant. There is no alias, normalization, fuzzy mapping, equipment fallback, catalog mutation, release-ID reuse, or active-workout precedence. The media adapter accepts the separate local shape without constructing release manifest, source, license, review, or provenance data.

Personal-local bytes and metadata are never exported, downloaded by the app, shared, uploaded, synchronized, telemetered, backed up, restored, copied to public/content/build inputs, stored in CacheStorage, precached by the service worker, or fed to a release builder. Promotion is impossible through this API; any future distribution requires a release-grade packet and all unchanged release gates.

The Settings UI discloses that material is unreviewed, device-only, absent from backup and transfer, and never distribution-eligible. It preserves written instructions and reduced-motion behavior. Active-workout integration is outside this decision.

## Consequences

- Users can import, list, preview-select, activate, and remove bounded local GLBs without an account or network operation.
- Backup v5, database v5, catalog v3, app 0.7.0, release animation schema/protocol/catalog v1, release storage layout v1, renderer dependency, and PWA update policy do not change.
- Loss of browser origin storage can remove personal-local material; the product intentionally offers no transfer or recovery channel for it.
