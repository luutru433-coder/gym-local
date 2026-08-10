# ADR 0001: Snapshot live-set targets

- Status: accepted
- Date: 2026-08-10

## Decision

Copy optional rep, duration, and RIR targets from each routine set into the new workout session. Carry variants use `duration_distance`; their existing numeric target range is presented as metres. Completed values continue to be stored separately from targets.

## Compatibility

The new fields are optional and nested inside existing session records. IndexedDB indexes and tables do not change, so database schema version 1 remains valid. Backup version 1 remains backward compatible: old backups without target fields still parse, while new backups preserve them. Round-trip and workout snapshot tests cover the addition.

## Consequences

- A catalog or routine-template update cannot rewrite an active or historical session target.
- Recovered workouts retain the guidance shown when the workout began.
- Distance/duration sets no longer masquerade as repetitions.
