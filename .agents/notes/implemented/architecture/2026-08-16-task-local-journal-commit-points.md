# Agent Note: Task-local — journal commit points and in-chain deliverable validation

Status: implemented

English | [中文](2026-08-16-task-local-journal-commit-points.zh.md)

## Problem

M1 ⑤ needs a real TaskHandle provider: the task projections lived in test memory, the phase-submission protocol requires submission + PhaseRun.activeSubmissionId + journal to commit atomically, and the frozen M1 design requires deliverable-ref validation inside the task write chain instead of widening the engine closure.

## Decision

`packages/task-flow/task-local` (`@deepseek-ai/dsh-task-local`) ships `LocalTaskService extends TaskHandle` bound to `ctx.tasks`, injecting `['storageDomain', 'workbenchJournal', 'deliverables']` — not recipes, which the base class already resolves.

The write chain serializes in the base class: TaskHandle gained a private `writeTail` with a `serialized()` wrapper, so every mutating command (create/mutate/record) runs load → transition → append → put on one promise chain and providers need no locks of their own. Every save hook now carries `WriteProvenance {actor, idempotencyKey}` extracted from the mutation context.

Two protected extension points carry the provider-specific behavior instead of template-method spread: `resolveSubmissionEnvironment` (default returns the caller facts unchanged) and `onSubmissionAccepted` (default no-op). The provider overrides the first to derive `inputsCurrent` (every input version exists, matches its deliverable, and is `current`) and `outputsValid` (every output version exists and carries this submission as source) from the deliverable service — caller claims are ignored — and the second to register the submission's input versions as phase inputs.

Durable writes are journal-first-then-put: `appendFact` runs before the projection put, with `taskFactKey = kind:entityId:entityRevision` as the deterministic idempotency key per projection write, so replay rebuilds every projection and the append is the commit point. A put whose revision is not the stored revision plus one rejects with `stale-revision`. Gate results use the list length as a pseudo-revision with one `gate-check/recorded` fact per position; `saveGateResult` dedupes on submissionId+checkId+recordedAt before appending.

## Verification

- 12 unit tests: fact-per-write journal replay, stale-revision rejection, concurrent-pause serialization, restart recovery on a shared memory medium, input-currency and output-provenance derivation overriding caller claims, phase-input registration, gate dedupe, and the projection-journal invariant (put without fact fails; deletions and other domains stay quiet).
- One real-Loader e2e through a `cordis.yml` fixture (storage → storage-json → storage-domain → recipe → workbench-journal → deliverable-minimal → task-local): full lifecycle with caller-claimed-false acceptance, stale-input rejection, gate dedupe, journal sequence stability, and recovery of state, gate results, and phase inputs after a same-medium restart.

## Alternatives considered

- **Provider-side write locks** against **serializing in the base class**: every TaskHandle provider would re-implement the same chain; one `serialized()` tail keeps the load-transition-save-emit ordering in a single home and providers only implement storage.
- **Validating deliverable refs in the engine closure** against **in the write chain via an extension point**: the frozen M1 engine-core injection list forbids adding `deliverables`; the provider already injects the minimal deliverable service, so the check rides the same command that guards the transition.
- **Trusting caller-supplied environment facts** against **deriving them**: acceptance is a guarded transition; a claim the caller can set would bypass the guard, so the provider derives both flags from stored versions.
- **Append-after-put** against **journal-first-then-put**: a put not yet covered by a fact has no commit point to rebuild from; appending first makes the fact the authority and the put the rebuildable projection.

## Consequences

- A `submission-rejected` problem list can mix phase-state and deliverable-ref problems; assertions use `arrayContaining` rather than full equality.
- The projection-journal invariant listens on `domain/changed` with `{global: true}`, mirroring the workbench-journal append-only companion; gate_results checks every list position while other tables check one fact key.
- Deferred: per-key idempotency indexes (linear scans at M1 scale), caller-supplied gate provenance (engine-owned triple), and cross-host coordination (single-host write chain).
- Bilingual mirrors must align with generator output line by line (nodes in declaration order, edges alphabetical, table rows and config-catalog entries in source order); the pairing gate's link-sequence comparison is the fastest way to locate a misplaced row after restoring a rolled-back mirror.
