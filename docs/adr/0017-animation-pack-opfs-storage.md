# ADR 0017: Animation-pack OPFS storage and activation journal

## Status

Accepted for FOUNDATION-04.

## Context

ADR 0016 defines animation packs as reproducible, reviewed public content rather than personal data. A pack can be substantially larger than its manifest, must be installed without duplicating the complete archive in JavaScript memory, and must survive interrupted writes. The active pack and one rollback pack need a failure-safe pointer that cannot expose staged or partially verified bytes.

Gym Local's IndexedDB schema is owned exclusively by `@gym/storage`, but DB1 through DB5 contain personal records and nutrition-pack state. Adding an animation-pack table would require DB6, migration and rollback policy, backup review, and compatibility work despite the archive bytes being replaceable public content. OPFS already provides private, origin-scoped files and close-committed writable streams. It does not provide a portable atomic directory rename, so activation cannot depend on rename.

## Decision

### Ownership and database boundary

`@gym/storage` is the sole owner of animation-pack persistence. Archive bytes, verified metadata, and activation slots live in OPFS. There is no DB6, SQL, Dexie table, `AppSettings` field, or `PersonalDataSnapshot` field. Animation packs remain excluded from backup and restore. UI and other modules use only the public `@gym/storage` status, install, exact asset-read, recovery, rollback, and removal functions; no OPFS handle crosses that boundary.

### OPFS layout

Version 1 uses this exact origin-private layout:

```text
gym-local/animation-packs/v1/
  registry/
    slot-a.json
    slot-b.json
  objects/<pack-id>/<version>/<archive-sha256>/
    owner.json
    descriptor.json
    manifest.json
    archive-index.json
    verified.json
    animation-pack.zip
```

The content-addressed object directory is derived only from a contract-validated trusted descriptor. Archive entry names are never joined to an OPFS path. `owner.json` binds the exact pack ID, semantic version, archive digest, layout version, and Gym Local owner marker. Cleanup resolves the actual directory back to its expected root-relative components, rereads the exact owner marker, and checks current journal references. Aliased, foreign, markerless, mismatched, unreadable, or referenced directories are preserved with a warning.

### Trust and verification order

Installation performs these steps in order:

1. Strictly parse and contract-validate the trusted external release descriptor. Runtime code does not fetch or authenticate it; distribution owns that earlier trust decision.
2. Use an optional quota estimate for an early rejection. An absent or incomplete estimate is not treated as failure.
3. Stream the archive to its content-addressed object while enforcing the descriptor byte count and incrementally calculating SHA-256. Overrun cancels the source without requesting another chunk; underrun and digest mismatch stop before ZIP trust.
4. Close and reread the staged archive, then parse the deliberately small ZIP subset. Version 1 accepts only STORE entries and rejects comments, trailing data, multiple disks, ZIP64, encryption, data descriptors, extras, directories, special files, structural disagreement, overlaps, gaps, CRC mismatch, noncanonical paths, and portable path collisions. Parsing uses bounded `Blob` slices and never extracts a path.
5. Select the descriptor-named manifest; verify its exact byte size and SHA-256; decode strict UTF-8 and strict JSON; validate public contracts, review approval, descriptor identity, current schema/player/catalog versions, and minimum app version.
6. Require the ZIP inventory to equal that manifest plus every declared asset exactly. Verify every asset's size, SHA-256, ZIP CRC, entry relationship, source, license, and review relationship.
7. Write canonical descriptor, manifest, archive index, and verified marker metadata. Reread and fully revalidate the object, including the archive, before it can appear in a journal.
8. Commit a new checksummed journal generation to the inactive or older slot, close it, reread it, and require exact validity. Until that succeeds, the prior selected slot remains authoritative.

Quota failures during either archive or metadata writes map to the public `quota_exceeded` error and do not change the journal.

### Two-slot journal

Each slot is canonical JSON containing layout version `1`, a positive safe-integer generation, exact active and previous object identities or `null`, and the SHA-256 of the canonical record without its checksum. A reader independently validates both slots and selects the valid record with the highest generation. One missing, malformed, torn, checksum-invalid, or stale slot is ignored. Equal valid generations are ambiguous and rejected; unsafe generations and generation overflow are rejected.

A writer increments the selected generation and writes the other or older slot. The write is authoritative only after the writable stream closes and the same slot is reread with an exact checksum and record. The older valid slot is never overwritten first, so a failure at open, write, close, or reread leaves a valid prior generation.

All lifecycle calls share one in-process queue. Install/install, install/rollback, install/remove, and recovery/install therefore observe one monotonically ordered journal history rather than racing writers.

### Recovery, rollback, retention, and removal

Normal relaunch selects the highest valid slot and revalidates its exact active object before reporting availability. If active is invalid, recovery revalidates the exact previous object and commits it as active in a new generation. A valid active object remains available when only its previous object is corrupt; recovery commits a new generation without that invalid previous pointer. If neither object is valid, storage reports animation unavailable with the offline text fallback and does not mutate the journal.

Rollback revalidates both exact object identities and writes a new generation with active and previous swapped. It never searches for a similar pack, version, path, exercise, or equipment variant.

After a successful update, retention is the new active object plus the immediately prior active object. An older previous object is eligible for bounded cleanup only after the new journal commit. Failed updates preserve both selected pointers. Removal first commits an empty registry generation and only then attempts bounded owned-object cleanup.

### Offline and service-worker boundary

Installed text, archive metadata, and animation assets are read from OPFS and work offline. The storage implementation contains no `fetch`, URL, authentication, or other network path. Animation archives are not production assets and are not added to service-worker precache or runtime caching. Existing external video remains optional and online-only.

## Consequences

- Large archives are staged and hashed incrementally; only bounded ZIP metadata, the manifest, and one asset-sized slice are materialized for verification.
- OPFS loss removes replaceable animation content but cannot delete or corrupt personal IndexedDB records or backups.
- Two retained full archives can require temporary space for a third during update. Quota estimates improve diagnostics but write-time quota handling remains mandatory.
- Full object revalidation makes status and asset reads conservative and potentially more expensive, but prevents a stale verified marker from authorizing altered bytes.
- Future layout, archive-format, or journal compatibility changes require a new versioned directory and ADR. They must not silently reinterpret version 1.
