# @deepseek-ai/dsh-deliverable-minimal

English | [中文](README.zh.md)

Task-flow minimal deliverable versions (`ctx.deliverables`): immutable version chains per deliverable over one storageDomain unit. `saveVersion` rejects writes against a base that is no longer current; `listCurrentInputs` admits only current branch products of one phase run; `invalidateDownstream` marks a root version and every newer version of its chain stale (the full impact closure and ImpactSnapshot are M2).

## Configuration

The service mounts with `inject = ['storageDomain']` and needs no configuration of its own: backend routing belongs to the storage-domain plugin it opens its domain on.

```yaml
- id: storage
  name: '@deepseek-ai/dsh-storage'
- id: storage-json
  name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/storages
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- id: deliverable-minimal
  name: '@deepseek-ai/dsh-deliverable-minimal'
```

## Service contract

### `saveVersion(deliverableId, expectedBaseVersion, sourceSubmissionId)`

Create one immutable version. `expectedBaseVersion` names the version the caller built on (`null` on a root version); a base that is no longer the latest of the deliverable, or whose state is not `current`, rejects with `stale-write`. The returned version carries the monotonic `versionNumber`, the chain link `baseVersionId`, the optional `sourceSubmissionId`, state `current`, and `entityRevision` 1. Concurrent saves serialize; exactly one wins per base.

### `listCurrentInputs(phaseRunId)`

Return the registered input versions of one phase run whose state is `current`, in registration order. Stale, invalid, superseded, and cancelled versions are excluded. The registration itself is written by the task write chain through the host-side `recordPhaseInputs` seam at submission acceptance.

### `invalidateDownstream(rootVersionIds[])`

Mark the root version and every newer version of its chain stale, returning the ids newly transitioned. A root that is already stale is skipped; an unknown root fails with `not-found`. The full transitive impact closure and ImpactSnapshot are M2.

### Host-side seams

`recordPhaseInputs(phaseRunId, versionIds)` registers or replaces a phase run's inputs (the task write chain records a submission's input refs here), and `getVersion(versionId)` reads one version for the output-exists and source-matches checks. Both are non-Remote: the task-local provider and the engine run in the same host process, and the M1 client namespace freezes only the three Remote methods above.

## Invariant

The `./invariant` companion registers under the package name and checks input-reference integrity on the authoritative change stream: a `phase_inputs` registration naming a version that is not stored fails.

## Model Experience

### The version chain behind task-flow acceptance

#### What the model sees

Nothing. `ctx.deliverables` serves the task engine and the workbench UI; no tool, prompt section, or session event exposes deliverable versions to a model request.

#### Token effect

None. Versions travel on the RPC carrier or the storage domain, outside the model request path.

#### KV Cache effect

None. Deliverable versions never enter a prompt, so no prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **No idempotency key on `saveVersion`.** The frozen M1 signature has none; a retried save against a moved base rejects with `stale-write`, and the caller re-reads and retries. Idempotent version creation lands with the M2 deliverable-local provider.
- **Linear latest-version lookup.** `latestVersionOf` scans the versions table; an index per deliverable is deferred to M2.
- **Chain-only downstream.** `invalidateDownstream` marks the same-deliverable chain; cross-deliverable `dependsOn` edges, the transitive closure, and ImpactSnapshot are M2.
- **No journal facts.** Deliverable version writes are the rebuildable projection; the task write chain owns the journal commit point, and deliverable facts land with the M2 closure.
