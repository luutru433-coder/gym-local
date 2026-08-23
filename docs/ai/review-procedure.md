# Cold review procedure

## Purpose

Cold review decides whether one candidate packet is safe to merge. It is a new Codex task using `gpt-5.6-sol`, without subagents and without the producer's conversational rationale. The reviewer does not fix files.

## Inputs

The reviewer reads only:

1. Root and applicable nested `AGENTS.md` files.
2. `docs/ai/master-plan.md`.
3. The exact coordinate packet.
4. The immutable diff from `base_commit` through the candidate branch HEAD.
5. The handoff report and referenced command output, renders, manifests, checksums, and license records.
6. Existing ADRs or contracts explicitly listed by the packet.

If any required input is absent or the candidate commit cannot be resolved, return `BLOCKED`.

## Review order

1. Verify model, packet ID, base commit, branch, clean candidate worktree, and one-packet scope.
2. Compare every changed path with `allowed_paths`. Any unexplained out-of-scope path is `FAIL`; an ambiguous authority boundary is `BLOCKED`.
3. Check every stop gate and confirm the producer did not continue through a triggered gate.
4. Review decisions and contracts for compatibility, immutable IDs, exact equipment-variant mapping, offline behavior, personal-data safety, rollback, and optional external-video fallback.
5. Trace every bundled or proposed asset to author, source, license/terms, redistribution right, attribution, modification record, and review date.
6. Match every acceptance criterion to concrete evidence.
7. Confirm required commands ran on the candidate, passed, and are proportional to the packet.
8. Review mobile, keyboard, VoiceOver, reduced-motion, failed-network, corrupt-pack, quota, update, and rollback evidence when applicable.
9. Review the handoff for omissions, unsupported claims, and unresolved risk.

## Verdicts

- `PASS`: all acceptance criteria and checks have evidence, no stop gate was crossed, licenses are clear, and the diff stays in scope.
- `FAIL`: the packet is reviewable but has one or more actionable defects. Findings must be specific, prioritized, and bounded to the packet.
- `BLOCKED`: evidence, authority, a license, the base commit, or another prerequisite is missing, so a safe correctness verdict is impossible.

Warnings cannot replace a verdict. `PASS_WITH_COMMENTS` is not a valid result.

## Review report schema

Write `docs/ai/reviews/<PACKET-ID>-cold-review.yaml`:

```yaml
schema_version: 1
packet_id: "PACKET-ID"
verdict: "PASS|FAIL|BLOCKED"
reviewed_base_commit: "sha"
reviewed_head_commit: "sha"
reviewed_at: "ISO-8601"
reviewer_model: "gpt-5.6-sol"
scope:
  changed_paths_in_scope: true
  unexpected_paths: []
acceptance:
  - id: "AC-01"
    result: "pass|fail|blocked"
    evidence: []
checks:
  - command: "command"
    result: "pass|fail|not_run"
    evidence: "summary or report path"
licenses:
  result: "pass|fail|blocked|not_applicable"
  findings: []
findings:
  - severity: "P0|P1|P2|P3"
    path: "path"
    issue: "Actionable defect"
    required_fix: "Bounded correction"
residual_risks: []
merge_authorized: false
```

Set `merge_authorized: true` only for `PASS`.

## Fixer loop

After `FAIL`, the coordinator creates a fixer packet that references only the review findings, the same candidate lineage, and the minimum additional `allowed_paths`. The fixer produces a new candidate commit and handoff report. A different cold-review task reviews the complete updated range again.

After `BLOCKED`, do not create a fixer automatically. Resolve the missing authority, license, input, or base decision first, then issue a new packet from a safe checkpoint.

## Merge gate

Merge only when the latest cold-review report is committed, matches the reviewed HEAD/range, says `PASS`, and has `merge_authorized: true`. Re-run release checks if merge resolution changes candidate bytes. Record the merge commit in the coordinator ledger; never infer approval from chat text alone.

