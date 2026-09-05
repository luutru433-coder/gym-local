# Automated verification procedure

## Purpose

Automated verification decides whether one immutable candidate packet is complete and mergeable. It uses `gpt-5.6-sol` without subagents to execute and record deterministic checks, but authorization is derived from machine-verifiable results rather than a human verdict. Cold review, owner review, independent review, manual review, named reviewers, and physical-device review are optional evidence with no gate effect.

## Required inputs

Automated verification consumes:

1. Root and applicable nested `AGENTS.md` files.
2. `docs/ai/master-plan.md` and the exact coordinate packet.
3. The immutable candidate diff from `base_commit` through `candidate_commit`.
4. The schema-valid handoff and exact command output or artifact references required by the packet.
5. The post-candidate metadata diff, containing only paths declared by the packet.

Missing or unresolvable required input produces `BLOCKED` with `merge_authorized: false`.

## Automated evaluation order

1. Resolve the packet ID, base commit, candidate commit, target branch, and one-packet lineage.
2. Compare every changed path with `allowed_paths`. Any out-of-scope path produces `FAIL`; an unresolvable authority boundary produces `BLOCKED`.
3. Parse the handoff and require the automated-verification schema and exact candidate SHA.
4. Execute every `required_checks.automated_commands` entry against the candidate or an explicitly identified immutable artifact.
5. Require every command result to be `pass`; `fail` produces `FAIL` and `not_run` produces `BLOCKED`.
6. Evaluate packet stop gates. Code or data safety errors, missing or unclear license/provenance, scraped or unauthorized assets, module-boundary violations, or test failures prevent `PASS`.
7. For applicable product packets, require automated validation of deterministic builds and checksums, exact equipment-variant mapping, personal-data immutability, offline behavior, rollback, backup isolation, lint, typecheck, architecture, unit tests, production build, and service-worker precache exclusions.
8. Record optional manual evidence exactly as supplied. Absence is represented by an empty list; an unperformed optional check is never inferred or reported as passed.
9. Set `PASS` and `merge_authorized: true` only when steps 1–8 satisfy every required condition.

## Statuses

- `PASS`: every required automated command passed, the candidate and handoff are valid, the diff is in scope, and no safety stop gate is active. This is the only status that may set `merge_authorized: true`.
- `FAIL`: an automated command failed, an out-of-scope change exists, or a safety stop gate was triggered. Set `merge_authorized: false`.
- `BLOCKED`: a required command was not run or required input, authority, source, license, provenance, or immutable commit cannot be resolved. Set `merge_authorized: false`.

## Automated-verification schema

Store this exact object in `docs/ai/reviews/<PACKET-ID>-handoff.yaml` under `automated_verification`:

```yaml
automated_verification:
  schema_version: 1
  packet_id: "PACKET-ID"
  candidate_commit: "40-character SHA"
  status: "PASS|FAIL|BLOCKED"
  checks:
    - command: "exact command"
      result: "pass|fail|not_run"
      evidence: "exact output or artifact"
  optional_manual_evidence: []
  merge_authorized: false
```

All seven fields are required. `status: PASS` requires every packet-required automated command to appear in `checks` with `result: pass`; only then may `merge_authorized` be `true`. `FAIL` and `BLOCKED` require `merge_authorized: false`. `optional_manual_evidence` is always present and may be empty.

## Optional evidence

Cold review, owner review, independent review, rights review, motion or equipment review, visual inspection, human VoiceOver use, and physical-device measurements such as iPhone playback, battery, thermal, or memory are optional. They cannot change automated status, authorize merge, or block a candidate. If recorded, each item must state whether it ran and must not claim `PASS` unless it actually ran and produced that result.

Existing contract fields with review-oriented names remain compatibility data. Automated schema and provenance validation may validate those fields without requiring a named human identity.

## Failure and retry

After `FAIL`, create a bounded fixer packet only for the failed automated checks or triggered stop gates. After `BLOCKED`, resolve the missing input or prerequisite before retrying. Every retry creates a new immutable candidate and reruns the complete required automated command set.

## Merge and checkpoint

Fast-forward merge only when the committed handoff matches the immutable candidate, every required automated command is recorded as passed, no safety stop gate is active, and automated verification has `status: PASS` with `merge_authorized: true`. If merge resolution would change candidate bytes, create a new candidate and rerun verification. Record the lineage and automated result in the coordinator ledger.

Historical packets, handoffs, cold-review reports, owner-verification records, device evidence, verdicts, waivers, and ledger checkpoints remain immutable. They may contain superseded governance language and must not be rewritten or relabeled.
