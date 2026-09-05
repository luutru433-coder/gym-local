# Owner verification and optional cold review procedure

## Purpose

Owner verification decides whether one immutable candidate packet is authorized to merge. It uses `gpt-5.6-sol`, runs without subagents, and leaves a repository audit record. Cold review remains available as advisory evidence but is neither required for packet completion nor a merge gate.

## Required inputs

The owner verifies:

1. Root and applicable nested `AGENTS.md` files.
2. `docs/ai/master-plan.md` and the exact coordinate packet.
3. The immutable candidate diff from `base_commit` through `candidate_commit`.
4. The packet handoff, command evidence, renders, manifests, checksums, license records, and accepted ADRs required by the packet.
5. The post-candidate metadata diff, which may contain only paths explicitly declared by the packet.
6. Any optional cold-review report requested for this packet.

If a required input is absent, the candidate cannot be resolved, or authority is ambiguous, record `BLOCKED` and keep `merge_authorized: false`.

## Verification order

1. Verify model, packet ID, immutable base and candidate commits, target branch, one-packet scope, and declared metadata paths.
2. Compare every changed path with `allowed_paths`; an out-of-scope change is `REJECTED`, while an unresolved authority boundary is `BLOCKED`.
3. Check every stop gate and confirm work did not continue through a triggered gate.
4. Review decisions and contracts for compatibility, immutable IDs, exact equipment-variant mapping, offline behavior, personal-data safety, rollback, and optional external-video fallback.
5. Trace every bundled or proposed asset to author, source, license or terms, redistribution right, attribution, modification record, and review date.
6. Match every acceptance criterion to concrete evidence.
7. Confirm every required command ran against the candidate, passed, and is proportional to the packet.
8. Review mobile, keyboard, VoiceOver, reduced-motion, failed-network, corrupt-pack, quota, update, and rollback evidence when applicable.
9. Review known and newly found risks. Every risk allowed to remain must be listed in `accepted_risks`; an unaccepted material risk requires `REJECTED` or `BLOCKED`.
10. Write the owner-verification record in the schema-valid handoff and commit the packet-declared approval metadata.

## Owner-verification statuses

- `APPROVED`: deliverables, scope, acceptance criteria, and required checks have evidence; remaining risks are explicitly accepted. This is the only status that may set `merge_authorized: true`.
- `REJECTED`: the packet is reviewable but has actionable defects. Set `merge_authorized: false` and issue a bounded fixer packet if work should continue.
- `BLOCKED`: evidence, authority, license, base commit, or another prerequisite is missing. Set `merge_authorized: false` and resolve the prerequisite before continuing.

## Owner-verification schema

Store the following object in `docs/ai/reviews/<PACKET-ID>-handoff.yaml` under `owner_verification`:

```yaml
owner_verification:
  schema_version: 1
  packet_id: "PACKET-ID"
  candidate_commit: "40-character commit SHA"
  status: "APPROVED|REJECTED|BLOCKED"
  approved_by: "repository-owner identity or null"
  approved_at: "ISO-8601 timestamp or null"
  checks_verified:
    - command: "command"
      result: "pass|fail|not_run"
      evidence: "summary or report path"
  accepted_risks: []
  merge_authorized: false
```

All nine fields are required. For `APPROVED`, `approved_by` and `approved_at` must be non-null, every required check must appear in `checks_verified` with `result: pass`, and `merge_authorized` may be `true`. For `REJECTED` or `BLOCKED`, `merge_authorized` must be `false`; `approved_by` and `approved_at` are null because approval was not granted. `accepted_risks` is always present, even when empty.

## Optional cold review

The owner may request a separate cold-review task to inspect the packet, immutable candidate diff, evidence, and handoff without inheriting the producer's rationale. It may report `PASS`, `FAIL`, or `BLOCKED` and must not edit files. Its verdict is advisory: it cannot set `merge_authorized`, cannot replace owner verification, and cannot independently complete or reject a packet.

When optional review finds a defect, the owner either requires a bounded fixer packet or records why the residual risk is accepted. A cold-review `PASS` is additional evidence only. No new policy or ledger entry may describe it as the merge gate.

## Fixer loop

After owner `REJECTED`, the coordinator creates a fixer packet referencing only the actionable findings, the same candidate lineage, and the minimum additional `allowed_paths`. The fixer produces a new candidate commit and handoff. The owner verifies the complete updated range again and may optionally request another cold review.

After owner `BLOCKED`, do not create a fixer automatically. Resolve the missing authority, license, input, or base decision first, then issue a new packet from a safe checkpoint.

## Merge gate and audit trail

Merge only when the committed handoff matches the immutable candidate, contains a schema-valid owner verification with `status: APPROVED` and `merge_authorized: true`, and all required checks are recorded as passed. Re-run affected or release checks if merge resolution changes candidate bytes. Record the authorization and resulting commit lineage in the coordinator ledger; never infer approval from chat text alone.

Historical handoffs, cold-review reports, verdicts, waivers, and ledger checkpoints remain immutable evidence. Do not rewrite them into the owner-verification schema or relabel any historical verdict.
