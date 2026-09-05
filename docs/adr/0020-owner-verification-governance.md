# ADR 0020: Recorded owner verification is the packet merge gate

## Status

Accepted by the repository owner for GOVERNANCE-01.

## Context

The original coordinated-delivery process required a separate cold-review task to return `PASS` before any packet could merge. In practice, several completed foundation packets already needed explicit owner waivers when independent review was unavailable or intentionally skipped. Those waivers were recorded honestly, but the standing rule and the actual owner-controlled workflow had diverged.

The repository is privately governed by one owner. The owner has chosen to make their explicit, evidence-backed verification the authoritative gate while retaining cold review as an optional way to obtain an independent perspective. This changes process metadata only. It does not change product contracts, schemas, runtime behavior, tests, content, or any historical review result.

## Decision

Every future coordinate packet requires an immutable candidate commit, a schema-valid handoff, passing evidence for all packet-required checks, and an owner-verification record. The record contains:

- `schema_version`;
- `packet_id`;
- `candidate_commit`;
- `status`;
- `approved_by`;
- `approved_at`;
- `checks_verified`;
- `accepted_risks`;
- `merge_authorized`.

Allowed statuses are `APPROVED`, `REJECTED`, and `BLOCKED`. Only `APPROVED` may set `merge_authorized: true`. Approval also requires a non-null owner identity and timestamp and passing entries for every required check. Other statuses keep authorization false.

Cold review remains available on request. It is advisory evidence, is not required for completion, and cannot authorize merge. A `PASS`, `FAIL`, or `BLOCKED` cold-review verdict must be presented to the owner, who decides whether to require a fixer, accept a clearly recorded residual risk, or block the packet. Historical cold-review reports, verdicts, waivers, and ledger checkpoints are immutable and are not rewritten or relabeled under this decision.

## Audit trail

Approval is stored as structured YAML inside the packet handoff and committed after the immutable candidate. The handoff identifies the exact candidate SHA, check commands and outcomes, accepted risks, approving owner, approval time, and authorization boolean. The packet declares every path permitted after the candidate. The coordinator ledger records `OWNER_APPROVED` and the candidate lineage without claiming cold-review `PASS`.

Chat instructions establish authority for a task but are not the durable merge record. The committed handoff and ledger are the audit trail. If merge resolution changes candidate bytes, the affected or release checks must be rerun and the approval record refreshed for the resulting candidate.

## Pilot requirements

This decision removes only the mandatory independent cold-review gate. The animation pilot still requires evidence of source and redistribution licenses, deterministic build reproduction, atomic rollback, offline relaunch, exact equipment-variant mapping without fallback, agreed performance budgets, and at least two low-end iPhone test runs. No production animation wave is authorized until those gates pass and owner verification is `APPROVED`.

GOVERNANCE-01 does not continue or revise ANIMATION-PILOT-01. A separate task must create a superseding pilot packet revision under this governance before pilot work resumes.

## Risks and mitigations

Owner self-verification reduces reviewer independence and can miss defects through confirmation bias or incomplete technical depth. The process accepts that governance risk but mitigates it by requiring immutable candidate SHAs, explicit scope checks, reproducible command evidence, enumerated accepted risks, structured approval metadata, and an append-only Git history. The owner can still require cold review for high-risk or unfamiliar work.

The approval record can become stale if bytes change after verification. Restricting post-candidate edits to declared metadata paths and requiring re-verification after merge resolution prevents approval from silently transferring to different content.

## Consequences

- Packet completion and merge authority now match the owner-controlled operating model.
- Optional cold review remains useful without blocking work solely because an independent reviewer is unavailable.
- The owner assumes the residual risk of self-approval and must record that risk rather than implying independent review.
- Existing evidence remains historically accurate and needs no migration.
- Reverting this governance requires a new ADR and packet; deleting or rewriting prior approval records is not an acceptable rollback.
