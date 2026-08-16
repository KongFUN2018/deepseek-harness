# Agent Note: Task-flow M2 freeze — edit locks, immutable versions, and stale impact propagation

Status: proposed

English | [中文](2026-08-16-task-flow-m2-freeze.zh.md)

## Problem

Task-flow freezes milestone contracts before packages open. M0 froze the calibrated recipe; M1 froze the workbench slice — the engine injection closure `['tasks', 'recipes', 'agents', 'goals', 'storageDomain', 'workbenchJournal']`, the three-method `ctx.deliverables` Remote namespace, and the journal envelope at `schemaVersion` 1. M1 shipped with deliberately minimal deliverables: chain-only invalidation, no idempotency on `saveVersion`, no dependency edges, no lock, and version writes excluded from the journal. The shipped packages' deferral ledgers name their successor items "M2", and the milestone exit criterion is already fixed: an upstream edit must leave no falsely-valid downstream. Opening M2 without one frozen scope re-litigates package names, service keys, wire changes, and closure rules per package.

## Proposal

M2 is the deliverable-domain milestone: immutable versions with a dependency closure, edit locks as leases, and stale propagation onto the task plane. Three packages over the existing topology, all host-side — M2 adds no client package.

### Package freeze

- `packages/task-flow/deliverable-local` (`@deepseek-ai/dsh-deliverable-local`) replaces `deliverable-minimal` behind the same `ctx.deliverables` key and the same three `@Remote` methods; the replaced package and its bundle row are deleted, and M1-written `deliverable_minimal` media are rejected, not migrated (pre-release stance).
- `packages/task-flow/edit-lock` (`@deepseek-ai/dsh-edit-lock`) ships `ctx.editLock`.
- `packages/task-flow/impact-propagation` (`@deepseek-ai/dsh-impact-propagation`) ships `ctx.impactPropagation`.

### Deliverable versions and the closure

`saveVersion` gains an `idempotencyKey` parameter — same key with identical fields replays the stored version, a different payload under a taken key fails loud by `idempotency-conflict`, mirroring journal append; the `expectedBaseVersion` stale-write rejection is unchanged. Cross-deliverable `dependsOn` edges are registered by the task write chain from each accepted submission's `inputVersions` (through the `onSubmissionAccepted` extension point) — the executor never declares edges, extending M1's caller-claims-ignored rule. `invalidateDownstream` keeps its signature and computes the multi-root transitive closure, persisting and returning an `ImpactSnapshot`: newly stale versions grouped per deliverable, affected phase runs, and the gate results the closure covers. Version writes become journal facts (`deliverable/version-saved`, `deliverable/version-staled`, `deliverable/impact-snapshotted`); the task write chain keeps the submission commit point. A per-deliverable latest-version index replaces the linear scan, and `listCurrentInputs` keeps excluding stale, invalid, superseded, and cancelled products.

### Edit locks

`ctx.editLock` (`inject = ['storageDomain', 'workbenchJournal', 'tasks', 'deliverables']`) serves lease entities — `leaseId`, owner actor, `targetVersionId`, `acquiredAt`, `renewedAt`, `expiresAt`, `entityRevision` — through `acquire` / `renew` / `release` / `listActive`. `acquire` takes an optional `taskId` binding the lease to a task for cancellation release, and validates the target plus freezes the consuming phase runs through the deliverable-local `getVersion` / `listConsumingPhaseRuns` host seams. A held target returns conflict with the current holder and expiry (first-valid-write-wins, the same optimistic concurrency the task domain uses). Expiry is swept lazily on read/acquire plus a timer; releasing on timeout never commits the holder's local buffer. A lease never replaces version comparison — holding a lock exempts no `expectedBaseVersion` check. Pause keeps leases until explicit release or timeout; `cancelling`/`cancelled` tasks release theirs through a `{global: true}` `task/updated` listener. Lease acquisition, renewal, release, and timeout each append a journal fact.

### Applying impact to the task plane

`ctx.impactPropagation.apply(snapshot, mutation)` (`inject = ['deliverables', 'tasks', 'workbenchJournal']`) turns a persisted snapshot into task-side writes: the new `markPhaseStale` task command moves affected phase runs into the terminal `stale` state, and covered gate results are annotated stale so they no longer support a pass verdict. Stale phase runs are never re-executed in place — the engine, woken through the existing events, opens new phase runs, so a revoked pass is re-earned rather than trusted. The upstream-edit flow calls `invalidateDownstream` then `apply`.

### Immediate scheduling freeze

The task service gains `freezePhaseScheduling` / `clearPhaseScheduling`; `PhaseRunRecord.schedulingFrozen` is declared since M1 with no writing command, and M2's edit-lock service owns it — acquiring a lease over a version an active phase run's registered inputs reference freezes that run immediately, and release or expiry clears it. The engine starts no new work for a frozen run while atomic in-flight actions still settle per M1 semantics.

## Alternatives considered

**Human B/C gates in M2.** Rejected: the milestone's exit criterion is the deliverable closure; B/C check write paths and the `awaiting-input`/`awaiting-decision` states belong to the multi-phase milestone (M3), attention inbox persistence to M4 — pulling them in reopens the M1 engine closure for no deliverable-domain need.

**The executor registry and durable recipe storage in M2.** Rejected: both were loose "M2" labels in M1 READMEs; per-kind executor routing presupposes multi-phase recipes (M3) and recipe registration durability has no unassigned milestone need — their labels are re-scoped with this freeze.

**Deriving `saveVersion` idempotency from `(deliverableId, sourceSubmissionId)` instead of a parameter.** Rejected: an executor may save intermediate versions under one submission id, so the pair is not unique; an explicit key keeps retry dedupe honest without constraining the version chain.

**Executor-declared `dependsOn` edges.** Rejected: acceptance is a guarded transition; caller-declared edges would bypass the guard the same way caller-declared currency facts would. The write chain derives edges from the validated submission.

**Folding impact application into `deliverable-local`.** Rejected: marking phase runs and gate results stale is a task-domain guarded transition with its own service lifecycle; `invalidateDownstream` stays a version-side read of the graph and `apply` a task-side write, each behind its owning package.

**Injecting the new services into the engine.** Rejected: the M1 freeze forbids widening the engine closure; the sanctioned composition is independent services driving task commands and reacting to the existing events, which this freeze keeps.

**A lock that also validates writes.** Rejected: a lease is a serialization hint for human edit sessions; coupling it to write validation would create two authorities for one check. Stale-write rejection stays with `expectedBaseVersion`.

## Acceptance criteria

- A two-root closure stales the shared downstream exactly once; the persisted `ImpactSnapshot` replays after restart.
- A submission built on stale inputs is rejected by the write chain with readable problems; `listCurrentInputs` never lists stale products.
- An expired lease frees the target without committing the holder's buffer, and the next `acquire` succeeds; a stale base still rejects with `stale-write` while the lease was live.
- Pause keeps leases; cancel releases them. A lease over a consumed version freezes the referencing phase run's scheduling, and release or expiry unfreezes it.
- `markPhaseStale` phase runs are terminal; the engine opens new phase runs and re-earns any revoked pass.
- A real-Loader composition runs deliverable-local → edit-lock → impact-propagation over the M1 stack with the M1 engine semantics (pause quiescence, recovery without re-running passed phases) still green.

## Risks

The `saveVersion` signature change and the new fact kinds ride the pre-release stance: M1 media are rejected, not migrated — any real task data from M1 evaluation is disposable by design. `markPhaseStale` plus stale gate results narrows what "passed" means; the re-execution-as-new-runs rule must hold for every path that observes a pass, or a revoked pass could masquerade as current. Lease expiry sweeping by timer is host-local; cross-host locking stays out of scope with the rest of multi-host coordination. The B/C-gate and executor-registry labels in shipped READMEs are corrected with this freeze, but their features remain unbuilt — their deferral entries must not be read as M2 scope. The upstream-edit caller of `invalidateDownstream` + `apply` has no shipped UI in M2; acceptance drives it from tests and the executor seam until the workbench frontend milestone owns the flow.
