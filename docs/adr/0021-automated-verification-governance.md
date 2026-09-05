# ADR 0021: Automated verification is the only packet merge gate

## Status

Accepted for GOVERNANCE-02 when its automated verification passes.

## Context

ADR 0020 replaced mandatory cold review with recorded owner verification. The repository owner has now directed a second governance change: human approval and physical-device review are also removed from packet completion and merge authorization. The goal is a reproducible gate based on immutable Git objects, schemas, command results, and machine-checkable safety conditions.

This decision changes governance only. It does not change runtime contracts, product code, content, tests, dependencies, build configuration, historical evidence, or the safety properties the automated suite must enforce.

## Decision

A packet is complete and mergeable only when all of these machine-verifiable conditions hold:

- an immutable candidate commit exists and has the expected lineage;
- every changed path is within the packet's `allowed_paths`;
- a schema-valid handoff identifies the exact candidate;
- every required automated command ran and passed;
- no stop gate is active for code or data safety, missing or unclear license/provenance, scraped or unauthorized assets, module-boundary violations, or failed tests;
- automated verification records `status: PASS` and `merge_authorized: true`.

The handoff stores an `automated_verification` object with exactly `schema_version`, `packet_id`, `candidate_commit`, `status`, `checks`, `optional_manual_evidence`, and `merge_authorized`. Only `PASS`, with every required check recorded as `pass`, may authorize merge. A failed check produces `FAIL`; a missing check or unresolvable prerequisite produces `BLOCKED`.

Cold review, owner review, independent review, rights review, motion review, equipment review, visual inspection, human VoiceOver use, and physical-device evidence are optional. They cannot complete, block, reject, approve, or authorize a candidate or merge. An absent optional check is represented by an empty list or `not_run` and is never reported as passed.

## Automated protections retained

Applicable packets continue to require automated source/license/provenance metadata validation, rejection of scraped or unclear-rights assets, deterministic builds and checksums, exact equipment-variant mapping, personal-data immutability, offline and rollback behavior, backup isolation, lint, typecheck, architecture audit, unit tests, production build, configured performance budgets, and proof that pack binaries are excluded from service-worker precache.

License automation validates required source URLs or paths, allowlisted license identities and terms, redistribution scope, attribution, modification history, and provenance completeness. Automation cannot cure ambiguous rights: missing, contradictory, or non-allowlisted provenance remains a blocking stop gate until the metadata or asset is replaced.

## Superseded governance

This ADR supersedes ADR 0020's owner-verification gate in full. It also supersedes only the human-review and physical-device gate language in ADR 0016, ADR 0018, historical release notes, and historical packet or handoff text. Their product architecture, accessibility behavior, exact-variant rules, offline guarantees, and recorded historical results remain intact.

Existing contract fields whose names refer to reviewers, review dates, or approval remain compatibility data until a separately authorized contract/version packet changes them. Automated schema and provenance validators may populate or validate those fields without requiring a named human reviewer.

Historical cold-review reports, owner-verification records, device evidence, verdicts, waivers, and coordinator-ledger entries remain immutable. They are evidence of the policy operating at that time and must not be rewritten or relabeled.

## Device and human evidence

Physical iPhone or other device runs, human VoiceOver use, visual-quality inspection, biomechanics assessment, and battery, thermal, memory, decode, first-frame, or playback measurements can still be recorded as optional evidence. They do not block candidate creation or merge. A release checklist may recommend them operationally, but it does not override this packet-completion and merge policy.

Automated accessibility and performance checks remain required when the packet lists them: DOM semantics, keyboard behavior, text fallbacks, responsive constraints, reduced-motion behavior, deterministic performance budgets, resource cleanup, and other machine-testable properties do not become optional merely because a physical device is optional.

## Risks and limits

Automated verification cannot reliably judge visual quality, biomechanics, motion naturalness, equipment fidelity, real assistive-technology experience, hardware-specific regressions, battery or thermal behavior, or every legal nuance of redistribution rights. Removing human and device gates increases the chance that these defects reach merged history.

The accepted mitigation is strict automated scope enforcement, immutable candidates, exact command evidence, schema validation, deterministic artifacts, comprehensive negative tests, provenance allowlists, and blocking on ambiguity rather than treating missing evidence as success. Optional expert or device evidence may improve confidence but never changes the formal gate.

Automation can also be incomplete or incorrectly configured. A passing command is authoritative only for the behaviors it actually tests; it is not evidence that an omitted manual or device check occurred. Changes to verification scripts, contracts, storage, backup, release behavior, or cross-module boundaries continue to require their packet-defined full automated suite.

## Audit trail and rollback

The candidate commit contains the governance policy and this ADR. A distinct handoff/checkpoint commit contains the schema-valid automated-verification record and coordinator-ledger entry. The ledger records `AUTOMATED_PASS`, never `PASS` for a human review, and states that optional manual evidence is empty.

Rollback requires reverting the GOVERNANCE-02 commits and removing its checkpoint tag before any dependent packet is issued. Historical review evidence is never part of rollback. ANIMATION-PILOT-01 and ANIMATION-PILOT-01-REV-01 are not changed here; a separate task must create ANIMATION-PILOT-01-REV-02 before pilot work resumes.
