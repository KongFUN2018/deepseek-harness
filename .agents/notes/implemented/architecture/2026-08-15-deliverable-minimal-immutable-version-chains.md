# Agent Note: Deliverable-minimal — immutable version chains behind task-flow acceptance

Status: implemented

English | [中文](2026-08-15-deliverable-minimal-immutable-version-chains.zh.md)

## Problem

The task-flow acceptance chain must reject submissions that build on outdated outputs. The M1 milestone needs a minimal deliverable record: immutable versions per deliverable, a stale-write rejection on save, current-input listing for a phase run, and downstream invalidation — without the M2 impact-propagation machinery.

## Decision

`packages/task-flow/deliverable-minimal` (`@deepseek-ai/dsh-deliverable-minimal`) ships `DeliverableService` bound to `ctx.deliverables`. It is a `TypertRemoteService` with the three frozen M1 `@Remote` methods:

- `saveVersion(deliverableId, expectedBaseVersion, sourceSubmissionId)` creates one immutable version. `expectedBaseVersion` names the version the caller built on (`null` on a root); a base that is no longer the latest, or whose state is not `current`, rejects with `stale-write`. Concurrent saves serialize on an in-service tail — exactly one wins per base.
- `listCurrentInputs(phaseRunId)` returns the phase run's registered input versions whose state is `current`, in registration order; stale, invalid, superseded, and cancelled versions are excluded.
- `invalidateDownstream(rootVersionIds[])` marks the root version and every newer version of its chain stale. The full transitive impact closure and ImpactSnapshot are M2.

The service opens one storageDomain unit named `deliverable_minimal` with `versions` and `phase_inputs` tables. The latest version of a deliverable is derived from the stored records at read time (a linear scan at M1 scale), so no separate index can drift.

Two host-side seams serve the task write chain in the same process: `recordPhaseInputs(phaseRunId, versionIds)` registers a submission's input refs at acceptance, and `getVersion(versionId)` reads one version for the output-exists and source-matches checks. They are non-Remote because the M1 client namespace freezes only the three methods above, and task-local and the engine run in the host process.

The `./invariant` companion checks input-reference integrity on the authoritative change stream: a `phase_inputs` registration naming a version that is not stored fails.

## Alternatives considered

- **A per-deliverable index table** against **deriving the latest version at read time**: M1 deliverable counts make a linear scan acceptable, and the derived head cannot drift from the versions it names; the index lands with M2.
- **Making `recordPhaseInputs`/\`getVersion\` Remote** against **keeping them host-side**: the frozen client namespace lists only the three methods, and the only M1 consumers (task-local, the engine) share the host process.
- **Invalidating only downstream versions** against **also marking the root stale**: an input listing must exclude a root whose source was revoked; marking the root itself first keeps `listCurrentInputs` honest.

## Consequences

- Task-flow acceptance can now reject submissions whose inputs are not current and verify output provenance by source submission, both inside the task write chain.
- `listCurrentInputs` and the linear latest-version scan are O(n) at M1 scale; a per-deliverable index and the impact closure are M2.
- The service opens one domain on the storage-domain facility; a deployment without that facility cannot load it (its `inject` requires it).
- Version writes are the rebuildable projection; the journal commit point stays with the task write chain, and deliverable facts land with the M2 closure.

## Required verification

- The unit suite covers root and chained saves, stale-write rejection on moved and non-current bases, current-input filtering, chain-only invalidation with exactly-once transitions, and restart recovery (15 tests).
- The invariant suite drives the change stream directly: a dangling phase-input reference fails; version puts, other tables, and other domains stay quiet (3 tests).
- The keyless real-Loader e2e boots the full storage stack through `cordis.yml`, chains three versions, rejects a stale write, registers and lists inputs, invalidates downstream, reboots on the same medium, and observes recovery — in both src and lib modes.
